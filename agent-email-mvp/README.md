# Governed Agent Email MVP

Core product thesis:

`AI Agent -> Email Identity -> Policy -> Send/Receive -> Conversation -> Actions -> Audit`

This vertical slice uses Resend for transport and Neon Postgres for durable state. It supports inbound-message ingestion, conversation persistence, proposed agent actions, policy decisions (`allow`, `require_approval`, `block`), approvals, execution, and append-only audit events.

## End-to-end flow

1. Resend posts `email.received` to `/api/webhooks/resend`.
2. The app resolves the recipient to an email identity and agent.
3. The message is persisted and attached to a conversation.
4. The agent runtime produces a proposed `send_email_reply` action.
5. The policy engine evaluates matching rules by priority.
6. `allow` executes immediately, `require_approval` creates a pending approval, and `block` records the denial.
7. Every transition is written to `audit_events`.

## Environment

- `DATABASE_URL`
- `RESEND_API_KEY`
- `RESEND_WEBHOOK_SECRET`
- `OPENAI_API_KEY`
- `APP_BASE_URL`

## MVP API

- `POST /api/webhooks/resend`
- `GET /api/agents`
- `POST /api/agents`
- `GET /api/conversations`
- `GET /api/approvals`
- `POST /api/approvals/:id/approve`
- `POST /api/approvals/:id/reject`
- `GET /api/audit`
