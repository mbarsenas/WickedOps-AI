import {outbound} from './transport/active';
import {z} from 'zod';
import {db} from './db';
import {enqueueEvent,dispatchWebhooks} from './webhooks';
export const emailInput=z.object({from:z.string().trim().email().transform(s=>s.toLowerCase()),to:z.union([z.string().email(),z.array(z.string().email()).min(1).max(50)]).transform(v=>(Array.isArray(v)?v:[v]).map(s=>s.toLowerCase())),subject:z.string().min(1).max(998),text:z.string().min(1).max(200000),reply_to:z.string().email().optional()}).strict();
export async function digest(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(v=>v.toString(16).padStart(2,'0')).join('');}
const fail=(status:number,message:string)=>Response.json({error:{message}},{status});
export async function sendApi(req:Request){
 const sql=db();const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
 if(!/^am_live_[a-f0-9]{64}$/.test(token))return fail(401,'Use a valid Bearer API key.');
 const key=(await sql`SELECT k.id,k.organization_id,o.monthly_limit FROM api_keys k JOIN organizations o ON o.id=k.organization_id WHERE k.key_hash=${await digest(token)} AND k.revoked_at IS NULL`)[0];
 if(!key)return fail(401,'API key is invalid or revoked.');
 const idempotency=req.headers.get('idempotency-key')||'';
 if(!/^[a-zA-Z0-9_./:-]{1,128}$/.test(idempotency))return fail(400,'Provide an Idempotency-Key header (1–128 letters, numbers, or _./:-).');
 const raw=await req.text();if(raw.length>220000)return fail(413,'Request exceeds the message size limit.');
 let body:z.infer<typeof emailInput>;try{body=emailInput.parse(JSON.parse(raw));}catch{return fail(400,'Provide valid from, to, subject, and text fields.');}
 const hash=await digest(JSON.stringify(body));const org=key.organization_id;
 const existing=(await sql`SELECT * FROM email_api_events WHERE organization_id=${org} AND idempotency_key=${idempotency}`)[0];
 if(existing&&existing.payload_hash!==hash)return fail(409,'This Idempotency-Key belongs to a different message.');
 if(existing?.provider_id){if(!existing.provider_id.startsWith('sp_')){await enqueueEvent(org,'email.sent','sent/'+existing.provider_id,{id:existing.provider_id});await dispatchWebhooks(org);}return Response.json({id:existing.provider_id,status:existing.status},{status:200});}
 if(existing?.status==='quota_exceeded')return fail(429,'Monthly send limit reached.');
 if(existing&&Date.now()-new Date(existing.created_at).getTime()>23*3600000)return fail(409,'Retry window expired. Check delivery before creating another send.');
 const domain=(await sql`SELECT id,provider_id FROM sending_domains WHERE organization_id=${org} AND name=${body.from.split('@')[1]} AND status='verified'`)[0];
 if(!domain)return fail(403,'The sending domain must be verified and owned by this workspace.');
 let transport;try{transport=outbound(org,domain.provider_id?.startsWith('senderpermit:'));}catch(e){return fail(503,e instanceof Error?e.message:'Workspace sending is paused.');}
 let row:any;
 if(existing){row=(await sql`UPDATE email_api_events SET lease_until=now()+interval '3 minutes',status='sending' WHERE id=${existing.id} AND provider_id IS NULL AND lease_until<now() RETURNING *`)[0];}
 else{
  row=(await sql`INSERT INTO email_api_events(organization_id,api_key_id,from_address,to_addresses,subject,status,idempotency_key,payload_hash,lease_until) VALUES(${org},${key.id},${body.from},${body.to},${body.subject},'sending',${idempotency},${hash},now()+interval '3 minutes') ON CONFLICT(organization_id,idempotency_key) DO NOTHING RETURNING *`)[0];
 }
 if(!row)return fail(409,'This message is already processing. Retry with the same key after three minutes.');
 if(!row.quota_reserved){
  // Reserve allowance and mark the message in the same statement; retries cannot double-count or bypass quota.
  const quota=await sql`WITH reserved AS(INSERT INTO monthly_usage(organization_id,period,reserved) SELECT ${org},date_trunc('month',${row.created_at}::timestamptz)::date,${body.to.length} WHERE ${body.to.length}<=${key.monthly_limit} ON CONFLICT(organization_id,period) DO UPDATE SET reserved=monthly_usage.reserved+${body.to.length} WHERE monthly_usage.accepted+monthly_usage.reserved+${body.to.length}<=${key.monthly_limit} RETURNING organization_id) UPDATE email_api_events SET quota_reserved=true WHERE id=${row.id} AND EXISTS(SELECT 1 FROM reserved) RETURNING id`;
  if(!quota[0]){await sql`UPDATE email_api_events SET status='quota_exceeded',lease_until=NULL WHERE id=${row.id}`;return fail(429,'Monthly send limit reached.');}
 }
 try{
  const sent=await transport.submit(org,'agentmail/'+row.id,{from:body.from,to:body.to,subject:body.subject,text:body.text,replyTo:body.reply_to});
  await sql.transaction([
   sql`UPDATE email_api_events SET provider_id=${sent.id},status=${sent.stage==='queued'?'queued':'accepted'},lease_until=NULL,error=NULL,updated_at=now() WHERE id=${row.id}`,
   sql`UPDATE monthly_usage SET accepted=accepted+${body.to.length},reserved=GREATEST(0,reserved-${body.to.length}) WHERE organization_id=${org} AND period=date_trunc('month',${row.created_at}::timestamptz)::date`,
   sql`UPDATE api_keys SET last_used_at=now() WHERE id=${key.id}`,
   sql`INSERT INTO audit_events(organization_id,event_type,actor_type,actor_id,data) VALUES(${org},'api.email.accepted','api_key',${key.id},${JSON.stringify({provider_id:sent.id,message_id:row.id})}::jsonb)`
  ]);
  if(sent.stage!=='queued'){await enqueueEvent(org,'email.sent','sent/'+sent.id,{id:sent.id});await dispatchWebhooks(org);}
  return Response.json({id:sent.id,status:sent.stage==='queued'?'queued':'accepted'},{status:202});
 }catch{
  await sql`UPDATE email_api_events SET error='Delivery acceptance is uncertain. Retry with the same Idempotency-Key.',updated_at=now() WHERE id=${row.id} AND provider_id IS NULL`;
  return fail(502,'Delivery acceptance is uncertain. Retry with the same Idempotency-Key after three minutes.');
 }
}
