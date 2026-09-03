# AgentMail developer preview

Email API and isolated customer workspaces on Sites, Neon, and Resend. Sign in with ChatGPT and create a workspace. Existing ADMIN_EMAILS retain the original pilot workspace through the pinned legacy_organization setting; new customers own separate organizations.

## Available
- Self-service workspace creation and workspace-scoped records, API keys, domains, agent actions, approval decisions, and retries.
- Domain creation, DNS records, verification, and optional receiving setup without automatically changing DNS.
- POST /api/v1/emails with Bearer credentials, required Idempotency-Key, domain ownership enforcement, provider deduplication, 23-hour retry limit, atomic monthly recipient allowance, and acceptance logs.
- GET /api/v1/received returns the latest 100 workspace inbound messages.
- HMAC-signed webhook deliveries, persistent attempts and backoff, duplicate suppression, and manual retries.
- Existing governed agents, policies, approval queue, conversations, and audit trail.
- Stripe Checkout, portal, and signature-verified subscription handler, disabled until configured for the dedicated AgentMail Stripe account.

## Preview limits
- One owner workspace per customer account; invitations and workspace switching are not implemented.
- Free API allowance is 100 recipients per UTC calendar month. Pending/uncertain sends retain reserved allowance. Agent replies are separate.
- Webhook retries are processed during API, inbound-provider, and dashboard requests. Always-on background scheduling is not configured. Failed events can be retried in the dashboard.
- Inbound API returns a bounded list, without pagination or attachments. API sends support text, not templates or attachments.
- Billing requires STRIPE_SECRET_KEY (prefer a restricted runtime key), STRIPE_PRICE_ID, STRIPE_WEBHOOK_SECRET, and PAID_MONTHLY_LIMIT. Configure the Stripe endpoint /api/webhooks/stripe for customer.subscription.created, updated, and deleted. Paid plans stay disabled until all required values are present. Tax configuration must be reviewed for the dedicated business before charging customers.

## Validation
- npm run typecheck
- npm test
- On an isolated migrated Neon branch only: set TEST_DATABASE_URL and run node --experimental-test-module-mocks --import tsx scripts/verify-customers.mjs. This tests actual route authorization, tenant isolation, duplicate sending, concurrent quota enforcement, inbound isolation, and signed webhook retry. Email-provider calls are intercepted, so it sends no real email.

The Sites project is retained in .openai/hosting.json. Keep secrets out of source control. migrations/004_customer_workspaces.sql is additive and preserves the existing pilot records.
