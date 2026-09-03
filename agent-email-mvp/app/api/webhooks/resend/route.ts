import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { Resend } from 'resend';
import { sql } from '../../../../lib/db';
import { proposeReply } from '../../../../lib/runtime';
import { evaluatePolicy } from '../../../../lib/policy';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'RESEND_WEBHOOK_SECRET missing' }, { status: 500 });

  let event: any;
  try {
    event = new Webhook(secret).verify(raw, {
      'svix-id': req.headers.get('svix-id') ?? '',
      'svix-timestamp': req.headers.get('svix-timestamp') ?? '',
      'svix-signature': req.headers.get('svix-signature') ?? '',
    });
  } catch {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  if (event.type !== 'email.received') return NextResponse.json({ ok: true });

  const received = await resend.emails.receiving.get(event.data.email_id);
  const toAddress = Array.isArray(received.data?.to) ? received.data?.to[0] : received.data?.to;
  const fromAddress = received.data?.from;
  if (!toAddress || !fromAddress) return NextResponse.json({ error: 'missing addresses' }, { status: 400 });

  const identities = await sql`
    SELECT ei.id, ei.address, a.id AS agent_id, a.organization_id, a.instructions
    FROM email_identities ei JOIN agents a ON a.id = ei.agent_id
    WHERE lower(ei.address) = lower(${toAddress}) AND ei.status = 'active' AND a.status = 'active'
    LIMIT 1
  `;
  const identity = identities[0];
  if (!identity) return NextResponse.json({ error: 'unknown identity' }, { status: 404 });

  const externalThreadId = received.data?.message_id ?? event.data.email_id;
  const conversations = await sql`
    INSERT INTO conversations (agent_id, external_thread_id, subject, participant_email, last_message_at)
    VALUES (${identity.agent_id}, ${externalThreadId}, ${received.data?.subject ?? ''}, ${fromAddress}, now())
    ON CONFLICT (agent_id, external_thread_id)
    DO UPDATE SET last_message_at = now()
    RETURNING id
  `;
  const conversationId = conversations[0].id as string;

  const messages = await sql`
    INSERT INTO messages (conversation_id, direction, provider_message_id, from_address, to_address, subject, text_body, html_body, received_at)
    VALUES (${conversationId}, 'inbound', ${event.data.email_id}, ${fromAddress}, ${toAddress}, ${received.data?.subject ?? ''}, ${received.data?.text ?? ''}, ${received.data?.html ?? ''}, now())
    RETURNING id
  `;
  const messageId = messages[0].id as string;

  const proposal = await proposeReply({
    instructions: identity.instructions as string,
    subject: received.data?.subject,
    sender: fromAddress,
    message: received.data?.text ?? '',
  });

  const actions = await sql`
    INSERT INTO proposed_actions (conversation_id, agent_id, source_message_id, action_type, payload, rationale)
    VALUES (${conversationId}, ${identity.agent_id}, ${messageId}, ${proposal.action_type}, ${JSON.stringify({ to: fromAddress, subject: `Re: ${received.data?.subject ?? ''}`, text: proposal.reply_text, from: toAddress })}::jsonb, ${proposal.rationale})
    RETURNING id
  `;
  const actionId = actions[0].id as string;

  const decision = await evaluatePolicy(identity.agent_id as string, proposal.action_type, { channel: 'email' });
  await sql`INSERT INTO policy_decisions (proposed_action_id, policy_id, decision, reason) VALUES (${actionId}, ${decision.policyId}, ${decision.decision}, ${decision.reason})`;

  if (decision.decision === 'allow') {
    const sent = await resend.emails.send({ from: toAddress, to: fromAddress, subject: `Re: ${received.data?.subject ?? ''}`, text: proposal.reply_text });
    await sql`UPDATE proposed_actions SET status='executed', updated_at=now() WHERE id=${actionId}`;
    await sql`INSERT INTO messages (conversation_id, direction, provider_message_id, from_address, to_address, subject, text_body, sent_at) VALUES (${conversationId}, 'outbound', ${sent.data?.id ?? null}, ${toAddress}, ${fromAddress}, ${`Re: ${received.data?.subject ?? ''}`}, ${proposal.reply_text}, now())`;
  } else if (decision.decision === 'require_approval') {
    await sql`UPDATE proposed_actions SET status='approval_required', updated_at=now() WHERE id=${actionId}`;
    await sql`INSERT INTO approvals (proposed_action_id) VALUES (${actionId}) ON CONFLICT DO NOTHING`;
  } else {
    await sql`UPDATE proposed_actions SET status='blocked', updated_at=now() WHERE id=${actionId}`;
  }

  await sql`
    INSERT INTO audit_events (organization_id, agent_id, conversation_id, event_type, actor_type, actor_id, data)
    VALUES (${identity.organization_id}, ${identity.agent_id}, ${conversationId}, 'policy.decision', 'system', 'policy-engine', ${JSON.stringify({ action_id: actionId, decision: decision.decision, reason: decision.reason })}::jsonb)
  `;

  return NextResponse.json({ ok: true, conversation_id: conversationId, action_id: actionId, decision: decision.decision });
}
