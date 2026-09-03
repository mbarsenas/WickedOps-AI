import {db} from '../../../../lib/db';
import {stripeClient} from '../../../../lib/billing';
import {errorResponse} from '../../../../lib/auth';
export async function POST(req:Request){
 if(!process.env.STRIPE_WEBHOOK_SECRET||!process.env.STRIPE_SECRET_KEY)return Response.json({error:'Billing is not configured'},{status:503});
 const stripe=stripeClient();const raw=await req.text();if(raw.length>1000000)return new Response(null,{status:413});let event;
 try{event=await stripe.webhooks.constructEventAsync(raw,req.headers.get('stripe-signature')||'',process.env.STRIPE_WEBHOOK_SECRET);}catch{return Response.json({error:'Invalid signature'},{status:401});}
 try{
  if(['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted'].includes(event.type)){
   const data=event.data.object as {id:string};const subscription=await stripe.subscriptions.retrieve(data.id);const customer=typeof subscription.customer==='string'?subscription.customer:subscription.customer.id;
   const allowed=subscription.items.data.some(i=>i.price.id===process.env.STRIPE_PRICE_ID);const active=allowed&&['active','trialing'].includes(subscription.status);const limit=active?Number(process.env.PAID_MONTHLY_LIMIT):100;
   if(!Number.isInteger(limit)||limit<1)throw new Error('Paid allowance is not configured');
   const sql=db();await sql`UPDATE organizations SET stripe_subscription_id=${subscription.id},subscription_status=${subscription.status},monthly_limit=${limit},billing_event_at=${event.created} WHERE stripe_customer_id=${customer} AND id=${subscription.metadata.organization_id||'00000000-0000-0000-0000-000000000000'} AND billing_event_at<=${event.created}`;
  }
  const sql=db();await sql`UPDATE workspace_alerts SET status='resolved',updated_at=now() WHERE source_key=${'billing/event/'+event.id}`;
  return Response.json({ok:true});
 }catch(e){
  // The signature was verified above. Bind failures only to the stored Stripe customer.
  const obj=event.data.object as unknown as {customer?:string|{id:string}};const customer=typeof obj.customer==='string'?obj.customer:obj.customer?.id;
  if(customer){try{const sql=db();await sql`INSERT INTO workspace_alerts(organization_id,source_key,category,title,detail) SELECT id,${'billing/event/'+event.id},'billing','Billing event could not be processed','Stripe will retry this event. Contact support if this alert remains open.' FROM organizations WHERE stripe_customer_id=${customer} ON CONFLICT(organization_id,source_key) DO UPDATE SET status='open',updated_at=now()`;}catch{}}
  return errorResponse(e);
 }
}
