#!/bin/bash
set -euo pipefail
[[ $(id -u) = 0 ]] || exit 1
backup_dir=/var/backups/senderpermit/bounces-$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$backup_dir"
cp /etc/postfix/main.cf /etc/postfix/master.cf "$backup_dir/"
# Refuse to overwrite another inbound routing configuration.
for option in transport_maps relay_recipient_maps; do
 value=$(postconf -h "$option")
 [[ -z "$value" || "$value" == *senderpermit-bounce* ]] || { echo "Existing $option needs integration"; exit 1; }
done
python3 - <<'PY'
import json, os, secrets, grp
path='/etc/senderpermit/transport.env'
with open(path) as f: lines=f.read().splitlines()
existing=dict(line.split('=',1) for line in lines if '=' in line)
secret=existing.get('BOUNCE_SECRET') or secrets.token_hex(32)
settings={'BOUNCE_DOMAIN':'bounces.senderpermit.com','BOUNCE_SECRET':secret,'TRANSPORT_DB':'/var/lib/senderpermit/transport.sqlite'}
lines=[line for line in lines if not line.startswith(('BOUNCE_SECRET=','BOUNCE_DOMAIN='))]
with open(path,'w') as f: f.write('\n'.join(lines)+'\nBOUNCE_DOMAIN='+settings['BOUNCE_DOMAIN']+'\nBOUNCE_SECRET='+secret+'\n')
config='/etc/senderpermit-bounce.json'
fd=os.open(config,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o640)
with os.fdopen(fd,'w') as f: json.dump(settings,f)
os.chown(config,0,grp.getgrnam('senderpermit').gr_gid)
os.chmod(config,0o640)
PY
printf 'bounces.senderpermit.com senderpermit-bounce:\n' > /etc/postfix/senderpermit-bounce-transport
postmap /etc/postfix/senderpermit-bounce-transport
printf '/^[a-f0-9]{32}\.[a-f0-9]{24}@bounces\.senderpermit\.com$/ OK\n' > /etc/postfix/senderpermit-bounce-recipients
postconf -e 'relay_domains=bounces.senderpermit.com' 'transport_maps=hash:/etc/postfix/senderpermit-bounce-transport' 'relay_recipient_maps=regexp:/etc/postfix/senderpermit-bounce-recipients' 'senderpermit-bounce_destination_recipient_limit=1'
postconf -M 'senderpermit-bounce/unix=senderpermit-bounce unix - n n - 2 pipe flags=Rq user=senderpermit argv=/usr/bin/python3 /opt/senderpermit/transport-service/bounce-pipe.py ${recipient}'
postfix check
systemctl reload postfix
systemctl restart senderpermit-intake
echo 'Bounce route installed; sending worker remains disabled.'
