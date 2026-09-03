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
- Webhook retries are processed during API, inbound-provider, and dashboard requests. A GitHub Actions scheduler also invokes the protected dispatcher every five minutes. Scheduling is best effort and GitHub can delay or skip runs. Public-repository schedules can be disabled after 60 days without repository activity; monitor webhook_scheduler_status in app_settings. Failed events can be retried in the dashboard.
- Inbound API returns a bounded list, without pagination or attachments. API sends support text, not templates or attachments.
- Billing requires STRIPE_SECRET_KEY (prefer a restricted runtime key), STRIPE_PRICE_ID, STRIPE_WEBHOOK_SECRET, and PAID_MONTHLY_LIMIT. Configure the Stripe endpoint /api/webhooks/stripe for customer.subscription.created, updated, and deleted. Paid plans stay disabled until all required values are present. Tax configuration must be reviewed for the dedicated business before charging customers.

## Validation
- npm run typecheck
- npm test
- On an isolated migrated Neon branch only: set TEST_DATABASE_URL and run node --experimental-test-module-mocks --import tsx scripts/verify-customers.mjs. This tests actual route authorization, tenant isolation, duplicate sending, concurrent quota enforcement, inbound isolation, and signed webhook retry. Email-provider calls are intercepted, so it sends no real email.

The Sites project is retained in .openai/hosting.json. Keep secrets out of source control. migrations/004_customer_workspaces.sql is additive and preserves the existing pilot records.

## Starter and AI drafting
Starter is $20/month for 10,000 API email recipients per UTC calendar month; governance features are included. AI drafting is separate and never automatically billed. New workspaces start with no AI allocation; the existing pilot retains 100 draft attempts/month. Operators can allocate a monthly_limit using app_settings key ai_allowance/<organization UUID>. Attempts reserve atomically, including failed calls; provider-reported input/output tokens are metered separately. Exhausted drafting holds inbound agent jobs for review. Counters reset by UTC month without deleting history.

## Background delivery
The operations/agentmail-webhooks.yml workflow is installed as .github/workflows/agentmail-webhooks.yml on the repository default branch. Set AGENTMAIL_WEBHOOK_SCHEDULER_SECRET in GitHub Actions to the same value as Sites WEBHOOK_SCHEDULER_SECRET. POST /api/internal/webhook-dispatch requires this bearer secret. Each run handles at most two workspaces (five deliveries each), with a database lease preventing overlapping runs. This preview needs higher-capacity scheduling before sustained production volume.

## Release verification
Run only against an isolated Neon branch, with TEST_DATABASE_URL set to that branch:
- `node --experimental-test-module-mocks --import tsx scripts/verify-billing.mjs`: actual Stripe signature validation plus simulated subscription activation, payment failure/recovery, cancellation, stale events, and ownership checks.
- `node --import tsx scripts/verify-webhook-network.mjs`: real local HTTP receiver exercises failure/recovery, HMAC, backoff, concurrent scheduler leases, and retry exhaustion. This disables copied webhook endpoints in the isolated branch; never point it at production.
- `node --experimental-test-module-mocks --import tsx scripts/verify-stripe-sandbox.mjs`: requires STRIPE_TEST_SECRET_KEY for the dedicated AgentMail sandbox and TEST_BRANCH_HOST matching the isolated database hostname. Rejects live keys; creates and cleans up test subscriptions. Actual hosted Checkout completion and externally delivered Stripe webhooks remain separate checks.

September 3 verification: billing-handler and local-network webhook tests passed. GitHub workflow is active and its manual invocation passed; scheduled failure/recovery has not been observed. The sandbox runner is prepared and syntax-checked, but awaits its sandbox key and has not been executed. Production billing and tax settings are unchanged.
