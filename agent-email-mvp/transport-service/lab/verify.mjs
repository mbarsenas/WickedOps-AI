import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {connect} from 'node:net';
import {randomUUID} from 'node:crypto';
const raw=readFileSync(new URL('.env',import.meta.url),'utf8').trim();
const [account]=JSON.parse(raw.slice("TRANSPORT_ACCOUNTS='".length,-1));
const headers={authorization:'Bearer '+account.token,'content-type':'application/json','idempotency-key':randomUUID()};
const subject='SenderPermit local outbound '+randomUUID();
const body={workspace:account.workspace,message:{from:'hello@senderpermit.test',to:['recipient@example.test'],subject,text:'Delivered through our local queue and Postfix. No Resend involved.'}};
async function until(fn){for(let i=0;i<60;i++){const result=await fn();if(result)return result;await new Promise(r=>setTimeout(r,500));}throw Error('Timed out waiting for local delivery');}
async function messages(){return (await (await fetch('http://127.0.0.1:8025/api/v1/messages')).json()).messages;}
const send=()=>fetch('http://127.0.0.1:4380/v1/submissions',{method:'POST',headers,body:JSON.stringify(body)});
const first=await send();assert.equal(first.status,202);const submission=await first.json();
await until(async()=>{const r=await (await fetch('http://127.0.0.1:4380/v1/submissions/'+submission.id,{headers})).json();return r.recipients?.every(x=>x.state==='mta_accepted');});
await until(async()=>(await messages()).some(m=>m.Subject===subject));
const replay=await send();assert.equal(replay.status,200);assert.equal((await replay.json()).id,submission.id);
async function smtp(recipient,subject){
 const socket=connect(2525,'127.0.0.1');socket.setTimeout(10000,()=>socket.destroy(Error('SMTP timeout')));
 let buffer='',responses=[],waiters=[];
 socket.on('data',data=>{buffer+=data.toString();let end;while((end=buffer.indexOf('\r\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+2);if(/^\d{3} /.test(line)){const value=Number(line.slice(0,3));if(waiters.length)waiters.shift().resolve(value);else responses.push(value);}}});
 socket.on('error',error=>{for(const w of waiters.splice(0))w.reject(error);});
 const read=()=>responses.length?Promise.resolve(responses.shift()):new Promise((resolve,reject)=>waiters.push({resolve,reject}));
 const command=async line=>{socket.write(line+'\r\n');return read();};
 try{assert.equal(await read(),220);assert.equal(await command('EHLO test.example'),250);assert.equal(await command('MAIL FROM:<external@example.test>'),250);const code=await command('RCPT TO:<'+recipient+'>');if(code!==250)return code;assert.equal(await command('DATA'),354);assert.equal(await command('From: external@example.test\r\nTo: '+recipient+'\r\nSubject: '+subject+'\r\n\r\nLocal inbound test.\r\n.'),250);return code;}finally{socket.end('QUIT\r\n');}
}
const inbound='SenderPermit local inbound '+randomUUID();
assert.equal(await smtp('support@inbox.senderpermit.test',inbound),250);
await until(async()=>(await messages()).some(m=>m.Subject===inbound));
assert.ok((await smtp('unknown@inbox.senderpermit.test','Must reject'))>=500);
assert.ok((await smtp('recipient@unrelated.test','Must reject'))>=500);
assert.equal((await messages()).filter(m=>m.Subject===subject).length,1);
console.log('PASS: actual Postfix outbound and inbound delivery, idempotent replay, unknown-recipient rejection and relay rejection. Test inbox: http://localhost:8025');
