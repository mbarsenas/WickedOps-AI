import { neon } from '@neondatabase/serverless';
export function db() {
 const url = process.env.DATABASE_URL;
 if (!url) throw new Error('Database is not configured');
 return neon(url);
}
export async function organizationId() {
 const sql=db();
 const rows=await sql`SELECT id FROM organizations ORDER BY created_at LIMIT 1`;
 if (!rows[0]) throw new Error('Workspace is not initialized');
 return rows[0].id as string;
}
export async function audit(event: string, actor: string, data: unknown, agentId: string|null=null, conversationId: string|null=null) {
 const sql=db(); const org=await organizationId();
 await sql`INSERT INTO audit_events(organization_id,agent_id,conversation_id,event_type,actor_type,actor_id,data) VALUES(${org},${agentId},${conversationId},${event},${actor==='system'?'system':'human'},${actor},${JSON.stringify(data)}::jsonb)`;
}

