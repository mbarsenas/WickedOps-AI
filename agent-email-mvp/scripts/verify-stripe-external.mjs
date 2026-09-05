import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mock} from 'node:test';
import Stripe from 'stripe';
const key=fs.readFileSync('.env.local','utf8').split(/\r?\n/).find(x=>x.startsWith('STRIPE_TEST_SECRET_KEY='))?.slice(23).trim().replace(/^['"]|['"]$/g,'');
if(!/^[rs]k_test_/.test(key||''))throw Error('Sandbox key required');
if(!process.env.TEST_DATABASE_URL||new URL(process.env.TEST_DATABASE_URL).hostname!==process.env.TEST_BRANCH_HOST)throw Error('Isolated database required');
const origin=new URL(process.env.TEST_WEBHOOK_ORIGIN);if(origin.protocol!=='https:')throw Error('HTTPS receiver required');
const stripe=new Stripe(key);assert.equal((await stripe.accounts.retrieve()).id,'acct_1UBgkSFJnw7J7UL9');
process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;process.env.STRIPE_SECRET_KEY=key;process.env.PAID_MONTHLY_LIMIT='10000';
mock.module(new URL('../app/chatgpt-auth.ts',import.meta.url).href,{namedExports:{getChatGPTUser:async()=>null}});
const {db}=await import('../lib/db.ts');const sql=db();const {POST}=await import('../app/api/webhooks/stripe/route.ts');
const subscription=await stripe.subscriptions.retrieve('sub_1UBiqfFJnw7J7UL9MDdQauRT');assert.equal(subscription.livemode,false);assert.equal(subscription.status,'active');
process.env.STRIPE_PRICE_ID=subscription.items.data[0].price.id;
const customer=typeof subscription.customer==='string'?subscription.customer:subscription.customer.id;
const org=(await sql`INSERT INTO organizations(name,stripe_customer_id) VALUES('External sandbox webhook test',${customer}) RETURNING id`)[0].id;
const deliveries=[];let endpoint;
const server=createServer(async(req,res)=>{
 if(req.method==='GET'&&req.url==='/health'){res.writeHead(200);res.end('ready');return;}
 if(req.method!=='POST'||req.url!=='/stripe'){res.writeHead(404);res.end();return;}
 try{let body='';for await(const chunk of req){body+=chunk;if(body.length>1000000){res.writeHead(413);res.end();return;}}
 const response=await POST(new Request(origin.origin+'/stripe',{method:'POST',headers:{'stripe-signature':String(req.headers['stripe-signature']||'')},body}));
 if(response.ok){const e=JSON.parse(body);deliveries.push({id:e.id,type:e.type,status:response.status});console.log(JSON.stringify({stripe_delivery:e.id,type:e.type,status:response.status}));}
 res.writeHead(response.status);res.end(await response.text());
 }catch{res.writeHead(500);res.end('Receiver error');}
});
await new Promise(resolve=>server.listen(8797,'127.0.0.1',resolve));
async function waitForLimit(limit){const deadline=Date.now()+120000;while(Date.now()<deadline){const row=(await sql`SELECT monthly_limit FROM organizations WHERE id=${org}`)[0];if(row.monthly_limit===limit)return;await new Promise(r=>setTimeout(r,2000));}throw Error('Timed out waiting for external webhook allowance '+limit);}
try{
 assert.equal((await fetch(origin.origin+'/health')).status,200);
 endpoint=await stripe.webhookEndpoints.create({url:origin.origin+'/stripe',enabled_events:['customer.subscription.updated','customer.subscription.deleted'],api_version:'2026-07-29.dahlia',description:'Temporary AgentMail isolated transport verification'});
 process.env.STRIPE_WEBHOOK_SECRET=endpoint.secret;
 await stripe.subscriptions.update(subscription.id,{metadata:{...subscription.metadata,organization_id:org}});
 await waitForLimit(10000);console.log('PASS: Stripe external signed update granted 10000 recipients.');
 await stripe.subscriptions.cancel(subscription.id);await waitForLimit(100);
 assert(deliveries.some(x=>x.type==='customer.subscription.updated'));assert(deliveries.some(x=>x.type==='customer.subscription.deleted'));
 console.log('PASS: Stripe external cancellation restored 100 recipients. Browser test subscription canceled. No live changes.');
}finally{
 if(endpoint)await stripe.webhookEndpoints.del(endpoint.id);
 await new Promise(resolve=>server.close(resolve));
}
