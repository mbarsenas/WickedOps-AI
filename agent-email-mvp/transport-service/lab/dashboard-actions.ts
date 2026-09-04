import {z} from 'zod';
import {db} from '../../lib/db';
import {ingest} from '../../lib/email';
import {sendInbound} from './smtp.mjs';
export async function syncInbox(){
 const r=await fetch('http://127.0.0.1:8025/api/v1/messages?limit=100',{signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error('Local inbox unavailable');
 const messages=(await r.json()).messages;const results=[];const sql=db();
 for(const m of messages.filter((m:any)=>m.To?.some((a:any)=>a.Address==='support@inbox.senderpermit.test'))){
  const id='lab_'+m.ID;const jobs=await sql`SELECT status FROM email_jobs WHERE provider_message_id=${id}`;
  if(jobs[0])continue;
  try{results.push(await ingest(id));}catch{results.push({failed:true});}
 }
 return results;
}
export async function runLocalLab(request:Request,workspace:string){
 if(workspace!==process.env.LAB_WORKSPACE)return Response.json({error:'Local workspace required'},{status:403});
 const body=z.discriminatedUnion('action',[z.object({action:z.literal('receive'),subject:z.string().min(1).max(120).regex(/^[^\r\n]+$/),text:z.string().min(1).max(10000)}),z.object({action:z.literal('sync')})]).parse(await request.json());
 if(body.action==='receive')await sendInbound(body.subject,body.text);
 const results=await syncInbox();return Response.json({ok:true,results});
}
