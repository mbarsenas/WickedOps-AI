import {db} from '../../../../lib/db';
import {digest} from '../../../../lib/api-send';
import {errorResponse} from '../../../../lib/auth';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{
 const token=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');if(!/^am_live_[a-f0-9]{64}$/.test(token))return Response.json({error:'Invalid API key'},{status:401});
 const sql=db();const key=(await sql`SELECT organization_id FROM api_keys WHERE key_hash=${await digest(token)} AND revoked_at IS NULL`)[0];if(!key)return Response.json({error:'Invalid API key'},{status:401});
 const rows=await sql`SELECT id,from_address,to_addresses,subject,text_body,created_at FROM inbound_emails WHERE organization_id=${key.organization_id} ORDER BY created_at DESC LIMIT 100`;
 return Response.json({data:rows},{headers:{'Cache-Control':'private, no-store'}});
}catch(e){return errorResponse(e);}}
