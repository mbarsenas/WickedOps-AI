import type {OutboundMessage,Submission} from '../../lib/transport/contracts';
export const transportName='Local Postfix';
export const localLab=true;
export function outbound(){return {async submit(workspace:string,key:string,message:OutboundMessage):Promise<Submission>{
 if(workspace!==process.env.LAB_WORKSPACE)throw Error('Local workspace mismatch');
 const r=await fetch('http://127.0.0.1:4380/v1/submissions',{method:'POST',headers:{authorization:'Bearer '+process.env.LAB_TRANSPORT_TOKEN,'content-type':'application/json','idempotency-key':key},body:JSON.stringify({workspace,message}),signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('Local transport did not acknowledge this submission');
 const value=await r.json();if(!value.id?.startsWith('sp_')||value.stage!=='queued')throw Error('Invalid acknowledgement');
 return {id:value.id,stage:'queued'};
}};}
export async function receive(id:string){
 if(!/^lab_[A-Za-z0-9-]+$/.test(id))throw Error('Only local inbox messages can be processed');
 const r=await fetch('http://127.0.0.1:8025/api/v1/message/'+id.slice(4),{signal:AbortSignal.timeout(5000)});
 if(!r.ok)throw Error('Local message not found');const m=await r.json();
 const recipients=m.To.map((a:{Address:string})=>a.Address.toLowerCase());
 if(!recipients.includes('support@inbox.senderpermit.test'))throw Error('Not an inbound lab message');
 const hr=await fetch('http://127.0.0.1:8025/api/v1/message/'+id.slice(4)+'/headers');
 const raw=hr.ok?await hr.json():{};const headers:Record<string,string>={};
 for(const [key,value] of Object.entries(raw))headers[key]=Array.isArray(value)?value.join(' '):String(value);
 return {from:m.From.Address,to:recipients,subject:m.Subject||'',text:m.Text||'',html:m.HTML||'',message_id:m.MessageID||id,headers};
}
