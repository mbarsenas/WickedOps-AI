import {SenderPermitTransport,type OutboundTransport} from './contracts';
class HttpError extends Error {constructor(public status:number,message:string){super(message);}}
export const PILOT_WORKSPACE='743121e2-2429-49f5-af41-9230fd324643';
export function deliveryInfo(workspace:string){
 const pilot=workspace===PILOT_WORKSPACE;
 const ready=!!process.env.SENDERPERMIT_TRANSPORT_TOKEN&&process.env.SENDERPERMIT_TRANSPORT_ORIGIN==='https://mail.senderpermit.com';
 return {name:pilot?'SenderPermit · Direct':'Resend',sending_enabled:!pilot||(ready&&process.env.SENDERPERMIT_PILOT_SENDING==='enabled'),pilot};
}
export function pilotTransport(workspace:string):OutboundTransport|null{
 if(workspace!==PILOT_WORKSPACE)return null;
 if(!deliveryInfo(workspace).sending_enabled)throw new HttpError(503,'Sending is paused for this test workspace while SenderPermit direct delivery is being activated. No email was queued.');
 const transport=new SenderPermitTransport(process.env.SENDERPERMIT_TRANSPORT_ORIGIN!,process.env.SENDERPERMIT_TRANSPORT_TOKEN!);
 return {submit(boundWorkspace,key,message){if(boundWorkspace!==workspace)throw new HttpError(403,'Transport workspace mismatch.');return transport.submit(workspace,key,message);}};
}
