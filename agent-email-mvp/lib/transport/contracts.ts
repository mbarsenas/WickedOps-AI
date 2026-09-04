export type OutboundMessage={from:string;to:string[];subject:string;text:string;replyTo?:string;headers?:Record<string,string>};
export type Submission={id:string;stage:'queued'|'provider_accepted'};
export interface OutboundTransport {submit(workspace:string,key:string,message:OutboundMessage):Promise<Submission>}
// The management app must not equate durable queue acceptance with remote delivery.
export class SenderPermitTransport implements OutboundTransport {
 constructor(private origin:string,private token:string,private request:typeof fetch=fetch){const url=new URL(origin);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Transport requires an HTTPS origin');if(token.length<32)throw Error('Transport credential is too short');}
 async submit(workspace:string,key:string,message:OutboundMessage):Promise<Submission>{
  const r=await this.request(new URL('/v1/submissions',this.origin),{method:'POST',redirect:'error',headers:{authorization:'Bearer '+this.token,'content-type':'application/json','idempotency-key':key},body:JSON.stringify({workspace,message}),signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('Transport submission failed or is uncertain; retry the same key');const b=await r.json() as Submission;if(typeof b.id!=='string'||!b.id.startsWith('sp_')||b.stage!=='queued')throw Error('Invalid transport acknowledgement');return {id:b.id,stage:'queued'};
 }
}
