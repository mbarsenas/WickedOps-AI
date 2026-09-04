import {connect} from 'node:net';
export async function sendInbound(subject,text){
 const socket=connect(2525,'127.0.0.1');socket.setTimeout(10000,()=>socket.destroy(Error('SMTP timeout')));
 let buffer='',responses=[],waiters=[];
 socket.on('data',data=>{buffer+=data.toString();let end;while((end=buffer.indexOf('\r\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+2);if(/^\d{3} /.test(line)){const value=Number(line.slice(0,3));if(waiters.length)waiters.shift().resolve(value);else responses.push(value);}}});
 socket.on('error',error=>{for(const w of waiters.splice(0))w.reject(error);});
 const read=()=>responses.length?Promise.resolve(responses.shift()):new Promise((resolve,reject)=>waiters.push({resolve,reject}));
 const command=async line=>{socket.write(line+'\r\n');return read();};
 const expect=(code,want)=>{if(code!==want)throw Error('Local SMTP rejected message: '+code);};
 const id=crypto.randomUUID()+'@customer.example.test';
 try{expect(await read(),220);expect(await command('EHLO local.example.test'),250);expect(await command('MAIL FROM:<customer@example.test>'),250);expect(await command('RCPT TO:<support@inbox.senderpermit.test>'),250);expect(await command('DATA'),354);
 const mime=['From: customer@example.test','To: support@inbox.senderpermit.test','Message-ID: <'+id+'>','Subject: =?UTF-8?B?'+Buffer.from(subject).toString('base64')+'?=','MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',''+Buffer.from(text).toString('base64').match(/.{1,76}/g).join('\r\n'),'.'].join('\r\n');expect(await command(mime),250);return id;
 }finally{socket.end('QUIT\r\n');}
}
