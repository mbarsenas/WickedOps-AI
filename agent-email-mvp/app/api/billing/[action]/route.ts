import {requireWorkspace,errorResponse,HttpError} from '../../../../lib/auth';
import {db} from '../../../../lib/db';
import {billingConfigured,stripeClient} from '../../../../lib/billing';
export async function POST(req:Request,{params}:{params:Promise<{action:string}>}){
 try{const user=await requireWorkspace(req);if(!billingConfigured())throw new HttpError(503,'Paid plans are not open yet. Your developer allowance remains available.');
  const {action}=await params;if(!['checkout','portal'].includes(action))throw new HttpError(404,'Not found.');
  const sql=db();const org=(await sql`SELECT * FROM organizations WHERE id=${user.organization_id}`)[0];const stripe=stripeClient();const base=process.env.APP_BASE_URL!;
  let customer=org.stripe_customer_id;
  if(!customer){const result=await stripe.customers.create({email:user.email,name:org.name,metadata:{organization_id:org.id}},{idempotencyKey:'agentmail/customer/'+org.id});customer=result.id;await sql`UPDATE organizations SET stripe_customer_id=${customer} WHERE id=${org.id}`;}
  if(action==='portal'){const result=await stripe.billingPortal.sessions.create({customer,return_url:base+'/dashboard'});return Response.json({url:result.url});}
  if(['active','trialing'].includes(org.subscription_status))throw new HttpError(409,'Use Manage billing to change your existing subscription.');
  const subscriptions=await stripe.subscriptions.list({customer,status:'all',limit:100});if(subscriptions.data.some(s=>['active','trialing','past_due'].includes(s.status)))throw new HttpError(409,'Use Manage billing for the existing subscription.');
  const open=await stripe.checkout.sessions.list({customer,status:'open',limit:1});if(open.data[0]?.url)return Response.json({url:open.data[0].url});
  const suffix=Array.from(crypto.getRandomValues(new Uint8Array(8))).map(n=>String.fromCharCode(97+n%26)).join('');
  const session=await stripe.checkout.sessions.create({mode:'subscription',customer,client_reference_id:org.id,line_items:[{price:process.env.STRIPE_PRICE_ID!,quantity:1}],subscription_data:{metadata:{organization_id:org.id}},success_url:base+'/dashboard?billing=success',cancel_url:base+'/dashboard?billing=cancelled',integration_identifier:'agentmail_'+suffix},{idempotencyKey:'agentmail/checkout/'+org.id+'/'+Math.floor(Date.now()/3600000)});
  return Response.json({url:session.url});
 }catch(e){return errorResponse(e);}
}
