import { Webhook } from 'svix';
import { ingest } from '../../../../lib/email';
import { db } from '../../../../lib/db';
import { errorResponse } from '../../../../lib/auth';
export async function POST(req:Request){
 const secret=process.env.RESEND_WEBHOOK_SECRET;
 if(!secret)return Response.json({error:'Webhook is not configured'},{status:503});
 const raw=await req.text();if(raw.length>200000)return new Response(null,{status:413});
 let event:any;
 try{event=new Webhook(secret).verify(raw,{'svix-id':req.headers.get('svix-id')||'','svix-timestamp':req.headers.get('svix-timestamp')||'','svix-signature':req.headers.get('svix-signature')||''});}
 catch{return Response.json({error:'Invalid signature'},{status:401});}
 try{
  if(event.type==='email.received')return Response.json(await ingest(event.data.email_id));
  if(['email.delivered','email.bounced','email.failed'].includes(event.type)){
   const sql=db();const id=req.headers.get('svix-id')!;
   await sql`INSERT INTO audit_events(organization_id,agent_id,conversation_id,event_type,actor_type,actor_id,data) SELECT a.organization_id,a.id,m.conversation_id,${event.type},'system','resend',${JSON.stringify({provider_id:event.data.email_id,event_id:id,occurred_at:event.created_at})}::jsonb FROM messages m JOIN conversations c ON c.id=m.conversation_id JOIN agents a ON a.id=c.agent_id WHERE m.provider_message_id=${event.data.email_id} AND NOT EXISTS(SELECT 1 FROM audit_events WHERE data->>'event_id'=${id})`;
  }
  return Response.json({ok:true});
 }catch(e){return errorResponse(e);}
}

