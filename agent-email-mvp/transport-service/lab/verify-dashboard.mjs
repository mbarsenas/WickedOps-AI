import assert from 'node:assert/strict';
const base='http://127.0.0.1:4312';
const login=await fetch(base+'/signin-with-chatgpt',{redirect:'manual'});const cookie=login.headers.get('set-cookie').split(';')[0];
async function api(path,body,origin=base){const r=await fetch(base+'/api/'+path,{method:body?'POST':'GET',headers:{cookie,...(body?{'content-type':'application/json',origin}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();return {status:r.status,data};}
const inbox=async()=>(await (await fetch('http://127.0.0.1:8025/api/v1/messages?limit=100')).json()).messages;
async function until(fn){for(let i=0;i<30;i++){const result=await fn();if(result)return result;await new Promise(r=>setTimeout(r,500));}throw Error('Timed out');}
assert.equal((await fetch(base+'/api/state')).status,401);
assert.equal((await fetch(base+'/api/local-lab',{method:'POST',headers:{cookie,origin:'https://evil.example','content-type':'application/json'},body:'{"action":"sync"}'})).status,403);
let state=(await api('state')).data;assert.equal(state.config.local_lab,true);assert.equal(state.config.resend,false);assert.equal(state.config.billing,false);
const key=await api('api-keys',{name:'Local integration verification'});assert.equal(key.status,201);
const subject='Dashboard outbound '+crypto.randomUUID();const body={from:'hello@senderpermit.test',to:'customer@example.test',subject,text:'Local dashboard API integration test.'};
const headers={authorization:'Bearer '+key.data.secret,'content-type':'application/json','idempotency-key':crypto.randomUUID()};
const send=()=>fetch(base+'/api/v1/emails',{method:'POST',headers,body:JSON.stringify(body)});
const sent=await send();assert.equal(sent.status,202);const accepted=await sent.json();assert.equal(accepted.status,'queued');await until(async()=>(await inbox()).some(m=>m.Subject===subject));assert.equal((await (await send()).json()).id,accepted.id);
const incoming='Dashboard approval '+crypto.randomUUID();assert.equal((await api('local-lab',{action:'receive',subject:incoming,text:'Please acknowledge this controlled test.'})).status,200);
const approval=await until(async()=>{await api('local-lab',{action:'sync'});state=(await api('state')).data;return state.approvals.find(a=>a.payload.subject==='Re: '+incoming);});
assert.equal(approval.status,'pending');assert.equal((await inbox()).filter(m=>m.Subject==='Re: '+incoming).length,0);
const approved=await api('approvals/'+approval.id+'/approve',{});assert.equal(approved.status,200,JSON.stringify(approved));await until(async()=>(await inbox()).some(m=>m.Subject==='Re: '+incoming));
assert.equal((await api('approvals/'+approval.id+'/approve',{})).status,409);
const rejectedSubject='Dashboard rejection '+crypto.randomUUID();await api('local-lab',{action:'receive',subject:rejectedSubject,text:'This reply should be rejected.'});
const reject=await until(async()=>{await api('local-lab',{action:'sync'});return (await api('state')).data.approvals.find(a=>a.payload.subject==='Re: '+rejectedSubject);});
assert.equal((await api('approvals/'+reject.id+'/reject',{})).status,200);assert.equal((await api('approvals/'+reject.id+'/approve',{})).status,409);
assert.equal((await inbox()).filter(m=>m.Subject==='Re: '+rejectedSubject).length,0);
state=(await api('state')).data;assert.ok(state.audit.some(e=>e.event_type==='approval.approved'));assert.ok(state.audit.some(e=>e.event_type==='email.queued'));
assert.equal((await inbox()).filter(m=>m.Subject===subject).length,1);
await api('api-keys/'+key.data.id+'/revoke',{});
console.log('PASS: authenticated dashboard, CSRF, API send via local Postfix, replay, inbound conversation, approval gating, approve/send, rejection, and audit. No real email or AI calls.');
