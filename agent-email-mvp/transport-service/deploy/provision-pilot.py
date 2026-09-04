import json,secrets
path='/etc/senderpermit/transport.env'
with open(path) as f: lines=f.read().splitlines()
values=dict(line.split('=',1) for line in lines if '=' in line)
accounts=json.loads(values['TRANSPORT_ACCOUNTS'].strip("'"))
workspace='743121e2-2429-49f5-af41-9230fd324643'
account=next((a for a in accounts if a['workspace']==workspace),None)
if account is None:
    account={'workspace':workspace,'domains':[],'token':secrets.token_hex(32)}
    accounts.append(account)
lines=[line for line in lines if not line.startswith('TRANSPORT_ACCOUNTS=')]
with open(path,'w') as f: f.write('\n'.join(lines)+"\nTRANSPORT_ACCOUNTS='"+json.dumps(accounts,separators=(',',':'))+"'\n")
print(account['token'])
