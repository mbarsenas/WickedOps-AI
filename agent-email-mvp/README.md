# Governed Agent Email MVP

Standalone application inside WickedOps-AI. The parent app and parent Sites project are separate and must not be deployed from this folder.

## Run

Install with npm ci. Configure .dev.vars using .env.example (never commit credentials). For local Sites sign-in set ADMIN_EMAILS=seedy@sites.test; use an isolated Neon branch. Run npm run dev -- --port 4311. Open /dashboard and use the normal local sign-in link.

## Production

The public landing page is at /. The dashboard and every management API require Sites sign-in and an ADMIN_EMAILS allowlist match. The Resend webhook at /api/webhooks/resend is public and verifies Svix signatures. Secrets belong in Sites runtime settings.

Keep DATABASE_URL pointed at AgentMail-Platform / agentmail. The additive migration migrations/002_dashboard_reliability.sql was tested on dashboard-validation before production. It adds unique message/proposal/decision indexes and processing/execution leases.

## Product

Create or edit agents, pause/resume, assign verified receiving addresses, configure exact recipient policies, inspect conversations, approve or reject exact reply text, retry failures, and read audit events. No matching policy requires human approval. Priority runs lowest first, then rule ID. Only send_email_reply is executable; no CRM, refunds, or other business actions are implemented. This is an administrator-only single-workspace MVP, not a multi-tenant service.

## Reliability

Incoming messages are deduplicated by provider ID. Messages received while paused are held and can be retried from Actions. Outbound messages use persistent execution claims plus Resend idempotency keys. A failed/uncertain send can be retried within 23 hours of its first attempt; later attempts require manual delivery reconciliation to avoid duplicate email. An approved-but-unsent action stays visible and retryable. Provider acceptance is separate from delivery; delivered/bounced/failed callbacks enter the audit trail. The application does not expose audit update/delete operations.

## Verification

Run npm test, npm run typecheck, and npm run build. scripts/verify-local.mjs exercises authentication, CSRF, agent lifecycle, policy edits, domain validation and audit against the isolated local test database. It creates test records. The build emits a Cloudflare Worker for Sites; archive only dist output, never .dev.vars or source credentials.
