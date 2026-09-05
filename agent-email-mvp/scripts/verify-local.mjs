import assert from 'node:assert/strict';
const base='http://127.0.0.1:4311';
const login=await fetch(base+'/signin-with-chatgpt?return_to=/dashboard',{redirect:'manual'});
const cookie=login.headers.get('set-cookie').split(';')[0];
async function api(path,body,auth=true,origin=base){const r=await fetch(base+'/api/'+path,{method:body?'POST':'GET',headers:{...(auth?{cookie}:{}),...(body?{'Content-Type':'application/json',Origin:origin}:{})},...(body?{body:JSON.stringify(body)}:{})});const text=await r.text();let data;try{data=JSON.parse(text);}catch{data={error:text.slice(0,400)};}return {status:r.status,data};}
assert.equal((await api('state',undefined,false)).status,401);
assert.equal((await api('agents',{name:'Bad',instructions:'Should be blocked'},true,'https://evil.example')).status,403);
let r=await api('state');assert.equal(r.status,200,JSON.stringify(r.data));
r=await api('agents',{name:'Validation agent',instructions:'Reply briefly to test messages without inventing facts.'});assert.equal(r.status,201,JSON.stringify(r.data));const id=r.data.id;
r=await api('agents/'+id,{status:'paused'});assert.equal(r.data.status,'paused');
r=await api('agents/'+id,{status:'active'});assert.equal(r.data.status,'active');
r=await api('policies',{agent_id:id,name:'Review everything',effect:'require_approval',priority:100,recipient:''});assert.equal(r.status,201,JSON.stringify(r.data));
const policyId=r.data.id;r=await api('policies/'+policyId,{enabled:false});assert.equal(r.data.enabled,false);
r=await api('identities',{agent_id:id,address:'agent@unverified-domain.invalid'});assert.equal(r.status,400,JSON.stringify(r.data));
r=await api('state');assert(r.data.audit.length>=5);
console.log('PASS: authentication, CSRF, agent create/pause/resume, policy create/disable, domain verification, audit persistence.');
console.log('TEST_AGENT_ID='+id);


