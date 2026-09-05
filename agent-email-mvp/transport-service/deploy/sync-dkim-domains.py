#!/usr/bin/env python3
import os, re, sqlite3, tempfile

db='/var/lib/senderpermit/transport.sqlite'
key='/etc/opendkim/keys/senderpermit.com/mail.private'
domains={'senderpermit.com','inbound.senderpermit.com','bounces.senderpermit.com'}
receiving={'inbound.senderpermit.com'}; recipients=[]
if os.path.exists(db):
    con=sqlite3.connect(db)
    try:
        rows=list(con.execute('select domain,receiving from provisioned_domains'));domains.update(r[0] for r in rows);receiving.update(r[0] for r in rows if r[1])
        recipients=list(con.execute('select recipient from provisioned_recipients'))
    except sqlite3.OperationalError:
        pass
    con.close()
kt=[]; st=[]
for domain in sorted(domains):
    selector=f'mail._domainkey.{domain}'
    kt.append(f'{selector} {domain}:mail:{key}')
    st.append(f'*@{domain} {selector}')
def replace(path,lines,mode=0o640,gid=None):
    data='\n'.join(lines)+'\n'
    old=open(path).read() if os.path.exists(path) else ''
    if old==data:return False
    fd,tmp=tempfile.mkstemp(dir='/etc/opendkim',text=True)
    with os.fdopen(fd,'w') as f:f.write(data)
    os.chmod(tmp,mode);os.chown(tmp,0,os.stat('/etc/opendkim').st_gid if gid is None else gid);os.replace(tmp,path)
    return True
changed=replace('/etc/opendkim/key.table',kt)|replace('/etc/opendkim/signing.table',st)
if changed:os.system('systemctl reload-or-restart opendkim')
transport=['bounces.senderpermit.com senderpermit-bounce:']+[f'{d} senderpermit-inbound:' for d in sorted(receiving)]
recipient_maps=[r'/^[a-f0-9]{32}\.[a-f0-9]{24}@bounces\.senderpermit\.com$/ OK']+[f'/^{re.escape(r[0])}$/ OK' for r in recipients]
postfix_changed=replace('/etc/postfix/senderpermit-bounce-transport',transport,0o644,0)|replace('/etc/postfix/senderpermit-bounce-recipients',recipient_maps,0o644,0)
relay=','.join(['bounces.senderpermit.com']+sorted(receiving))
if postfix_changed:
    os.system(f"postconf -e 'relay_domains={relay}'")
    os.system('postmap /etc/postfix/senderpermit-bounce-transport && postfix reload')
