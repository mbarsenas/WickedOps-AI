#!/bin/bash
set -euo pipefail
[[ $(id -u) = 0 ]] || exit 1
backup_dir=/var/backups/senderpermit/inbound-$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$backup_dir"
cp /etc/postfix/main.cf /etc/postfix/master.cf "$backup_dir/"
python3 - <<'PY'
import json,os,grp,sqlite3
path='/etc/senderpermit-inbound.json'
config={'database':'/var/lib/senderpermit/transport.sqlite','recipients':{'pilot@inbound.senderpermit.com':'743121e2-2429-49f5-af41-9230fd324643'}}
if os.path.exists(path):
    with open(path) as f: previous=json.load(f)
    previous['recipients'].update(config['recipients']);config=previous
fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o640)
with os.fdopen(fd,'w') as f: json.dump(config,f)
os.chown(path,0,grp.getgrnam('senderpermit').gr_gid)
with sqlite3.connect(config['database']) as db:
    db.execute('CREATE TABLE IF NOT EXISTS inbound(id TEXT PRIMARY KEY,workspace TEXT NOT NULL,payload TEXT NOT NULL,raw BLOB NOT NULL,created INTEGER NOT NULL,acknowledged INTEGER NOT NULL DEFAULT 0)')
PY
grep -q '^inbound.senderpermit.com ' /etc/postfix/senderpermit-bounce-transport || printf 'inbound.senderpermit.com senderpermit-inbound:\n' >> /etc/postfix/senderpermit-bounce-transport
grep -q 'pilot@inbound' /etc/postfix/senderpermit-bounce-recipients || printf '/^pilot@inbound\.senderpermit\.com$/ OK\n' >> /etc/postfix/senderpermit-bounce-recipients
postmap /etc/postfix/senderpermit-bounce-transport
postconf -e 'relay_domains=bounces.senderpermit.com,inbound.senderpermit.com' 'message_size_limit=5000000' 'senderpermit-inbound_destination_recipient_limit=1'
postconf -M 'senderpermit-inbound/unix=senderpermit-inbound unix - n n - 2 pipe flags=q user=senderpermit null_sender=<> argv=/usr/bin/python3 /opt/senderpermit/transport-service/inbound-pipe.py ${recipient} ${sender} ${queue_id}'
postfix check
systemctl reload postfix
systemctl restart senderpermit-intake
