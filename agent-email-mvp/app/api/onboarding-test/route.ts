import {z} from 'zod';
import {requireWorkspace,errorResponse,HttpError} from '../../../lib/auth';
import {db} from '../../../lib/db';
import {sendApi,digest} from '../../../lib/api-send';
export async function POST(req:Request){try{
 const u=await requireWorkspace(req);const b=z.object({from:z.string().email(),request_id:z.string().uuid()}).parse(await req.json());const sql=db();
 const active=await sql`SELECT id FROM api_keys WHERE organization_id=${u.organization_id} AND revoked_at IS NULL LIMIT 1`;if(!active[0])throw new HttpError(400,'Create and save your API key first.');
 const token='am_live_'+crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
 const key=(await sql`INSERT INTO api_keys(organization_id,name,key_prefix,key_hash) VALUES(${u.organization_id},'Onboarding test (temporary)',${token.slice(0,16)},${await digest(token)}) RETURNING id`)[0];
 try{return await sendApi(new Request(req.url,{method:'POST',headers:{authorization:'Bearer '+token,'Idempotency-Key':'onboarding/'+b.request_id,'Content-Type':'application/json'},body:JSON.stringify({from:b.from,to:u.email,subject:'Your AgentMail test email',text:'Your AgentMail workspace can send email. This test was sent through the same API and allowance checks used by your application.'})}));}finally{await sql`UPDATE api_keys SET revoked_at=now() WHERE id=${key.id}`;}
}catch(e){return errorResponse(e);}}
