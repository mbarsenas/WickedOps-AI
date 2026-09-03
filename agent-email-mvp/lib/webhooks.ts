import {db} from './db';
import {publicWebhookUrl,signEvent} from './webhook-signing';
export async function enqueueEvent(org:string,type:string,eventId:string,data:unknown){
 const sql=db();const payload={id:eventId,type,created_at:new Date().toISOString(),data};
 await sql`INSERT INTO webhook_deliveries(organization_id,endpoint_id,event_id,event_type,payload) SELECT ${org},id,${eventId},${type},${JSON.stringify(payload)}::jsonb FROM webhook_endpoints WHERE organization_id=${org} AND status='active' AND ${type}=ANY(event_types) ON CONFLICT(endpoint_id,event_id) DO NOTHING`;
}
export async function dispatchWebhooks(org:string){
 const sql=db();
 const rows=await sql`UPDATE webhook_deliveries SET lease_until=now()+interval '1 minute',attempts=attempts+1 WHERE id IN(SELECT d.id FROM webhook_deliveries d JOIN webhook_endpoints w ON w.id=d.endpoint_id WHERE d.organization_id=${org} AND w.status='active' AND d.status='pending' AND d.next_attempt_at<=now() AND (d.lease_until IS NULL OR d.lease_until<now()) AND d.attempts<6 ORDER BY d.created_at LIMIT 5 FOR UPDATE OF d SKIP LOCKED) RETURNING *`;
 await Promise.all(rows.map(async d=>{
  const endpoint=(await sql`SELECT url,signing_secret FROM webhook_endpoints WHERE id=${d.endpoint_id} AND organization_id=${org} AND status='active'`)[0];
  let status:number|null=null;
  try{
   if(!endpoint)throw new Error('Disabled endpoint');
   const url=publicWebhookUrl(endpoint.url);const body=JSON.stringify(d.payload);const timestamp=Math.floor(Date.now()/1000).toString();
   const response=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),headers:{'Content-Type':'application/json','webhook-id':d.event_id,'webhook-timestamp':timestamp,'webhook-signature':'v1='+await signEvent(endpoint.signing_secret,d.event_id,timestamp,body)},body});
   status=response.status;await response.body?.cancel();if(!response.ok)throw new Error('Non-success response');
   await sql`UPDATE webhook_deliveries SET status='delivered',last_status=${status},lease_until=NULL,delivered_at=now() WHERE id=${d.id}`;
  }catch{
   await sql`UPDATE webhook_deliveries SET status=${d.attempts>=6?'failed':'pending'},last_status=${status},lease_until=NULL,next_attempt_at=now()+(${Math.min(3600,2**d.attempts*15)}*interval '1 second') WHERE id=${d.id}`;
  }
 }));
}
