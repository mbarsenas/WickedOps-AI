import {PILOT_WORKSPACE} from './routing';
export async function inboundRequest(path:string,method='GET'){
 if(process.env.SENDERPERMIT_TRANSPORT_ORIGIN!=='https://mail.senderpermit.com'||!process.env.SENDERPERMIT_TRANSPORT_TOKEN)throw Error('AWS reception is not configured');
 const response=await fetch('https://mail.senderpermit.com/v1/inbound'+path,{method,headers:{authorization:'Bearer '+process.env.SENDERPERMIT_TRANSPORT_TOKEN},redirect:'error',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('AWS inbound retrieval failed');return response.json();
}
export async function receiveAWS(id:string){
 if(!/^spi_[a-f0-9]{64}$/.test(id))throw Error('Invalid inbound identifier');
 const value=await inboundRequest('/'+id);
 if(value.workspace!==PILOT_WORKSPACE||!Array.isArray(value.to)||value.to.length!==1||value.to[0]!=='pilot@inbound.senderpermit.com'||typeof value.from!=='string'||typeof value.text!=='string')throw Error('Inbound workspace mismatch');
 return value as {workspace:string;from:string;to:string[];subject:string;text:string;html:null;message_id:string;headers:Record<string,string>};
}
