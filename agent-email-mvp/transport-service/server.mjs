import {createServer} from 'node:http';
import {createHash,timingSafeEqual} from 'node:crypto';
import {Queue} from './queue.mjs';
import {pathToFileURL} from 'node:url';
export function service(queue,accounts){
 return createServer(async(req,res)=>{const reply=(status,b)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(b));};try{
 const token=(req.headers.authorization||'').replace(/^Bearer /,'');const digest=createHash('sha256').update(token).digest();const equal=v=>typeof v==='string'&&v.length>0&&timingSafeEqual(digest,createHash('sha256').update(v).digest());const controller=equal(process.env.CONTROL_TOKEN);const account=accounts.find(a=>equal(a.token));if(!account&&!controller)return reply(401,{error:'Unauthorized'});
 const url=new URL(req.url,'http://localhost');
 if(controller&&req.method==='POST'&&url.pathname==='/v1/control/domains'){
  let chunks=[],size=0;for await(const chunk of req){size+=chunk.length;if(size>10000)return reply(413,{error:'Request too large'});chunks.push(chunk);}let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return reply(400,{error:'Invalid JSON'});}if(!/^[0-9a-f-]{36}$/i.test(body.workspace||'')||!(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/).test(body.domain||''))return reply(400,{error:'Invalid workspace or domain'});queue.provision(body.workspace,body.domain,body.receiving===true);return reply(200,{ok:true,records:[{type:'TXT',name:'mail._domainkey.'+body.domain,value:process.env.DKIM_PUBLIC_RECORD,status:'pending'},{type:'TXT',name:body.domain,value:'v=spf1 ip4:'+(process.env.PUBLIC_MAIL_IP||'84.247.132.83')+' -all',status:'pending'}]});
 }
 if(controller&&req.method==='POST'&&url.pathname==='/v1/control/recipients'){
  let chunks=[];for await(const chunk of req)chunks.push(chunk);let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return reply(400,{error:'Invalid JSON'});}if(!/^[0-9a-f-]{36}$/i.test(body.workspace||'')||!/^[^\s<>@]+@(?:[a-z0-9-]+\.)+[a-z]{2,63}$/.test(body.recipient||''))return reply(400,{error:'Invalid workspace or recipient'});const domain=body.recipient.split('@')[1];if(!queue.domains(body.workspace).some(d=>d.domain===domain&&d.receiving))return reply(403,{error:'Receiving domain is not provisioned'});queue.provisionRecipient(body.workspace,body.recipient);return reply(200,{ok:true});
 }
 if(req.method==='GET'&&url.pathname==='/v1/inbound')return reply(200,{messages:queue.db.prepare('SELECT id,created FROM inbound WHERE workspace=? AND acknowledged=0 ORDER BY created,id LIMIT 10').all(account.workspace)});
 const inbound=/^\/v1\/inbound\/(spi_[a-f0-9]{64})(\/ack)?$/.exec(url.pathname);
 if(inbound){const row=queue.db.prepare('SELECT payload FROM inbound WHERE id=? AND workspace=?').get(inbound[1],account.workspace);if(!row)return reply(404,{error:'Not found'});if(req.method==='GET'&&!inbound[2])return reply(200,JSON.parse(row.payload));if(req.method==='POST'&&inbound[2]){queue.db.prepare('UPDATE inbound SET acknowledged=1 WHERE id=? AND workspace=?').run(inbound[1],account.workspace);return reply(200,{ok:true});}}
if(req.method==='POST'&&url.pathname==='/v1/submissions'){
 if(!req.headers['content-type']?.startsWith('application/json'))return reply(415,{error:'JSON required'});let chunks=[],size=0;for await(const chunk of req){size+=chunk.length;if(size>250000){reply(413,{error:'Message too large'});req.destroy();return;}chunks.push(chunk);}let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return reply(400,{error:'Invalid JSON'});}if(!controller&&body.workspace!==account.workspace)return reply(403,{error:'Workspace mismatch'});
 const allowed=controller?queue.domains(body.workspace).map(d=>d.domain):account.domains;const result=queue.submit(body,req.headers['idempotency-key']||'',allowed);return reply(result.replayed?200:202,result);
 }
 if(req.method==='GET'&&url.pathname.startsWith('/v1/submissions/')){const workspace=controller?req.headers['x-senderpermit-workspace']:account.workspace;if(!workspace)return reply(400,{error:'Workspace required'});const rows=queue.status(workspace,decodeURIComponent(url.pathname.slice(16)));return reply(rows.length?200:404,rows.length?{recipients:rows}:{error:'Not found'});}
 reply(404,{error:'Not found'});
 }catch(e){reply(e.status|| (e.name==='ZodError'?400:500),{error:e.status?e.message:'Request could not be processed'});}});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const accounts=JSON.parse(process.env.TRANSPORT_ACCOUNTS||'[]');if(!accounts.length||accounts.some(a=>typeof a.token!=='string'||a.token.length<32||typeof a.workspace!=='string'||!Array.isArray(a.domains)))throw Error('Configure workspace-scoped credentials and provisioned domains');
 const q=new Queue(process.env.TRANSPORT_DB||'transport.sqlite');const server=service(q,accounts);server.requestTimeout=20000;server.headersTimeout=10000;server.listen(Number(process.env.PORT||4380),process.env.LOCAL_MAIL_LAB==='yes'?'0.0.0.0':'127.0.0.1',()=>console.log('Transport listening on loopback'));process.on('SIGTERM',()=>server.close(()=>{q.close();process.exit(0);}));
}
