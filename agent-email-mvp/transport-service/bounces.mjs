import {createHmac,timingSafeEqual} from 'node:crypto';
import {Queue} from './queue.mjs';
import {pathToFileURL} from 'node:url';

function settings(){
 const domain=process.env.BOUNCE_DOMAIN,secret=process.env.BOUNCE_SECRET;
 if(!domain||!/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(domain)||!secret||secret.length<40)throw Error('Bounce signing configuration required');
 return {domain:domain.toLowerCase(),secret};
}
export function returnPath(id){const {domain,secret}=settings();const compact=id.replaceAll('-','');if(!/^[a-f0-9]{32}$/.test(compact))throw Error('Invalid recipient id');const sig=createHmac('sha256',secret).update(compact).digest('hex').slice(0,24);return `${compact}.${sig}@${domain}`;}
export function processBounce(q,address,reports){
 const match=/^([a-f0-9]{32})\.([a-f0-9]{24})@([a-z0-9.-]+)$/.exec(address.toLowerCase());if(!match)return false;
 const id=match[1].replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,'$1-$2-$3-$4-$5');
 const expected=returnPath(id);if(expected.length!==address.length||!timingSafeEqual(Buffer.from(expected),Buffer.from(address.toLowerCase())))return false;
 q.db.exec(`CREATE TABLE IF NOT EXISTS bounce_reports(recipient_id TEXT NOT NULL,status TEXT NOT NULL,action TEXT NOT NULL,at INTEGER NOT NULL,UNIQUE(recipient_id,status,action))`);
 q.db.exec('BEGIN IMMEDIATE');try{
 const row=q.db.prepare('SELECT r.*,s.workspace FROM recipients r JOIN submissions s ON s.id=r.submission WHERE r.id=?').get(id);
 if(!row||!['submitting','mta_accepted','uncertain','deferred','bounced'].includes(row.state)){q.db.exec('COMMIT');return false;}
 let recorded=false;
 for(const report of reports){
 if(typeof report.recipient!=='string'||report.recipient.toLowerCase()!==row.recipient.toLowerCase())continue;
 const {status,action}=report;
 if(!((action==='failed'&&/^5\.\d{1,3}\.\d{1,3}$/.test(status))||(action==='delayed'&&/^4\.\d{1,3}\.\d{1,3}$/.test(status))))continue;
 const inserted=q.db.prepare('INSERT OR IGNORE INTO bounce_reports VALUES(?,?,?,?)').run(id,status,action,Date.now());if(!inserted.changes)continue;
 const state=action==='failed'?'bounced':'deferred';
 if(row.state!=='bounced'||state==='bounced'){
 q.db.prepare('UPDATE recipients SET state=?,error=?,lease=NULL WHERE id=?').run(state,status,id);
 q.db.prepare('INSERT INTO events(recipient_id,state,at) VALUES(?,?,?)').run(id,state,Date.now());row.state=state;
 }
 // Only a definite nonexistent mailbox suppresses future mail, not policy or quota failures.
 if(action==='failed'&&status==='5.1.1')q.db.prepare('INSERT OR IGNORE INTO suppressions VALUES(?,?,?)').run(row.workspace,row.recipient.toLowerCase(),'dsn:5.1.1');
 recorded=true;
 }
 q.db.exec('COMMIT');return recorded;
 }catch(e){q.db.exec('ROLLBACK');throw e;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const chunks=[];let size=0;for await(const chunk of process.stdin){size+=chunk.length;if(size>1000000)throw Error('Report too large');chunks.push(chunk);}
 const q=new Queue(process.env.TRANSPORT_DB);try{processBounce(q,process.argv[2],JSON.parse(Buffer.concat(chunks).toString()));}finally{q.close();}
}
