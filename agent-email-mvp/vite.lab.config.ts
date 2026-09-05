import {defineConfig} from 'vite';
import vinext from 'vinext';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
const file=(path:string)=>fileURLToPath(new URL(path,import.meta.url)).replaceAll('\\','/');
export default defineConfig(({command})=>{
 if(command!=='serve'||!process.env.DATABASE_URL?.includes('ep-wispy-bird-')||!process.env.LAB_TRANSPORT_TOKEN)throw Error('Start using the isolated local dashboard launcher');
 const session=randomUUID();
 process.env.LAB_SESSION=session;
 const aliases=new Map([
  [file('./app/chatgpt-auth.ts'),file('./transport-service/lab/local-auth.ts')],
  [file('./lib/transport/active.ts'),file('./transport-service/lab/dashboard-transport.ts')],
  [file('./lib/local-lab.ts'),file('./transport-service/lab/dashboard-actions.ts')],
  [file('./lib/runtime.ts'),file('./transport-service/lab/sample-runtime.ts')]
 ]);
 return {envDir:false,ssr:{external:["svix","resend","openai","stripe"]},server:{host:'127.0.0.1',port:4312,strictPort:true,allowedHosts:['localhost','127.0.0.1']},plugins:[
  {name:'local-mail-lab',enforce:'pre',async resolveId(source,importer){if(!importer||!source.startsWith('.'))return null;const resolved=fileURLToPath(new URL(source,'file:///'+importer.replaceAll('\\','/').replace(/^\//,''))).replaceAll('\\','/');return aliases.get(resolved.endsWith('.ts')?resolved:resolved+'.ts')||null;},configureServer(server){server.middlewares.use((req,res,next)=>{
   const host=req.headers.host;if(!['localhost:4312','127.0.0.1:4312'].includes(host||'')){res.statusCode=403;res.end('Local access only');return;}
   delete req.headers['oai-authenticated-user-email'];delete req.headers['oai-authenticated-user-full-name'];
   const url=new URL(req.url||'/','http://'+host);
   if(req.headers.origin&&!['http://localhost:4312','http://127.0.0.1:4312'].includes(req.headers.origin)){res.statusCode=403;res.end('Origin rejected');return;}
   if(url.pathname==='/signin-with-chatgpt'){res.setHeader('set-cookie','senderpermit_lab='+session+'; HttpOnly; SameSite=Strict; Path=/');res.statusCode=302;res.setHeader('location','/dashboard');res.end();return;}
   if(url.pathname==='/signout-with-chatgpt'){res.setHeader('set-cookie','senderpermit_lab=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/');res.statusCode=302;res.setHeader('location','/sign-in');res.end();return;}
   if(req.headers.cookie?.split(';').some(c=>c.trim()==='senderpermit_lab='+session))req.headers['oai-authenticated-user-email']='owner@senderpermit.test';
   next();
  });}},vinext()
 ]};
});
