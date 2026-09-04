import {db} from './db';
import {ingest} from './email';
import {inboundRequest} from './transport/inbound';
import {PILOT_WORKSPACE} from './transport/routing';
export async function syncAWSInbound(org:string){
 if(org!==PILOT_WORKSPACE)return;
 const sql=db();
 try{
 const list=await inboundRequest('');
 if(!Array.isArray(list.messages))throw Error('Invalid inbound listing');
 for(const message of list.messages.slice(0,3)){
 if(!/^spi_[a-f0-9]{64}$/.test(message.id))continue;
 const prior=(await sql`SELECT status FROM email_jobs WHERE provider_message_id=${message.id}`)[0];
 // Held/failed work remains visible in Actions and requires an explicit retry.
 if(!prior||prior.status==='processing')await ingest(message.id);
 const saved=(await sql`SELECT status FROM email_jobs WHERE provider_message_id=${message.id}`)[0];
 if(saved&&['done','held','failed'].includes(saved.status))await inboundRequest('/'+message.id+'/ack','POST');
 }
 await sql`INSERT INTO app_settings(key,value) VALUES(${'aws_inbound/'+org},${JSON.stringify({ok:true,checked_at:new Date().toISOString()})}::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`;
 }catch{
 await sql`INSERT INTO app_settings(key,value) VALUES(${'aws_inbound/'+org},${JSON.stringify({ok:false,checked_at:new Date().toISOString()})}::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()`;
 }
}
