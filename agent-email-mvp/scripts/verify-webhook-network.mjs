import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHmac} from 'node:crypto';
if(!process.env.TEST_DATABASE_URL)throw Error('An isolated test database is required');
process.env.DATABASE_URL=process.env.TEST_DATABASE_URL;
const {db}=await import('../lib/db.ts');
const {enqueueEvent}=await import('../lib/webhooks.ts');
const {runWebhookSchedule}=await import('../lib/scheduler.ts');
const sql=db(),originalFetch=globalThis.fetch;
let attempts=0,fail=true;const seen=[];
const server=createServer(async(req,res)=>{
 let body='';for await(const chunk of req)body+=chunk;
 const signature='v1='+createHmac('sha256','network-test-secret').update(req.headers['webhook-id']+'.'+req.headers['webhook-timestamp']+'.'+body).digest('hex');
 const valid=signature===req.headers['webhook-signature'];seen.push({valid,id:req.headers['webhook-id']});attempts++;
 res.writeHead(!valid?401:fail?503:204);res.end();
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
// Only the synthetic endpoint is redirected to a real local HTTP listener.
// Production URL validation and signing run unchanged; external customer endpoints are never called.
globalThis.fetch=(url,init)=>{
 if(String(url)==='https://webhook-test.example/events')return originalFetch('http://127.0.0.1:'+server.address().port,init);
 if(init?.headers?.['webhook-signature'])throw Error('Unexpected outbound webhook in isolated test');
 return originalFetch(url,init);
};
try{
 await sql`UPDATE webhook_endpoints SET status='disabled'`;
 const org=(await sql`INSERT INTO organizations(name) VALUES('Isolated webhook network test') RETURNING id`)[0].id;
 await sql`INSERT INTO webhook_endpoints(organization_id,url,event_types,signing_secret) VALUES(${org},'https://webhook-test.example/events',ARRAY['email.sent'],'network-test-secret')`;
 await enqueueEvent(org,'email.sent','network-recovery',{test:true});
 await runWebhookSchedule();assert.equal(attempts,1);
 let row=(await sql`SELECT * FROM webhook_deliveries WHERE organization_id=${org}`)[0];assert.equal(row.status,'pending');assert.equal(row.last_status,503);assert(row.next_attempt_at>new Date());
 await runWebhookSchedule();assert.equal(attempts,1,'Backoff must prevent an immediate retry');
 fail=false;await sql`UPDATE webhook_deliveries SET next_attempt_at=now() WHERE organization_id=${org}`;
 await Promise.all([runWebhookSchedule(),runWebhookSchedule()]);assert.equal(attempts,2,'Concurrent schedulers must not duplicate delivery');
 row=(await sql`SELECT * FROM webhook_deliveries WHERE organization_id=${org}`)[0];assert.equal(row.status,'delivered');assert.equal(row.attempts,2);assert.equal(row.last_status,204);
 assert(seen.every(x=>x.valid));assert.equal(seen[0].id,seen[1].id);
 fail=true;await enqueueEvent(org,'email.sent','network-exhaustion',{test:true});
 for(let i=0;i<6;i++){await sql`UPDATE webhook_deliveries SET next_attempt_at=now() WHERE organization_id=${org} AND event_id='network-exhaustion'`;await runWebhookSchedule();}
 row=(await sql`SELECT * FROM webhook_deliveries WHERE organization_id=${org} AND event_id='network-exhaustion'`)[0];assert.equal(row.status,'failed');assert.equal(row.attempts,6);
 await runWebhookSchedule();assert.equal(attempts,8);
 console.log('PASS: real HTTP failure/recovery, HMAC verification, retry backoff, concurrent scheduler lease, stable event IDs, six-attempt cutoff. No dashboard requests. Local receiver; isolated database.');
}finally{globalThis.fetch=originalFetch;await new Promise(resolve=>server.close(resolve));}
