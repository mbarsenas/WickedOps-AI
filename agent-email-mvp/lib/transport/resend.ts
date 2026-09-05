import {Resend} from 'resend';
import type {OutboundTransport,OutboundMessage,Submission} from './contracts';
export function resendClient(){if(!process.env.RESEND_API_KEY)throw Error('Email service is not configured');return new Resend(process.env.RESEND_API_KEY);}
export class ResendTransport implements OutboundTransport {
 constructor(private client=resendClient()){}
 async submit(_workspace:string,key:string,message:OutboundMessage):Promise<Submission>{const r=await this.client.emails.send(message,{idempotencyKey:key});if(r.error||!r.data?.id)throw Error('Provider acceptance failed or is uncertain');return {id:r.data.id,stage:'provider_accepted'};}
}
