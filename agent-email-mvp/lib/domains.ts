import {db} from './db';
import {mail} from './email';
import {HttpError} from './auth';
import {ownsDomain} from './domain-ownership';
const directPrefix='senderpermit:';
async function directRequest(workspace:string,domain:string,receiving=false){
 const origin=process.env.SENDERPERMIT_TRANSPORT_ORIGIN,token=process.env.SENDERPERMIT_CONTROL_TOKEN;
 if(!origin||!token)throw new HttpError(503,'SenderPermit domain setup is temporarily unavailable. Retry shortly.');
 const r=await fetch(new URL('/v1/control/domains',origin),{method:'POST',redirect:'manual',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({workspace,domain,receiving}),signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw new HttpError(502,'SenderPermit could not set up this domain. Retry shortly or contact support.');
 return await r.json() as {records:{type:string,name:string,value:string,status:string}[]};
}
async function txt(name:string){const u=new URL('https://cloudflare-dns.com/dns-query');u.searchParams.set('name',name);u.searchParams.set('type','TXT');const r=await fetch(u,{headers:{accept:'application/dns-json'},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('DNS lookup failed');const b=await r.json() as {Answer?:{type:number,data:string}[]};return (b.Answer||[]).filter(x=>x.type===16).map(x=>x.data.replace(/"\s*"/g,'').replace(/^"|"$/g,''));}
async function refreshDirect(row:any,org:string){
 const sql=db();const records=(row.records||[]) as {type:string,name:string,value:string,status:string}[];let ok=true;const checked=[];
 for(const record of records){let valid=false;if(record.type==='TXT'){const values=await txt(record.name);valid=record.value.startsWith('v=spf1')?values.some(v=>v.includes('ip4:84.247.132.83')):values.includes(record.value);}checked.push({...record,status:valid?'verified':'pending'});ok&&=valid;}
 return (await sql`UPDATE sending_domains SET status=${ok?'verified':'pending'},records=${JSON.stringify(checked)}::jsonb WHERE id=${row.id} AND organization_id=${org} RETURNING *`)[0];
}
export async function addDomain(name:string,org:string){
 const sql=db();const inserted=await sql`INSERT INTO sending_domains(organization_id,name,status) VALUES(${org},${name},'awaiting_ownership') ON CONFLICT(name) DO NOTHING RETURNING *`;
 if(inserted[0])return inserted[0];const existing=(await sql`SELECT * FROM sending_domains WHERE name=${name} AND organization_id=${org}`)[0];
 if(!existing)throw new HttpError(409,'This domain is already assigned to another workspace. Use that workspace or contact support.');return existing;
}
async function existingProviderDomain(name:string){
 let after:string|undefined;for(let page=0;page<20;page++){const r=await mail().domains.list({limit:100,...(after?{after}:{})});if(r.error||!r.data)throw new HttpError(502,'Domain setup is unavailable. Try again shortly or contact support.');const match=r.data.data.find(d=>d.name.toLowerCase()===name);if(match)return match;if(!r.data.has_more)return null;after=r.data.data.at(-1)?.id;if(!after)return null;}
 throw new HttpError(503,'Domain lookup needs support assistance. Your ownership verification is saved.');
}
export async function refreshDomain(id:string,org:string,verify=false){
 const sql=db();let row=(await sql`SELECT * FROM sending_domains WHERE id=${id} AND organization_id=${org}`)[0];
 if(!row)throw new HttpError(404,'Domain not found.');
 if(!row.provider_id){
  if(!row.ownership_verified_at){let owns=false;try{owns=await ownsDomain(row.name,row.ownership_token);}catch{throw new HttpError(503,'DNS lookup is temporarily unavailable. Please retry.');}
   if(!owns)throw new HttpError(409,'Add the SenderPermit ownership TXT record shown below, then retry. DNS updates can take time to become visible.');
   await sql`UPDATE sending_domains SET ownership_verified_at=now() WHERE id=${id} AND organization_id=${org}`;
  }
  const claimed=await sql`UPDATE sending_domains SET setup_lease_until=now()+interval '2 minutes' WHERE id=${id} AND organization_id=${org} AND provider_id IS NULL AND (setup_lease_until IS NULL OR setup_lease_until<now()) RETURNING id`;
  if(!claimed[0])throw new HttpError(409,'Domain setup is already running. Refresh in a moment.');
  try{
   if(process.env.SENDERPERMIT_DIRECT_DOMAINS==='enabled'){
    const setup=await directRequest(org,row.name);
    row=(await sql`UPDATE sending_domains SET provider_id=${directPrefix+row.name},status='pending',records=${JSON.stringify(setup.records)}::jsonb WHERE id=${id} AND organization_id=${org} RETURNING *`)[0];
   }else{
    const created=await mail().domains.create({name:row.name,capabilities:{sending:'enabled',receiving:'disabled'}});
    const provider=created.data||await existingProviderDomain(row.name);
    if(!provider){await sql`UPDATE sending_domains SET status='setup_failed' WHERE id=${id}`;throw new HttpError(502,'The delivery provider could not set up this domain. Retry setup or contact support.');}
    row=(await sql`UPDATE sending_domains SET provider_id=${provider.id} WHERE id=${id} AND organization_id=${org} RETURNING *`)[0];
   }
  }finally{await sql`UPDATE sending_domains SET setup_lease_until=NULL WHERE id=${id} AND organization_id=${org}`;}
 }
 if(row.provider_id.startsWith(directPrefix))return refreshDirect(row,org);
 if(verify){const r=await mail().domains.verify(row.provider_id);if(r.error)throw new HttpError(502,'Unable to start verification. Your domain is saved; retry shortly.');}
 const result=await mail().domains.get(row.provider_id);if(result.error||!result.data)throw new HttpError(502,'Unable to refresh domain status. Your domain is saved; retry shortly.');
 const d=result.data;return (await sql`UPDATE sending_domains SET status=${d.status},receiving=${d.capabilities?.receiving||'disabled'},records=${JSON.stringify(d.records)}::jsonb WHERE id=${id} AND organization_id=${org} RETURNING *`)[0];
}
export async function enableReceiving(id:string,org:string){const sql=db();const row=(await sql`SELECT * FROM sending_domains WHERE id=${id} AND organization_id=${org}`)[0];if(!row)throw new HttpError(404,'Domain not found.');if(row.provider_id?.startsWith(directPrefix)){await directRequest(org,row.name,true);const records=[...(row.records||[]).filter((r:any)=>r.type!=='MX'),{type:'MX',name:row.name,value:'mail.senderpermit.com',priority:10,status:'pending'}];return (await sql`UPDATE sending_domains SET receiving='enabled',records=${JSON.stringify(records)}::jsonb WHERE id=${id} RETURNING *`)[0];}const d=await refreshDomain(id,org);const result=await mail().domains.update({id:d.provider_id,capabilities:{receiving:'enabled'}});if(result.error)throw new HttpError(502,'Unable to enable receiving.');return refreshDomain(id,org);}
export async function provisionRecipient(org:string,recipient:string){const origin=process.env.SENDERPERMIT_TRANSPORT_ORIGIN,token=process.env.SENDERPERMIT_CONTROL_TOKEN;if(!origin||!token)throw new HttpError(503,'SenderPermit receiving setup is temporarily unavailable.');const r=await fetch(new URL('/v1/control/recipients',origin),{method:'POST',redirect:'manual',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({workspace:org,recipient}),signal:AbortSignal.timeout(10000)});if(!r.ok)throw new HttpError(502,'SenderPermit could not activate this receiving address. Retry shortly.');}
