#!/usr/bin/python3
"""Run on the mail host as root. Injects one synthetic DSN locally; sends no external email."""
import json
import os
import smtplib
import subprocess
import time
import sqlite3
with open('/etc/senderpermit-bounce.json') as f:
    os.environ.update(json.load(f))
os.chdir('/opt/senderpermit')
def node(code):
    return subprocess.check_output(['/opt/senderpermit-node/bin/node','--input-type=module','-e',code],env=os.environ,text=True).strip()
seed=node("""
import {Queue} from './transport-service/queue.mjs';
import {returnPath} from './transport-service/bounces.mjs';
import {randomUUID} from 'node:crypto';
const q=new Queue(process.env.TRANSPORT_DB);
const workspace='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const recipient='bounce-check-'+randomUUID()+'@example.invalid';
const s=q.submit({workspace,message:{from:'check@senderpermit.com',to:[recipient],subject:'Synthetic local bounce verification',text:'Never submitted for delivery.'}},randomUUID(),['senderpermit.com']);
const row=q.db.prepare('SELECT id FROM recipients WHERE submission=?').get(s.id);
q.db.prepare("UPDATE recipients SET state='mta_accepted' WHERE id=?").run(row.id);
console.log(JSON.stringify({id:row.id,address:returnPath(row.id),recipient}));q.close();
""")
record=json.loads(seed)
message=('From: MAILER-DAEMON@mail.senderpermit.com\r\nTo: '+record['address']+'\r\n'
 'Subject: Synthetic local DSN verification\r\nMIME-Version: 1.0\r\n'
 'Content-Type: multipart/report; report-type=delivery-status; boundary="dsn-check"\r\n\r\n'
 '--dsn-check\r\nContent-Type: text/plain\r\n\r\nSynthetic verification.\r\n'
 '--dsn-check\r\nContent-Type: message/delivery-status\r\n\r\n'
 'Reporting-MTA: dns; mail.senderpermit.com\r\n\r\nFinal-Recipient: rfc822; '+record['recipient']+'\r\n'
 'Action: failed\r\nStatus: 5.1.1\r\n\r\n--dsn-check--\r\n')
with smtplib.SMTP('127.0.0.1',25,timeout=10) as smtp:
    smtp.sendmail('',[record['address']],message)
os.environ['VERIFY_RECIPIENT_ID']=record['id']
for _ in range(15):
    state=node("""import {Queue} from './transport-service/queue.mjs';const q=new Queue(process.env.TRANSPORT_DB);const r=q.db.prepare('SELECT state FROM recipients WHERE id=?').get(process.env.VERIFY_RECIPIENT_ID);console.log(r.state);q.close();""")
    if state=='bounced':
        print('PASS: local SMTP -> Postfix pipe -> DSN parser -> correlated bounced status')
        break
    time.sleep(1)
else:
    raise RuntimeError('Bounce was not processed: '+state)
with sqlite3.connect(os.environ['TRANSPORT_DB']) as db:
    assert db.execute('SELECT reason FROM suppressions WHERE workspace=? AND recipient=?',('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',record['recipient'])).fetchone() == ('dsn:5.1.1',)
    count=db.execute('SELECT count(*) FROM bounce_reports WHERE recipient_id=?',(record['id'],)).fetchone()[0]
# Exercise the actual deployed parser again: duplicate, wrong recipient, and forged return address.
for address, content in [(record['address'],message),(record['address'],message.replace(record['recipient'],'wrong@example.invalid')),('0'+record['address'][1:],message)]:
    subprocess.run(['sudo','-u','senderpermit','/usr/bin/python3','/opt/senderpermit/transport-service/bounce-pipe.py',address],input=content.encode(),check=True)
with sqlite3.connect(os.environ['TRANSPORT_DB']) as db:
    assert db.execute('SELECT count(*) FROM bounce_reports WHERE recipient_id=?',(record['id'],)).fetchone()[0] == count
print('PASS: suppression persisted; duplicate, mismatched and forged reports make no extra changes')
