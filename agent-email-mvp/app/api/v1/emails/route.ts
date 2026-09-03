import { z } from 'zod';
import { db } from '../../../../lib/db';
import { mail } from '../../../../lib/email';
export const dynamic='force-dynamic';
const schema=z.object({from:z.string().email(),to:z.union([z.string().email(),z.array(z.string().email()).min(1).max(50)]),subject:z.string().min(1).max(998),text:z.string().min(1).max(200000),reply_to:z.string().email().optional()});
const hash=async(v:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)))).map(x=>x.toString(16).padStart(2,'0')).join('');
export async function POST(req:Request){
 const sql=db();const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
 if(!token.startsWith('am_live_'))return Response.json({error:{type:'authentication_error',message:'Use a valid Bearer API key.'}},{status:401});
 const key=(await sql`SELECT id,organization_id FROM api_keys WHERE key_hash=${await hash(token)} AND revoked_at IS NULL LIMIT 1`)[0];
 if(!key)return Response.json({error:{type:'authentication_error',message:'API key is invalid or revoked.'}},{status:401});
 try{const body=schema.parse(await req.json());const to=Array.isArray(body.to)?body.to:[body.to];
  const result=await mail().emails.send({from:body.from,to,subject:body.subject,text:body.text,replyTo:body.reply_to});
  if(result.error)throw new Error(result.error.message);
  await Promise.all([sql`UPDATE api_keys SET last_used_at=now() WHERE id=${key.id}`,sql`INSERT INTO email_api_events(organization_id,api_key_id,provider_id,from_address,to_addresses,subject,status) VALUES(${key.organization_id},${key.id},${result.data?.id||null},${body.from},${to},${body.subject},'accepted')`,sql`INSERT INTO audit_events(organization_id,event_type,actor_type,actor_id,data) VALUES(${key.organization_id},'api.email.accepted','api_key',${key.id},${JSON.stringify({provider_id:result.data?.id,from:body.from,to,subject:body.subject})}::jsonb)`]);
  return Response.json({id:result.data?.id,status:'accepted'},{status:202});
 }catch(e){const message=e instanceof Error?e.message:'Invalid request';return Response.json({error:{type:'invalid_request_error',message}},{status:400});}
}
