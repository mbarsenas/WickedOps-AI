import {db} from './db';
import {mail} from './email';
import {HttpError} from './auth';
import {ownsDomain} from './domain-ownership';
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
   if(!owns)throw new HttpError(409,'Add the AgentMail ownership TXT record shown below, then retry. DNS updates can take time to become visible.');
   await sql`UPDATE sending_domains SET ownership_verified_at=now() WHERE id=${id} AND organization_id=${org}`;
  }
  const claimed=await sql`UPDATE sending_domains SET setup_lease_until=now()+interval '2 minutes' WHERE id=${id} AND organization_id=${org} AND provider_id IS NULL AND (setup_lease_until IS NULL OR setup_lease_until<now()) RETURNING id`;
  if(!claimed[0])throw new HttpError(409,'Domain setup is already running. Refresh in a moment.');
  try{
   const created=await mail().domains.create({name:row.name,capabilities:{sending:'enabled',receiving:'disabled'}});
   const provider=created.data||await existingProviderDomain(row.name);
   if(!provider){await sql`UPDATE sending_domains SET status='setup_failed' WHERE id=${id}`;throw new HttpError(502,'The delivery provider could not set up this domain. Retry setup or contact support.');}
   row=(await sql`UPDATE sending_domains SET provider_id=${provider.id} WHERE id=${id} AND organization_id=${org} RETURNING *`)[0];
  }finally{await sql`UPDATE sending_domains SET setup_lease_until=NULL WHERE id=${id} AND organization_id=${org}`;}
 }
 if(verify){const r=await mail().domains.verify(row.provider_id);if(r.error)throw new HttpError(502,'Unable to start verification. Your domain is saved; retry shortly.');}
 const result=await mail().domains.get(row.provider_id);if(result.error||!result.data)throw new HttpError(502,'Unable to refresh domain status. Your domain is saved; retry shortly.');
 const d=result.data;return (await sql`UPDATE sending_domains SET status=${d.status},receiving=${d.capabilities?.receiving||'disabled'},records=${JSON.stringify(d.records)}::jsonb WHERE id=${id} AND organization_id=${org} RETURNING *`)[0];
}
