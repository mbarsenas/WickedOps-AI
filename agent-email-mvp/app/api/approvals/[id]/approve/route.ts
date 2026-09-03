import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { sql } from '../../../../../../lib/db';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await sql`
    SELECT ap.id AS approval_id, pa.id AS action_id, pa.payload, pa.conversation_id,
           a.organization_id, a.id AS agent_id
    FROM approvals ap
    JOIN proposed_actions pa ON pa.id = ap.proposed_action_id
    JOIN agents a ON a.id = pa.agent_id
    WHERE ap.id = ${id} AND ap.status = 'pending'
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return NextResponse.json({ error: 'pending approval not found' }, { status: 404 });

  const payload = row.payload as { from: string; to: string; subject: string; text: string };
  const sent = await resend.emails.send({ from: payload.from, to: payload.to, subject: payload.subject, text: payload.text });

  await sql`UPDATE approvals SET status='approved', decided_at=now(), decided_by='dashboard-user' WHERE id=${id}`;
  await sql`UPDATE proposed_actions SET status='executed', updated_at=now() WHERE id=${row.action_id}`;
  await sql`
    INSERT INTO messages (conversation_id, direction, provider_message_id, from_address, to_address, subject, text_body, sent_at)
    VALUES (${row.conversation_id}, 'outbound', ${sent.data?.id ?? null}, ${payload.from}, ${payload.to}, ${payload.subject}, ${payload.text}, now())
  `;
  await sql`
    INSERT INTO audit_events (organization_id, agent_id, conversation_id, event_type, actor_type, actor_id, data)
    VALUES (${row.organization_id}, ${row.agent_id}, ${row.conversation_id}, 'approval.approved', 'human', 'dashboard-user', ${JSON.stringify({ approval_id: id, action_id: row.action_id })}::jsonb)
  `;

  return NextResponse.json({ ok: true, sent_email_id: sent.data?.id });
}
