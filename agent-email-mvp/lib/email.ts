import { Resend } from 'resend';
import { db, audit } from './db';
import { evaluatePolicy } from './policy';
import { proposeReply } from './runtime';
import { HttpError } from './auth';
export function mail(){if(!process.env.RESEND_API_KEY)throw new Error('Email service is not configured');return new Resend(process.env.RESEND_API_KEY);}
export function address(value:string){return (value.match(/<([^<>]+)>/)?.[1]||value).trim().toLowerCase();}
export async function executeAction(id:string,actor:string){
 const sql=db();
 const rows=await sql`SELECT p.*,a.status AS agent_status,a.organization_id FROM proposed_actions p JOIN agents a ON a.id=p.agent_id WHERE p.id=${id}`;
 const a=rows[0];if(!a)throw new HttpError(404,'Action not found.');
 if(a.status==='executed')return {status:'executed'};
 if(a.agent_status!=='active')throw new HttpError(409,'This agent is paused.');
 const approval=await sql`SELECT status FROM approvals WHERE proposed_action_id=${id}`;
 const decisions=await sql`SELECT decision FROM policy_decisions WHERE proposed_action_id=${id}`;
 if(['blocked','rejected'].includes(a.status)||approval[0]?.status==='rejected')throw new HttpError(409,'This action cannot be sent.');
 const payload=a.payload as {from:string;to:string;subject:string;text:string;headers?:Record<string,string>};
 const current=await evaluatePolicy(a.agent_id,a.action_type,{channel:'email',to:payload.to,from:payload.from});
 if(current.decision==='block')throw new HttpError(409,'A current policy blocks this action.');
 if(approval[0]?.status!=='approved' && (decisions[0]?.decision!=='allow'||current.decision!=='allow'))throw new HttpError(409,'Human approval is required.');
 const identity=await sql`SELECT id FROM email_identities WHERE agent_id=${a.agent_id} AND address=${payload.from} AND status='active'`;
 if(!identity[0])throw new HttpError(409,'The sending identity is disabled.');
 const claim=await sql`INSERT INTO action_executions(action_id,state,lease_until) VALUES(${id},'sending',now()+interval '3 minutes') ON CONFLICT(action_id) DO UPDATE SET state='sending',lease_until=now()+interval '3 minutes' WHERE action_executions.state<>'sent' AND (action_executions.lease_until IS NULL OR action_executions.lease_until<now()) AND action_executions.created_at>now()-interval '23 hours' RETURNING action_id`;
 if(!claim[0])throw new HttpError(409,'Already sending, already sent, or outside the safe retry window. Check delivery before retrying.');
 try{
  const sent=await mail().emails.send({...payload,to:[payload.to]},{idempotencyKey:'governed-email/'+id});
  if(sent.error||!sent.data?.id)throw new Error(sent.error?.message||'Email provider did not accept the message');
  await sql.transaction([
   sql`INSERT INTO messages(conversation_id,direction,provider_message_id,from_address,to_address,subject,text_body,sent_at) VALUES(${a.conversation_id},'outbound',${sent.data.id},${payload.from},${payload.to},${payload.subject},${payload.text},now()) ON CONFLICT(provider_message_id) WHERE provider_message_id IS NOT NULL DO NOTHING`,
   sql`UPDATE proposed_actions SET status='executed',updated_at=now() WHERE id=${id}`,
   sql`UPDATE action_executions SET state='sent',provider_id=${sent.data.id},lease_until=NULL,last_error=NULL WHERE action_id=${id}`,
   sql`UPDATE conversations SET last_message_at=now() WHERE id=${a.conversation_id}`,
   sql`INSERT INTO audit_events(organization_id,agent_id,conversation_id,event_type,actor_type,actor_id,data) VALUES(${a.organization_id},${a.agent_id},${a.conversation_id},'email.sent',${actor==='system'?'system':'human'},${actor},${JSON.stringify({action_id:id,provider_id:sent.data.id})}::jsonb)`
  ]);
  return {status:'executed',provider_id:sent.data.id};
 }catch(e){
  await sql.transaction([sql`UPDATE proposed_actions SET status='failed',updated_at=now() WHERE id=${id} AND status<>'executed'`,sql`UPDATE action_executions SET state='failed',lease_until=NULL,last_error=${e instanceof Error?e.message.slice(0,500):'Send failed'} WHERE action_id=${id} AND state<>'sent'`]);
  await audit('email.send_failed',actor,{action_id:id},a.agent_id,a.conversation_id);
  throw new HttpError(502,'Sending failed. Review Actions to retry safely.');
 }
}
export async function ingest(providerId:string){
 const sql=db();
 const claim=await sql`INSERT INTO email_jobs(provider_message_id,status,lease_until,attempts) VALUES(${providerId},'processing',now()+interval '4 minutes',1) ON CONFLICT(provider_message_id) DO UPDATE SET status='processing',lease_until=now()+interval '4 minutes',attempts=email_jobs.attempts+1 WHERE email_jobs.status<>'done' AND (email_jobs.lease_until IS NULL OR email_jobs.lease_until<now()) RETURNING provider_message_id`;
 if(!claim[0]){
  const job=await sql`SELECT status FROM email_jobs WHERE provider_message_id=${providerId}`;
  if(job[0]?.status==='done')return {ok:true,duplicate:true};
  throw new HttpError(503,'Message is processing. Retry later.');
 }
 try{
  const received=await mail().emails.receiving.get(providerId);
  if(received.error||!received.data)throw new Error(received.error?.message||'Unable to retrieve email');
  const email=received.data; const from=address(email.from);
  const recipients=email.to.map(address);
  const identities=await sql`SELECT ei.address,ei.status AS identity_status,a.* FROM email_identities ei JOIN agents a ON a.id=ei.agent_id WHERE ei.address=ANY(${recipients}) ORDER BY ei.created_at`;
  const identity=identities[0];
  if(!identity){await sql`UPDATE email_jobs SET status='done',lease_until=NULL WHERE provider_message_id=${providerId}`;return {ok:true,ignored:true};}
  const headers=(email as unknown as {headers?:Record<string,string>}).headers||{};
  const auto=Object.entries(headers).some(([k,v])=>k.toLowerCase()==='auto-submitted' && v!=='no');
  const own=await sql`SELECT id FROM email_identities WHERE address=${from}`;
  if(auto||own[0]||/^(mailer-daemon|postmaster)@/.test(from)){await audit('email.loop_suppressed','system',{provider_id:providerId},identity.id);await sql`UPDATE email_jobs SET status='done',lease_until=NULL WHERE provider_message_id=${providerId}`;return {ok:true,suppressed:true};}
  const reference=Object.entries(headers).find(([k])=>k.toLowerCase()==='in-reply-to')?.[1];
  const rootReference=Object.entries(headers).find(([k])=>k.toLowerCase()==='references')?.[1]?.split(/\s+/)[0];
  const thread=from+'|'+(rootReference||reference||email.message_id||providerId);
  // References link replies to the root message; sender matching prevents cross-party merges.
  const existing=await sql`SELECT id FROM conversations WHERE agent_id=${identity.id} AND participant_email=${from} AND external_thread_id=${thread} LIMIT 1`;
  const conversationId=existing[0]?.id || (await sql`INSERT INTO conversations(agent_id,external_thread_id,subject,participant_email,last_message_at) VALUES(${identity.id},${thread},${email.subject},${from},now()) ON CONFLICT(agent_id,external_thread_id) DO UPDATE SET last_message_at=now() RETURNING id`)[0].id;
  const messages=await sql`INSERT INTO messages(conversation_id,direction,provider_message_id,from_address,to_address,subject,text_body,html_body,received_at) VALUES(${conversationId},'inbound',${providerId},${from},${identity.address},${email.subject},${email.text||''},${email.html||''},now()) ON CONFLICT(provider_message_id) WHERE provider_message_id IS NOT NULL DO UPDATE SET provider_message_id=EXCLUDED.provider_message_id RETURNING id`;
  const messageId=messages[0].id;
  let action=(await sql`SELECT * FROM proposed_actions WHERE source_message_id=${messageId}`)[0];
  if(!action){
   if(identity.status!=='active'||identity.identity_status!=='active'){
    await audit('email.held','system',{provider_id:providerId,reason:'Agent or identity is paused'},identity.id,conversationId);
    await sql`UPDATE email_jobs SET status='held',lease_until=NULL,last_error='Agent or identity is paused' WHERE provider_message_id=${providerId}`;
    return {ok:true,held:true};
   }
   const history=await sql`SELECT direction,text_body FROM messages WHERE conversation_id=${conversationId} ORDER BY created_at DESC LIMIT 15`;
   const proposal=await proposeReply({instructions:identity.instructions,subject:email.subject,sender:from,message:email.text||String(email.html||'').replace(/<[^>]*>/g,' '),history:JSON.stringify(history.reverse())});
   const payload={from:identity.address,to:from,subject:/^re:/i.test(email.subject)?email.subject:'Re: '+email.subject,text:proposal.reply_text,headers:{'In-Reply-To':email.message_id,'References':[rootReference,email.message_id].filter(Boolean).join(' '),'Auto-Submitted':'auto-replied'}};
   action=(await sql`INSERT INTO proposed_actions(conversation_id,agent_id,source_message_id,action_type,payload,rationale) VALUES(${conversationId},${identity.id},${messageId},'send_email_reply',${JSON.stringify(payload)}::jsonb,${proposal.rationale}) ON CONFLICT(source_message_id) WHERE source_message_id IS NOT NULL DO UPDATE SET source_message_id=EXCLUDED.source_message_id RETURNING *`)[0];
  }
  let decision=(await sql`SELECT * FROM policy_decisions WHERE proposed_action_id=${action.id}`)[0];
  if(!decision){
   const d=await evaluatePolicy(identity.id,action.action_type,{channel:'email',to:from,from:identity.address});
   await sql.transaction([
    sql`INSERT INTO policy_decisions(proposed_action_id,policy_id,decision,reason) VALUES(${action.id},${d.policyId},${d.decision},${d.reason}) ON CONFLICT(proposed_action_id) DO NOTHING`,
    sql`UPDATE proposed_actions SET status=${d.decision==='allow'?'allowed':d.decision==='block'?'blocked':'approval_required'},updated_at=now() WHERE id=${action.id}`,
    sql`INSERT INTO audit_events(organization_id,agent_id,conversation_id,event_type,actor_type,actor_id,data) VALUES(${identity.organization_id},${identity.id},${conversationId},'policy.decision','system','system',${JSON.stringify({action_id:action.id,decision:d.decision,reason:d.reason,provider_id:providerId})}::jsonb)`
   ]);decision=d;
  }
  if(decision.decision==='require_approval')await sql`INSERT INTO approvals(proposed_action_id) VALUES(${action.id}) ON CONFLICT(proposed_action_id) DO NOTHING`;
  if(decision.decision==='allow')await executeAction(action.id,'system');
  await sql`UPDATE email_jobs SET status='done',lease_until=NULL,last_error=NULL WHERE provider_message_id=${providerId}`;
  return {ok:true,conversation_id:conversationId,action_id:action.id,decision:decision.decision};
 }catch(e){
  await sql`UPDATE email_jobs SET status='failed',lease_until=NULL,last_error=${e instanceof Error?e.message.slice(0,500):'Processing failed'} WHERE provider_message_id=${providerId}`;
  throw e;
 }
}

