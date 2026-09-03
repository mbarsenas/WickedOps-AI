import {db} from './db';
import {dispatchWebhooks} from './webhooks';
export async function schedulerAuthorized(header:string|null){
 const secret=process.env.WEBHOOK_SCHEDULER_SECRET;
 if(!secret||!header)return false;
 const hash=async(s:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
 const [a,b]=await Promise.all([hash(header),hash('Bearer '+secret)]);let mismatch=0;for(let i=0;i<a.length;i++)mismatch|=a[i]^b[i];return mismatch===0;
}
export async function runWebhookSchedule(){
 const sql=db();const claimId=crypto.randomUUID();
 const lease=await sql`INSERT INTO app_settings(key,value) VALUES('webhook_scheduler_lease',jsonb_build_object('owner',${claimId}::text,'until',extract(epoch from now())+120)) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value WHERE (app_settings.value->>'until')::numeric<extract(epoch from now()) RETURNING key`;
 if(!lease[0])return {ok:true,busy:true};
 try{
  const rows=await sql`SELECT d.organization_id FROM webhook_deliveries d JOIN webhook_endpoints e ON e.id=d.endpoint_id WHERE d.status='pending' AND e.status='active' AND d.attempts<6 AND d.next_attempt_at<=now() AND (d.lease_until IS NULL OR d.lease_until<now()) GROUP BY d.organization_id ORDER BY min(d.next_attempt_at) LIMIT 2`;
  await Promise.all(rows.map(r=>dispatchWebhooks(r.organization_id)));
  await sql`INSERT INTO app_settings(key,value) VALUES('webhook_scheduler_status',jsonb_build_object('last_run',now(),'workspaces',${rows.length}::int)) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`;
  return {ok:true,workspaces:rows.length};
 }finally{await sql`UPDATE app_settings SET value=jsonb_set(value,'{until}','0'::jsonb) WHERE key='webhook_scheduler_lease' AND value->>'owner'=${claimId}`;}
}
