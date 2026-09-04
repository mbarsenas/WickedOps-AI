import {test} from 'node:test';import assert from 'node:assert/strict';
import {summarizeDelivery} from '../lib/transport/status';
const now=new Date().toISOString();
test('MTA acceptance never becomes confirmed delivery',()=>{
 const s=summarizeDelivery({recipients:[{recipient:'a@example.com',state:'mta_accepted'}]},['a@example.com'],now);
 assert.equal(s.status,'mta_accepted');assert.equal(s.attention,false);assert.match(s.detail,/delivery unconfirmed/);
});
test('mixed results retain recipient detail and need attention',()=>{
 const s=summarizeDelivery({recipients:[{recipient:'a@example.com',state:'bounced'},{recipient:'b@example.com',state:'mta_accepted'}]},['a@example.com','b@example.com'],now);
 assert.equal(s.status,'bounced');assert.equal(s.attention,true);assert.match(s.detail,/b@example.com/);
});
test('stuck queues alert without claiming failure or requeueing',()=>{
 const s=summarizeDelivery({recipients:[{recipient:'a@example.com',state:'queued'}]},['a@example.com'],new Date(Date.now()-16*60000).toISOString());
 assert.equal(s.status,'queued');assert.equal(s.attention,true);
});
test('malformed, unknown and mismatched results cannot overwrite saved status',()=>{
 for(const state of ['delivered','made-up'])assert.throws(()=>summarizeDelivery({recipients:[{recipient:'a@example.com',state}]},['a@example.com'],now));
 assert.throws(()=>summarizeDelivery({recipients:[{recipient:'other@example.com',state:'bounced'}]},['a@example.com'],now));
 assert.throws(()=>summarizeDelivery({recipients:[]},['a@example.com'],now));
});
