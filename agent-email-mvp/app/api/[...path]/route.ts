import { z } from 'zod';
import { db,audit,organizationId } from '../../../lib/db';
import { requireAdmin,errorResponse,HttpError } from '../../../lib/auth';
import { mail,ingest,executeAction,address } from '../../../lib/email';
export const dynamic='force-dynamic';
const uuid=z.string().uuid();
export async function GET(req:Request,{params}:{params:Promise<{path:string[]}>}){
 try{const user=await requireAdmin();const {path}=await params;const sql=db();const org=await organizationId();
 const key=path.join('/');
 if(key==='state'){
 const [agents,identities,policies,conversations,approvals,actions,auditRows,jobs,apiKeys,webhookEndpoints,emailApiEvents,stats]=await Promise.all([
  sql`SELECT * FROM agents WHERE organization_id=${org} ORDER BY created_at DESC`,
  sql`SELECT e.*,a.name AS agent_name FROM email_identities e JOIN agents a ON a.id=e.agent_id WHERE a.organization_id=${org} ORDER BY e.created_at DESC`,
  sql`SELECT p.*,a.name AS agent_name FROM policies p JOIN agents a ON a.id=p.agent_id WHERE a.organization_id=${org} ORDER BY p.priority,p.id`,
  sql`SELECT c.*,a.name AS agent_name,(SELECT count(*)::int FROM messages m WHERE m.conversation_id=c.id) AS message_count FROM conversations c JOIN agents a ON a.id=c.agent_id WHERE a.organization_id=${org} ORDER BY c.last_message_at DESC NULLS LAST LIMIT 200`,
  sql`SELECT ap.*,p.payload,p.rationale,p.conversation_id,p.status AS action_status,a.name AS agent_name FROM approvals ap JOIN proposed_actions p ON p.id=ap.proposed_action_id JOIN agents a ON a.id=p.agent_id WHERE a.organization_id=${org} ORDER BY ap.requested_at DESC LIMIT 200`,
  sql`SELECT p.*,a.name AS agent_name,d.decision,d.reason,e.last_error,e.provider_id,e.created_at AS first_send_at,(SELECT status FROM approvals WHERE proposed_action_id=p.id) AS approval_status FROM proposed_actions p JOIN agents a ON a.id=p.agent_id LEFT JOIN policy_decisions d ON d.proposed_action_id=p.id LEFT JOIN action_executions e ON e.action_id=p.id WHERE a.organization_id=${org} ORDER BY p.created_at DESC LIMIT 200`,
  sql`SELECT * FROM audit_events WHERE organization_id=${org} ORDER BY created_at DESC,id DESC LIMIT 200`,
  sql`SELECT provider_message_id,status,attempts,last_error,created_at FROM email_jobs WHERE status IN('failed','held') ORDER BY created_at DESC LIMIT 50`,
  sql`SELECT id,name,key_prefix,last_used_at,created_at,revoked_at FROM api_keys WHERE organization_id=${org} ORDER BY created_at DESC`,
  sql`SELECT id,url,event_types,status,created_at FROM webhook_endpoints WHERE organization_id=${org} ORDER BY created_at DESC`,
  sql`SELECT * FROM email_api_events WHERE organization_id=${org} ORDER BY created_at DESC LIMIT 200`,
  sql`SELECT (SELECT count(*)::int FROM agents WHERE organization_id=${org} AND status='active') AS active_agents,(SELECT count(*)::int FROM conversations c JOIN agents a ON a.id=c.agent_id WHERE a.organization_id=${org}) AS conversations,(SELECT count(*)::int FROM approvals ap JOIN proposed_actions p ON p.id=ap.proposed_action_id JOIN agents a ON a.id=p.agent_id WHERE a.organization_id=${org} AND ap.status='pending') AS pending,(SELECT count(*)::int FROM proposed_actions p JOIN agents a ON a.id=p.agent_id WHERE a.organization_id=${org} AND p.status='executed') AS sent,(SELECT count(*)::int FROM messages m JOIN conversations c ON c.id=m.conversation_id JOIN agents a ON a.id=c.agent_id WHERE a.organization_id=${org}) AS email_events`
 ]);
 return Response.json({agents,identities,policies,conversations,approvals,actions,audit:auditRows,jobs,apiKeys,webhookEndpoints,emailApiEvents,stats:stats[0],user:user.email,config:{database:true,resend:!!process.env.RESEND_API_KEY,ai:!!process.env.OPENAI_API_KEY,webhook:!!process.env.RESEND_WEBHOOK_SECRET,webhook_url:(process.env.APP_BASE_URL||'')+'/api/webhooks/resend',api_base:(process.env.APP_BASE_URL||'')+'/api/v1',model:process.env.OPENAI_MODEL||'gpt-5-mini'}},{headers:{'Cache-Control':'private, no-store'}});
 }
 if(path[0]==='conversations'&&path[1]){
 const id=uuid.parse(path[1]);const rows=await sql`SELECT m.* FROM messages m JOIN conversations c ON c.id=m.conversation_id JOIN agents a ON a.id=c.agent_id WHERE c.id=${id} AND a.organization_id=${org} ORDER BY m.created_at,m.id`;
 return Response.json({messages:rows},{headers:{'Cache-Control':'private, no-store'}});
 }
 if(key==='domains'){const response=await mail().domains.list();if(response.error)throw new Error(response.error.message);return Response.json(response.data);}
 throw new HttpError(404,'Not found.');
 }catch(e){return errorResponse(e);}
}
export async function POST(req:Request,{params}:{params:Promise<{path:string[]}>}){
 try{
 const user=await requireAdmin(req);const {path}=await params;const body=await req.json();const sql=db();const org=await organizationId();
 if(path[0]==='agents'&&path.length===1){
  const b=z.object({name:z.string().trim().min(2).max(100),instructions:z.string().trim().min(10).max(12000)}).parse(body);
  const slug=b.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'-'+crypto.randomUUID().slice(0,8);
  const row=(await sql`INSERT INTO agents(organization_id,name,slug,instructions) VALUES(${org},${b.name},${slug},${b.instructions}) RETURNING *`)[0];
  await audit('agent.created',user.email,{name:b.name},row.id);return Response.json(row,{status:201});
 }
 if(path[0]==='agents'&&path[1]){
  const id=uuid.parse(path[1]);const b=z.object({status:z.enum(['active','paused']).optional(),name:z.string().trim().min(2).max(100).optional(),instructions:z.string().trim().min(10).max(12000).optional()}).parse(body);
  const row=(await sql`UPDATE agents SET status=COALESCE(${b.status??null},status),name=COALESCE(${b.name??null},name),instructions=COALESCE(${b.instructions??null},instructions) WHERE id=${id} AND organization_id=${org} RETURNING *`)[0];
  if(!row)throw new HttpError(404,'Agent not found.');await audit('agent.updated',user.email,b,id);return Response.json(row);
 }
 if(path[0]==='identities'&&path.length===1){
  const b=z.object({agent_id:uuid,address:z.string().trim().email().max(254)}).parse(body);b.address=address(b.address);
  const agent=await sql`SELECT id FROM agents WHERE id=${b.agent_id} AND organization_id=${org}`;if(!agent[0])throw new HttpError(404,'Agent not found.');
  const domains=await mail().domains.list();if(domains.error)throw new HttpError(502,'Unable to verify the sending domain.');
  const domain=b.address.split('@')[1];const match=domains.data?.data.find(d=>d.name===domain&&d.status==='verified');
  if(!match)throw new HttpError(400,'Use a verified Resend domain.');
  const detail=await mail().domains.get(match.id);
  if(detail.error||detail.data?.capabilities?.receiving!=='enabled')throw new HttpError(400,'Receiving must be enabled on this domain in Resend.');
  const existing=await sql`SELECT id FROM email_identities WHERE lower(address)=${b.address}`;if(existing[0])throw new HttpError(409,'That identity is already assigned.');
  const row=(await sql`INSERT INTO email_identities(agent_id,address,provider_domain) VALUES(${b.agent_id},${b.address},${domain}) RETURNING *`)[0];
  await audit('identity.created',user.email,{address:b.address},b.agent_id);return Response.json(row,{status:201});
 }
 if(path[0]==='identities'&&path[1]){
  const id=uuid.parse(path[1]);const b=z.object({status:z.enum(['active','disabled'])}).parse(body);
  const row=(await sql`UPDATE email_identities e SET status=${b.status} FROM agents a WHERE e.id=${id} AND a.id=e.agent_id AND a.organization_id=${org} RETURNING e.*`)[0];
  if(!row)throw new HttpError(404,'Identity not found.');await audit('identity.updated',user.email,{id,status:b.status},row.agent_id);return Response.json(row);
 }
 if(path[0]==='policies'&&path.length===1){
  const b=z.object({agent_id:uuid,name:z.string().trim().min(2).max(120),effect:z.enum(['allow','require_approval','block']),priority:z.number().int().min(0).max(10000),recipient:z.union([z.string().email(),z.literal('')]).optional()}).parse(body);
  const agent=await sql`SELECT id FROM agents WHERE id=${b.agent_id} AND organization_id=${org}`;if(!agent[0])throw new HttpError(404,'Agent not found.');
  const condition={channel:'email',...(b.recipient?{to:b.recipient.toLowerCase()}:{})};
  const row=(await sql`INSERT INTO policies(agent_id,name,action_type,effect,condition_json,priority) VALUES(${b.agent_id},${b.name},'send_email_reply',${b.effect},${JSON.stringify(condition)}::jsonb,${b.priority}) RETURNING *`)[0];
  await audit('policy.created',user.email,{id:row.id,...b},b.agent_id);return Response.json(row,{status:201});
 }
 if(path[0]==='policies'&&path[1]){
  const id=uuid.parse(path[1]);const b=z.object({enabled:z.boolean()}).parse(body);
  const row=(await sql`UPDATE policies p SET enabled=${b.enabled} FROM agents a WHERE p.id=${id} AND a.id=p.agent_id AND a.organization_id=${org} RETURNING p.*`)[0];
  if(!row)throw new HttpError(404,'Policy not found.');await audit('policy.updated',user.email,{id,enabled:b.enabled},row.agent_id);return Response.json(row);
 }
 if(path[0]==='api-keys'&&path.length===1){
  const b=z.object({name:z.string().trim().min(2).max(80)}).parse(body);const secret='am_live_'+crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret));const hash=Array.from(new Uint8Array(digest)).map(v=>v.toString(16).padStart(2,'0')).join('');
  const row=(await sql`INSERT INTO api_keys(organization_id,name,key_prefix,key_hash) VALUES(${org},${b.name},${secret.slice(0,15)},${hash}) RETURNING id,name,key_prefix,created_at`)[0];
  await audit('api_key.created',user.email,{id:row.id,name:b.name});return Response.json({...row,secret},{status:201});
 }
 if(path[0]==='api-keys'&&path[1]&&path[2]==='revoke'){
  const id=uuid.parse(path[1]);const row=(await sql`UPDATE api_keys SET revoked_at=now() WHERE id=${id} AND organization_id=${org} AND revoked_at IS NULL RETURNING id`)[0];
  if(!row)throw new HttpError(404,'Active API key not found.');await audit('api_key.revoked',user.email,{id});return Response.json(row);
 }
 if(path[0]==='webhook-endpoints'&&path.length===1){
  const b=z.object({url:z.string().url().refine(v=>v.startsWith('https://'),'Use an HTTPS URL.'),event_types:z.array(z.enum(['email.received','email.sent','email.failed'])).min(1)}).parse(body);
  const row=(await sql`INSERT INTO webhook_endpoints(organization_id,url,event_types) VALUES(${org},${b.url},${b.event_types}) RETURNING id,url,event_types,status,created_at`)[0];
  await audit('webhook_endpoint.created',user.email,{id:row.id,url:b.url});return Response.json(row,{status:201});
 }
 if(path[0]==='webhook-endpoints'&&path[1]){
  const id=uuid.parse(path[1]);const b=z.object({status:z.enum(['active','disabled'])}).parse(body);const row=(await sql`UPDATE webhook_endpoints SET status=${b.status} WHERE id=${id} AND organization_id=${org} RETURNING *`)[0];
  if(!row)throw new HttpError(404,'Webhook endpoint not found.');await audit('webhook_endpoint.updated',user.email,{id,status:b.status});return Response.json(row);
 }
 if(path[0]==='actions'&&path[2]==='retry'){
  const id=uuid.parse(path[1]);return Response.json(await executeAction(id,user.email));
 }
 if(path[0]==='jobs'&&path[1]==='retry'){
  const b=z.object({provider_message_id:uuid}).parse(body);await audit('email.retry_requested',user.email,b);return Response.json(await ingest(b.provider_message_id));
 }
 throw new HttpError(404,'Not found.');
 }catch(e){return errorResponse(e);}
}

