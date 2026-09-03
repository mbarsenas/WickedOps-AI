import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mock} from 'node:test';
import Stripe from 'stripe';
const line=fs.existsSync('.env.local')?fs.readFileSync('.env.local','utf8').split(/\r?\n/).find(x=>x.startsWith('STRIPE_TEST_SECRET_KEY=')):null;
const key=(process.env.STRIPE_TEST_SECRET_KEY||line?.slice('STRIPE_TEST_SECRET_KEY='.length)||'').trim().replace(/^['"]|['"]$/g,'');
if(!/^[rs]k_test_/.test(key))throw Error('Save STRIPE_TEST_SECRET_KEY for AgentMail sandbox. Live keys are refused.');
if(!process.env.TEST_DATABASE_URL||!process.env.TEST_BRANCH_HOST||new URL(process.env.TEST_DATABASE_URL).hostname!==process.env.TEST_BRANCH_HOST)throw Error('Provide the isolated TEST_DATABASE_URL and its TEST_BRANCH_HOST.');
const stripe=new Stripe(key);const account=await stripe.accounts.retrieve();assert.equal(account.id,'acct_1UBgkSFJnw7J7UL9','AgentMail sandbox account required');assert.equal(account.charges_enabled,true);
process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;process.env.STRIPE_SECRET_KEY=key;process.env.STRIPE_WEBHOOK_SECRET='whsec_'+crypto.randomUUID();process.env.PAID_MONTHLY_LIMIT='10000';
mock.module(new URL('../app/chatgpt-auth.ts',import.meta.url).href,{namedExports:{getChatGPTUser:async()=>null}});
const {db}=await import('../lib/db.ts');const sql=db();
const {POST:receive}=await import('../app/api/webhooks/stripe/route.ts');
const org=(await sql`INSERT INTO organizations(name) VALUES('Stripe sandbox verification') RETURNING id`)[0].id;
let product,price,customer,subscription,checkout;let eventTime=Math.floor(Date.now()/1000);
async function applyEvent(id){
 const payload=JSON.stringify({id:'evt_test_'+crypto.randomUUID(),object:'event',livemode:false,type:'customer.subscription.updated',created:++eventTime,data:{object:{id}}});
 const signature=stripe.webhooks.generateTestHeaderString({payload,secret:process.env.STRIPE_WEBHOOK_SECRET});
 const response=await receive(new Request('https://test.example/api/webhooks/stripe',{method:'POST',headers:{'stripe-signature':signature},body:payload}));assert.equal(response.status,200,await response.text());
 return (await sql`SELECT monthly_limit FROM organizations WHERE id=${org}`)[0].monthly_limit;
}
try{
 product=await stripe.products.create({name:'AgentMail isolated billing verification',metadata:{test_run:org}});
 price=await stripe.prices.create({product:product.id,currency:'usd',unit_amount:2000,recurring:{interval:'month'}});assert.equal(price.livemode,false);process.env.STRIPE_PRICE_ID=price.id;
 customer=await stripe.customers.create({name:'AgentMail sandbox test',payment_method:'pm_card_visa',invoice_settings:{default_payment_method:'pm_card_visa'},metadata:{test_run:org}});assert.equal(customer.livemode,false);
 await sql`UPDATE organizations SET stripe_customer_id=${customer.id} WHERE id=${org}`;
 checkout=await stripe.checkout.sessions.create({customer:customer.id,mode:'subscription',line_items:[{price:price.id,quantity:1}],success_url:'https://example.com/success',cancel_url:'https://example.com/cancel',integration_identifier:'agentmail_sandboxt',subscription_data:{metadata:{organization_id:org}}});assert(checkout.url);assert.equal(checkout.livemode,false);await stripe.checkout.sessions.expire(checkout.id);checkout=null;
 subscription=await stripe.subscriptions.create({customer:customer.id,items:[{price:price.id}],default_payment_method:'pm_card_visa',metadata:{organization_id:org},payment_behavior:'error_if_incomplete'});
 assert.equal(subscription.status,'active');assert.equal(await applyEvent(subscription.id),10000);
 const invoice=await stripe.invoices.retrieve(typeof subscription.latest_invoice==='string'?subscription.latest_invoice:subscription.latest_invoice.id);assert.equal(invoice.paid,true);assert.equal(invoice.livemode,false);
 await stripe.subscriptions.cancel(subscription.id);assert.equal(await applyEvent(subscription.id),100);subscription=null;
 subscription=await stripe.subscriptions.create({customer:customer.id,items:[{price:price.id}],default_payment_method:'pm_card_chargeDeclined',metadata:{organization_id:org},payment_behavior:'default_incomplete'});
 assert.equal(subscription.status,'incomplete');assert.equal(await applyEvent(subscription.id),100);
 console.log('PASS: real sandbox paid subscription, 10,000 allowance, cancellation to 100, failed initial payment without paid allowance, and Checkout session creation. App handler retrieves actual Stripe objects; signed events delivered locally. Hosted Checkout completion not tested. No real charges.');
}finally{
 if(checkout)await stripe.checkout.sessions.expire(checkout.id);
 if(subscription)await stripe.subscriptions.cancel(subscription.id);
 if(customer)await stripe.customers.del(customer.id);
 if(price)await stripe.prices.update(price.id,{active:false});
 if(product)await stripe.products.update(product.id,{active:false});
}
