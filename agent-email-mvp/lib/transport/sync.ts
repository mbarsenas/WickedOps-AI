import {db} from '../db';
import {PILOT_WORKSPACE} from './routing';
import {summarizeDelivery} from './status';
export async function syncDelivery(org:string){
 if(org!==PILOT_WORKSPACE)return;
 const sql=db(),key='aws_delivery/'+org,owner=crypto.randomUUID();
 const lease=await sql`INSERT INTO app_settings(key,value) VALUES(${key+'/lease'},jsonb_build_object('owner',${owner}::text,'until',extract(epoch from now())+60)) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value WHERE (app_settings.value->>'until')::numeric<extract(epoch from now()) RETURNING key`;
 if(!lease[0])return;
 try{
 const records=await sql`SELECT id::text AS id,provider_id,to_addresses AS recipients,created_at,'send' AS kind FROM email_api_events WHERE organization_id=${org} AND provider_id LIKE 'sp_%'
 UNION ALL SELECT p.id::text,e.provider_id,ARRAY[p.payload->>'to'],e.created_at,'action' FROM action_executions e JOIN proposed_actions p ON p.id=e.action_id JOIN agents a ON a.id=p.agent_id WHERE a.organization_id=${org} AND e.provider_id LIKE 'sp_%' ORDER BY created_at DESC LIMIT 400`;
 const previous=(await sql`SELECT value FROM app_settings WHERE key=${key}`)[0]?.value||{items:{},cursor:0};
 const items:Record<string,any>={};for(const r of records)if(previous.items?.[r.kind+'/'+r.id])items[r.kind+'/'+r.id]=previous.items[r.kind+'/'+r.id];
 const start=Number(previous.cursor||0)%Math.max(records.length,1),batch=records.slice(start,start+20);let unavailable=false;
 for(let offset=0;offset<batch.length;offset+=5)await Promise.all(batch.slice(offset,offset+5).map(async r=>{
 try{
 if(process.env.SENDERPERMIT_TRANSPORT_ORIGIN!=='https://mail.senderpermit.com'||!process.env.SENDERPERMIT_TRANSPORT_TOKEN)throw Error('Configuration unavailable');
 const result=await fetch('https://mail.senderpermit.com/v1/submissions/'+encodeURIComponent(r.provider_id),{headers:{authorization:'Bearer '+process.env.SENDERPERMIT_TRANSPORT_TOKEN},redirect:'error',signal:AbortSignal.timeout(4000)});
 if(!result.ok)throw Error('Status unavailable');
 const summary=summarizeDelivery(await result.json(),r.recipients,r.created_at);
 items[r.kind+'/'+r.id]=summary;
 if(r.kind==='send')await sql`UPDATE email_api_events SET status=${summary.status},error=${summary.detail},updated_at=now() WHERE id=${r.id} AND organization_id=${org} AND provider_id=${r.provider_id}`;
 }catch{unavailable=true;}
 }));
 await sql`INSERT INTO app_settings(key,value) VALUES(${key},${JSON.stringify({items,cursor:start+batch.length,unavailable,checked_at:new Date().toISOString()})}::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`;
 }finally{await sql`UPDATE app_settings SET value=jsonb_set(value,'{until}','0'::jsonb) WHERE key=${key+'/lease'} AND value->>'owner'=${owner}`;}
}
export async function deliverySnapshot(org:string){if(org!==PILOT_WORKSPACE)return {items:{},unavailable:false};const sql=db();return (await sql`SELECT value FROM app_settings WHERE key=${'aws_delivery/'+org}`)[0]?.value||{items:{},unavailable:false};}
