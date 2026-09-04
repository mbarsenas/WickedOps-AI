import {createServer} from 'node:http';
import {createHash,timingSafeEqual} from 'node:crypto';
import {Queue} from './queue.mjs';
import {pathToFileURL} from 'node:url';
export function service(queue,accounts){
 return createServer(async(req,res)=>{const reply=(status,b)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(b));};try{
 const token=(req.headers.authorization||'').replace(/^Bearer /,'');const digest=createHash('sha256').update(token).digest();const account=accounts.find(a=>timingSafeEqual(digest,createHash('sha256').update(a.token).digest()));if(!account)return reply(401,{error:'Unauthorized'});
 const url=new URL(req.url,'http://localhost');if(req.method==='POST'&&url.pathname==='/v1/submissions'){
 if(!req.headers['content-type']?.startsWith('application/json'))return reply(415,{error:'JSON required'});let chunks=[],size=0;for await(const chunk of req){size+=chunk.length;if(size>250000){reply(413,{error:'Message too large'});req.destroy();return;}chunks.push(chunk);}let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return reply(400,{error:'Invalid JSON'});}if(body.workspace!==account.workspace)return reply(403,{error:'Workspace mismatch'});
 const result=queue.submit(body,req.headers['idempotency-key']||'',account.domains);return reply(result.replayed?200:202,result);
 }
 if(req.method==='GET'&&url.pathname.startsWith('/v1/submissions/')){const rows=queue.status(account.workspace,decodeURIComponent(url.pathname.slice(16)));return reply(rows.length?200:404,rows.length?{recipients:rows}:{error:'Not found'});}
 reply(404,{error:'Not found'});
 }catch(e){reply(e.status|| (e.name==='ZodError'?400:500),{error:e.status?e.message:'Request could not be processed'});}});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const accounts=JSON.parse(process.env.TRANSPORT_ACCOUNTS||'[]');if(!accounts.length||accounts.some(a=>typeof a.token!=='string'||a.token.length<32||typeof a.workspace!=='string'||!Array.isArray(a.domains)||!a.domains.length))throw Error('Configure workspace-scoped credentials and provisioned domains');
 const q=new Queue(process.env.TRANSPORT_DB||'transport.sqlite');const server=service(q,accounts);server.requestTimeout=20000;server.headersTimeout=10000;server.listen(Number(process.env.PORT||4380),process.env.LOCAL_MAIL_LAB==='yes'?'0.0.0.0':'127.0.0.1',()=>console.log('Transport listening on loopback'));process.on('SIGTERM',()=>server.close(()=>{q.close();process.exit(0);}));
}
