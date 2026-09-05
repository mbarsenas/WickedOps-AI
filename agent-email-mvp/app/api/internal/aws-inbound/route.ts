import {syncAWSInbound} from '../../../../lib/inbound-sync';
import {syncAlerts} from '../../../../lib/alerts';
import {PILOT_WORKSPACE} from '../../../../lib/transport/routing';
export async function POST(request:Request){
 const secret=process.env.SENDERPERMIT_TRANSPORT_TOKEN;
 if(!secret)return Response.json({error:'Unavailable'},{status:503});
 const hash=async(value:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
 const [actual,expected]=await Promise.all([hash(request.headers.get('authorization')||''),hash('Bearer '+secret)]);
 let mismatch=0;for(let i=0;i<actual.length;i++)mismatch|=actual[i]^expected[i];
 if(mismatch)return Response.json({error:'Unauthorized'},{status:401});
 const ok=await syncAWSInbound(PILOT_WORKSPACE);await syncAlerts(PILOT_WORKSPACE);
 return Response.json({ok:!!ok},{status:ok?200:503});
}
