#!/usr/bin/python3
"""Postfix pipe: bounded DSN parsing; temporary failures remain in Postfix's queue."""
import email.policy
import email.parser
import json
import os
import subprocess
import sys
import hashlib
import hmac
import re
import sqlite3
import time
import uuid

try:
    with open('/etc/senderpermit-bounce.json') as config_file:
        os.environ.update(json.load(config_file))
    raw = sys.stdin.buffer.read(1000001)
    if len(raw) > 1000000:
        sys.exit(0)
    message = email.parser.BytesParser(policy=email.policy.default).parsebytes(raw)
    reports = []
    if message.get_content_type() == 'multipart/report' and message.get_param('report-type') == 'delivery-status':
        for part in message.iter_parts():
            if part.get_content_type() != 'message/delivery-status':
                continue
            for block in part.get_payload():
                target = str(block.get('Final-Recipient', ''))
                kind, separator, recipient = target.partition(';')
                if separator and kind.strip().lower() == 'rfc822':
                    reports.append(dict(recipient=recipient.strip(), action=str(block.get('Action', '')).strip().lower(), status=str(block.get('Status', '')).strip()))
    address = sys.argv[1].lower()
    match = re.fullmatch(r'([a-f0-9]{32})\.([a-f0-9]{24})@([a-z0-9.-]+)', address)
    if not match or match[3] != os.environ['BOUNCE_DOMAIN']:
        sys.exit(0)
    signature = hmac.new(os.environ['BOUNCE_SECRET'].encode(), match[1].encode(), hashlib.sha256).hexdigest()[:24]
    if not hmac.compare_digest(signature, match[2]):
        sys.exit(0)
    recipient_id = str(uuid.UUID(match[1]))
    with sqlite3.connect(os.environ['TRANSPORT_DB'], timeout=10) as db:
        db.execute('PRAGMA synchronous=FULL')
        db.execute('CREATE TABLE IF NOT EXISTS bounce_reports(recipient_id TEXT NOT NULL,status TEXT NOT NULL,action TEXT NOT NULL,at INTEGER NOT NULL,UNIQUE(recipient_id,status,action))')
        db.execute('BEGIN IMMEDIATE')
        row = db.execute('SELECT r.recipient,r.state,s.workspace FROM recipients r JOIN submissions s ON s.id=r.submission WHERE r.id=?', (recipient_id,)).fetchone()
        if row and row[1] in ('submitting','mta_accepted','uncertain','deferred','bounced'):
            state = row[1]
            for report in reports:
                action, status = report['action'], report['status']
                if report['recipient'].lower() != row[0].lower():
                    continue
                if not ((action == 'failed' and re.fullmatch(r'5\.\d{1,3}\.\d{1,3}', status)) or (action == 'delayed' and re.fullmatch(r'4\.\d{1,3}\.\d{1,3}', status))):
                    continue
                now = int(time.time()*1000)
                if not db.execute('INSERT OR IGNORE INTO bounce_reports VALUES(?,?,?,?)', (recipient_id,status,action,now)).rowcount:
                    continue
                new_state = 'bounced' if action == 'failed' else 'deferred'
                if state != 'bounced' or new_state == 'bounced':
                    db.execute('UPDATE recipients SET state=?,error=?,lease=NULL WHERE id=?', (new_state,status,recipient_id))
                    db.execute('INSERT INTO events(recipient_id,state,at) VALUES(?,?,?)', (recipient_id,new_state,now))
                    state = new_state
                if action == 'failed' and status == '5.1.1':
                    db.execute('INSERT OR IGNORE INTO suppressions VALUES(?,?,?)', (row[2],row[0].lower(),'dsn:5.1.1'))
    sys.exit(0)
except Exception:
    sys.exit(75)
