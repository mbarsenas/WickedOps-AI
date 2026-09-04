export const deliveryLabels:Record<string,string>={queued:'Queued',submitting:'Handing to mail server',mta_accepted:'Accepted by mail server — delivery unconfirmed',uncertain:'Handoff uncertain',deferred:'Delivery delayed',bounced:'Bounced',suppressed:'Recipient suppressed'};
export function summarizeDelivery(value:any,expected:string[],created:string){
 if(!Array.isArray(value?.recipients)||!value.recipients.length)throw Error('Missing recipients');
 const recipients=value.recipients as {recipient:string;state:string}[];
 const actual=recipients.map(r=>r.recipient?.toLowerCase()).sort();
 const wanted=[...new Set(expected.map(r=>r.toLowerCase()))].sort();
 if(JSON.stringify(actual)!==JSON.stringify(wanted)||recipients.some(r=>!Object.hasOwn(deliveryLabels,r.state)))throw Error('Invalid delivery status');
 const order=['bounced','uncertain','suppressed','deferred','submitting','queued','mta_accepted'];
 const status=order.find(s=>recipients.some(r=>r.state===s))!;
 const stale=recipients.some(r=>['queued','submitting'].includes(r.state))&&Date.now()-new Date(created).getTime()>15*60*1000;
 const attention=stale||recipients.some(r=>['bounced','uncertain','suppressed','deferred'].includes(r.state));
 return {status,attention,detail:recipients.map(r=>`${r.recipient}: ${deliveryLabels[r.state]}`).join('; ')+(stale?' · Still queued after 15 minutes.':''),checked_at:new Date().toISOString()};
}
