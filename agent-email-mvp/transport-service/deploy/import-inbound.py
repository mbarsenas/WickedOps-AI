import json,os,urllib.request
accounts=json.loads(os.environ['TRANSPORT_ACCOUNTS'])
pilot=next(a for a in accounts if a['workspace']=='743121e2-2429-49f5-af41-9230fd324643')
request=urllib.request.Request('https://senderpermit.com/api/internal/aws-inbound',data=b'',headers={'User-Agent':'SenderPermit-Inbound/1.0','Authorization':'Bearer '+pilot['token']},method='POST')
with urllib.request.urlopen(request,timeout=120) as response:
    if response.status!=200: raise RuntimeError('Inbound import failed')
print('Inbound import completed')
