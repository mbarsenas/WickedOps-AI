import {createServer,connect} from 'node:net';
// Fixed destinations only; the isolated mail network has no outbound route.
for(const [port,host,target] of [[4380,'transport',4380],[2525,'transport',25],[8025,'inbox',8025]]){
 createServer(client=>{
  const upstream=connect(target,host);
  client.on('error',()=>upstream.destroy());
  upstream.on('error',()=>client.destroy());
  client.on('close',()=>upstream.destroy());
  upstream.on('close',()=>client.destroy());
  client.pipe(upstream).pipe(client);
 }).listen(port,'0.0.0.0');
}
