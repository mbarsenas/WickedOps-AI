import {cookies} from 'next/headers';
import { neon } from '@neondatabase/serverless';
export function db() {
 const url = process.env.DATABASE_URL;
 if (!url) throw new Error('Database is not configured');
 return neon(url);
}
export async function accessibleWorkspaces(email:string){
 const sql=db();const normalized=email.toLowerCase();const admin=(process.env.ADMIN_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).includes(normalized);
 return sql`SELECT o.id,o.name,CASE WHEN o.owner_email=${normalized} OR (${admin} AND o.id::text=(SELECT value#>>'{}' FROM app_settings WHERE key='legacy_organization')) THEN 'owner' ELSE m.role END AS role FROM organizations o LEFT JOIN workspace_members m ON m.organization_id=o.id AND m.email=${normalized} WHERE m.email IS NOT NULL OR o.owner_email=${normalized} OR (${admin} AND o.id::text=(SELECT value#>>'{}' FROM app_settings WHERE key='legacy_organization')) ORDER BY o.created_at,o.id`;
}
export async function organizationId(email?:string,requested?:string){
 if(!email)throw Error('Workspace identity is required');
 let selected=requested;if(selected===undefined){try{selected=(await cookies()).get('agentmail_workspace')?.value;}catch{}}
 const rows=await accessibleWorkspaces(email);if(selected){const match=rows.find(r=>r.id===selected);if(match)return match.id as string;if(requested!==undefined)throw Error('Workspace access denied');}
 if(!rows[0])throw Error('Workspace is not initialized');return rows[0].id as string;
}
export async function audit(event: string, actor: string, data: unknown, agentId: string|null=null, conversationId: string|null=null,organization?:string) {
 const sql=db(); const org=organization||(agentId?(await sql`SELECT organization_id FROM agents WHERE id=${agentId}`)[0]?.organization_id:await organizationId(actor));
 if(!org)throw new Error('Audit workspace is required');
 await sql`INSERT INTO audit_events(organization_id,agent_id,conversation_id,event_type,actor_type,actor_id,data) VALUES(${org},${agentId},${conversationId},${event},${actor==='system'?'system':'human'},${actor},${JSON.stringify(data)}::jsonb)`;
}

