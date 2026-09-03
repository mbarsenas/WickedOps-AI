import { requireWorkspace,errorResponse,HttpError } from '../../../../../lib/auth';
import { db } from '../../../../../lib/db';
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 try{const user=await requireWorkspace(req);const {id}=await params;const sql=db();
 const owned=await sql`SELECT ap.id FROM approvals ap JOIN proposed_actions p ON p.id=ap.proposed_action_id JOIN agents a ON a.id=p.agent_id WHERE ap.id=${id} AND a.organization_id=${user.organization_id}`;
 if(!owned[0])throw new HttpError(404,'Approval not found.');
 const rows=await sql`WITH changed AS(UPDATE approvals SET status='rejected',decided_at=now(),decided_by=${user.email} WHERE id=${id} AND status='pending' RETURNING proposed_action_id), action AS(UPDATE proposed_actions SET status='rejected',updated_at=now() WHERE id IN(SELECT proposed_action_id FROM changed) RETURNING *) INSERT INTO audit_events(organization_id,agent_id,conversation_id,event_type,actor_type,actor_id,data) SELECT a.organization_id,a.id,action.conversation_id,'approval.rejected','human',${user.email},jsonb_build_object('approval_id',${id}::text,'action_id',action.id) FROM action JOIN agents a ON a.id=action.agent_id RETURNING id`;
 if(!rows[0])throw new HttpError(409,'This approval has already been decided.');
 return Response.json({ok:true});
 }catch(e){return errorResponse(e);}
}

