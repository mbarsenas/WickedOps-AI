import {resendClient,ResendTransport} from './resend';
export const transportName='Resend';
export const localLab=false;
export {deliveryInfo} from './routing';
import {pilotTransport} from './routing';
export function outbound(workspace:string){return pilotTransport(workspace)||new ResendTransport();}
export async function receive(id:string){
 const received=await resendClient().emails.receiving.get(id);
 if(received.error||!received.data)throw Error(received.error?.message||'Unable to retrieve email');
 return received.data;
}
