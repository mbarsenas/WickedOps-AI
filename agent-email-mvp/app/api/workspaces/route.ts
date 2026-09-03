import {z} from 'zod';
import {cookies} from 'next/headers';
import {requireUser,errorResponse,HttpError} from '../../../lib/auth';
import {db,organizationId,accessibleWorkspaces,audit} from '../../../lib/db';
export async function GET(){try{const u=await requireUser();return Response.json({workspaces:await accessibleWorkspaces(u.email)},{headers:{'Cache-Control':'private, no-store'}});}catch(e){return errorResponse(e);}}
export async function POST(req:Request){try{
 const u=await requireUser(req);const b=z.object({action:z.enum(['create','switch','rename']).default('create'),name:z.string().trim().min(2).max(100).optional(),id:z.string().uuid().optional(),request_id:z.string().uuid().optional()}).parse(await req.json());const sql=db();let id:string;
 if(b.action==='create'){
  if(!b.name)throw new HttpError(400,'Enter a workspace name.');
  const existing=await accessibleWorkspaces(u.email);
  if(!b.request_id&&existing.length){id=existing[0].id;}else{
   const request=b.request_id||crypto.randomUUID();const proposed=request;
   // One statement creates the workspace and its membership atomically; UUID retries reuse the same result.
   const rows=await sql`WITH claim AS (INSERT INTO organizations(id,name) SELECT ${proposed},${b.name} WHERE NOT EXISTS(SELECT 1 FROM workspace_creation_requests WHERE email=${u.email} AND request_id=${request}) ON CONFLICT(id) DO NOTHING RETURNING id), recorded AS (INSERT INTO workspace_creation_requests(email,request_id,organization_id) SELECT ${u.email},${request},id FROM claim ON CONFLICT(email,request_id) DO NOTHING RETURNING organization_id), member AS (INSERT INTO workspace_members(organization_id,email,role) SELECT organization_id,${u.email},'owner' FROM recorded RETURNING organization_id) SELECT organization_id FROM member UNION ALL SELECT organization_id FROM workspace_creation_requests WHERE email=${u.email} AND request_id=${request}`;
   id=rows[0]?.organization_id;if(!id)throw new HttpError(409,'Workspace is being created. Try again.');
   await audit('workspace.created',u.email,{name:b.name},null,null,id);
  }
 }else{
  if(!b.id)throw new HttpError(400,'Choose a workspace.');
  try{id=await organizationId(u.email,b.id);}catch{throw new HttpError(403,'You do not have access to this workspace.');}
  if(b.action==='rename'){if(!b.name)throw new HttpError(400,'Enter a workspace name.');const row=(await accessibleWorkspaces(u.email)).find(w=>w.id===id);if(row?.role!=='owner')throw new HttpError(403,'Only an owner can rename this workspace.');await sql`UPDATE organizations SET name=${b.name} WHERE id=${id}`;await audit('workspace.renamed',u.email,{name:b.name},null,null,id);}
 }
 (await cookies()).set('agentmail_workspace',id,{httpOnly:true,secure:new URL(req.url).protocol==='https:',sameSite:'lax',path:'/',maxAge:31536000});return Response.json({id});
}catch(e){return errorResponse(e);}}
