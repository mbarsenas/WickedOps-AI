import { z } from 'zod';
import { requireUser,errorResponse } from '../../../lib/auth';
import { db,organizationId } from '../../../lib/db';
export async function POST(req:Request){
 try{const user=await requireUser(req);const b=z.object({name:z.string().trim().min(2).max(100)}).parse(await req.json());
  try{const id=await organizationId(user.email);return Response.json({id});}catch{}
  const sql=db();const rows=await sql`INSERT INTO organizations(name,owner_email) VALUES(${b.name},${user.email.toLowerCase()}) ON CONFLICT(owner_email) DO UPDATE SET owner_email=EXCLUDED.owner_email RETURNING id,name`;
  return Response.json(rows[0],{status:201});
 }catch(e){return errorResponse(e);}
}
