import {db} from './db';
import {enqueueEvent,dispatchWebhooks} from './webhooks';
export async function captureInbound(providerId:string,email:{from:string;to:string[];subject:string;text:string|null}){
 const sql=db();const domains=email.to.map(to=>to.toLowerCase().split('@').pop()!);
 const owners=await sql`SELECT organization_id,name FROM sending_domains WHERE name=ANY(${domains}) AND receiving='enabled'`;
 for(const org of new Set(owners.map(d=>d.organization_id))){
  const owned=new Set(owners.filter(d=>d.organization_id===org).map(d=>d.name));const recipients=email.to.filter(to=>owned.has(to.toLowerCase().split('@').pop()!));
  const row=(await sql`INSERT INTO inbound_emails(organization_id,provider_id,from_address,to_addresses,subject,text_body) VALUES(${org},${providerId},${email.from},${recipients},${email.subject||''},${(email.text||'').slice(0,200000)}) ON CONFLICT(organization_id,provider_id) DO UPDATE SET provider_id=EXCLUDED.provider_id RETURNING id`)[0];
  await enqueueEvent(org,'email.received','received/'+providerId,{id:row.id,from:email.from,to:recipients,subject:email.subject});await dispatchWebhooks(org);
 }
}
