import { neon } from '@neondatabase/serverless';
export function db() {
 const url = process.env.DATABASE_URL;
 if (!url) throw new Error('Database is not configured');
 return neon(url);
}
export async function organizationId(email?:string) {
 const sql=db();
 if(!email)throw new Error('Workspace identity is required');
 const admins=(process.env.ADMIN_EMAILS||'').split(',').map(s=>s.trim().toLowerCase());
 const rows=admins.includes(email.toLowerCase())
  ? await sql`SELECT o.id FROM organizations o JOIN app_settings s ON s.key='legacy_organization' AND s.value=to_jsonb(o.id::text)`
  : await sql`SELECT id FROM organizations WHERE owner_email=${email.toLowerCase()}`;
 if (!rows[0]) throw new Error('Workspace is not initialized');
 return rows[0].id as string;
}
export async function audit(event: string, actor: string, data: unknown, agentId: string|null=null, conversationId: string|null=null,organization?:string) {
 const sql=db(); const org=organization||(agentId?(await sql`SELECT organization_id FROM agents WHERE id=${agentId}`)[0]?.organization_id:await organizationId(actor));
 if(!org)throw new Error('Audit workspace is required');
 await sql`INSERT INTO audit_events(organization_id,agent_id,conversation_id,event_type,actor_type,actor_id,data) VALUES(${org},${agentId},${conversationId},${event},${actor==='system'?'system':'human'},${actor},${JSON.stringify(data)}::jsonb)`;
}

