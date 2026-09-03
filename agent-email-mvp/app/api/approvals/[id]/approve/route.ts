import { requireWorkspace,errorResponse,HttpError } from '../../../../../lib/auth';
import { db } from '../../../../../lib/db';
import { executeAction } from '../../../../../lib/email';
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 try{
 const user=await requireWorkspace(req);const {id}=await params;const sql=db();
 const owned=await sql`SELECT ap.id FROM approvals ap JOIN proposed_actions p ON p.id=ap.proposed_action_id JOIN agents a ON a.id=p.agent_id WHERE ap.id=${id} AND a.organization_id=${user.organization_id}`;
 if(!owned[0])throw new HttpError(404,'Approval not found.');
 const rows=await sql`WITH changed AS(UPDATE approvals SET status='approved',decided_at=now(),decided_by=${user.email} WHERE id=${id} AND status='pending' RETURNING *) INSERT INTO audit_events(organization_id,agent_id,conversation_id,event_type,actor_type,actor_id,data) SELECT a.organization_id,a.id,p.conversation_id,'approval.approved','human',${user.email},jsonb_build_object('approval_id',changed.id,'action_id',p.id) FROM changed JOIN proposed_actions p ON p.id=changed.proposed_action_id JOIN agents a ON a.id=p.agent_id RETURNING data`;
 if(!rows[0])throw new HttpError(409,'This approval has already been decided.');
 return Response.json(await executeAction(rows[0].data.action_id,user.email));
 }catch(e){return errorResponse(e);}
}

