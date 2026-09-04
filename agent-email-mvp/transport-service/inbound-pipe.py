#!/usr/bin/python3
"""Durably capture mail for explicitly provisioned recipients before acknowledging Postfix."""
import email.parser
import email.policy
import email.utils
import hashlib
import html.parser
import json
import os
import sqlite3
import sys
import time
from contextlib import contextmanager
@contextmanager
def database(path):
    connection=sqlite3.connect(path,timeout=10)
    try:
        with connection: yield connection
    finally: connection.close()

class PlainHTML(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(); self.parts=[]; self.hidden=0
    def handle_starttag(self,tag,attrs):
        if tag in ('script','style'): self.hidden+=1
        if tag in ('p','br','div','li'): self.parts.append('\n')
    def handle_endtag(self,tag):
        if tag in ('script','style'): self.hidden=max(0,self.hidden-1)
    def handle_data(self,data):
        if not self.hidden: self.parts.append(data)

def capture(config,recipient,sender,queue_id,raw):
    recipient=recipient.lower()
    workspace=config['recipients'].get(recipient)
    if not workspace: raise ValueError('Recipient is not provisioned')
    if len(raw)>5000000: raise ValueError('Message exceeds configured size')
    message=email.parser.BytesParser(policy=email.policy.default).parsebytes(raw)
    parsed=email.utils.parseaddr(str(message.get('From','')))[1]
    # An SMTP null sender must never trigger automatic replies.
    source=parsed or sender
    if not source or '@' not in source: source='mailer-daemon@invalid.local'
    part=message.get_body(preferencelist=('plain','html'))
    text=part.get_content() if part else ''
    if not isinstance(text,str): text=''
    if part and part.get_content_type()=='text/html':
        parser=PlainHTML();parser.feed(text);text=''.join(parser.parts)
    headers={k:str(message.get(k,''))[:2000] for k in ('In-Reply-To','References','Auto-Submitted') if message.get(k)}
    if sender in ('','<>','MAILER-DAEMON'): headers['Auto-Submitted']='auto-generated'
    # SMTP recipient controls routing; never route using untrusted To/Cc headers.
    identifier='spi_'+hashlib.sha256((queue_id+'\0'+recipient+'\0').encode()+raw).hexdigest()
    payload={'workspace':workspace,'from':source,'to':[recipient],'subject':str(message.get('Subject',''))[:998],
             'text':text[:200000],'html':None,'message_id':str(message.get('Message-ID') or '<'+identifier+'@inbound.senderpermit.com>')[:998],'headers':headers}
    with database(config['database']) as db:
        db.execute('PRAGMA journal_mode=WAL');db.execute('PRAGMA synchronous=FULL')
        db.execute('CREATE TABLE IF NOT EXISTS inbound(id TEXT PRIMARY KEY,workspace TEXT NOT NULL,payload TEXT NOT NULL,raw BLOB NOT NULL,created INTEGER NOT NULL,acknowledged INTEGER NOT NULL DEFAULT 0)')
        db.execute('BEGIN IMMEDIATE')
        if db.execute('SELECT 1 FROM inbound WHERE id=?',(identifier,)).fetchone(): return identifier
        size=db.execute('SELECT COALESCE(sum(length(raw)),0),count(*) FROM inbound').fetchone()
        if size[0]+len(raw)>512000000 or size[1]>=10000: raise RuntimeError('Inbound storage capacity reached')
        db.execute('INSERT INTO inbound(id,workspace,payload,raw,created) VALUES(?,?,?,?,?)',(identifier,workspace,json.dumps(payload),raw,int(time.time()*1000)))
    return identifier

if __name__=='__main__':
    try:
        with open('/etc/senderpermit-inbound.json') as f: config=json.load(f)
        capture(config,sys.argv[1],sys.argv[2],sys.argv[3],sys.stdin.buffer.read(5000001))
    except Exception:
        # Keep failed captures in Postfix, including disk-full and parsing failures.
        sys.exit(75)
