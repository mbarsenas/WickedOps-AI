# SenderPermit local mail lab

Run `./transport-service/lab/start-local.ps1` from PowerShell with Docker Desktop running. The script generates a local-only credential in ignored `.env`, builds Postfix and the transport service, and starts a persistent Mailpit test inbox.

Open http://localhost:8025 to view test mail. The submission API is at http://localhost:4380. Test inbound SMTP is localhost:2525 and accepts only support@inbox.senderpermit.test. Unknown recipients and unrelated relay destinations are rejected. Outbound mail always routes into Mailpit. Docker's internal network prevents external delivery; no GoDaddy DNS records or real mailboxes are changed.

Run `node transport-service/lab/verify.mjs` for an end-to-end local test: authenticated HTTP submission, queue, worker, actual Postfix handoff, SMTP reception in Mailpit, replay check, inbound SMTP and unauthorized relay rejection.

Stop without deleting messages:
`docker compose -f transport-service/lab/compose.yaml --env-file transport-service/lab/.env stop`

Data lives in dedicated Docker volumes. Do not remove volumes unless intentionally deleting test mail. The API credential is local-only; it is not a production key. The lab does not use Resend or make AI calls. Mailpit simulates recipient inboxes. This is not a production SMTP configuration: it intentionally has no public TLS/DKIM/DNS setup or external delivery path. A later production deployment needs those plus transport events, bounce/complaint handling, abuse controls and ingress integration with the application.

The fixed-destination gateway exposes the three localhost ports. Only the gateway joins the access network; Postfix and Mailpit remain on the internal network. It is not a general-purpose proxy. Debian Postfix's SMTP chroot is disabled inside the lab container so Docker DNS and the recipient allowlist resolve correctly.

Verified locally: outbound API-to-Postfix-to-Mailpit delivery, inbound SMTP delivery to the allowed recipient, duplicate submission replay without duplicate mail, rejection of unknown inbound recipients, and rejection of unrelated relay destinations. These checks passed again after rebuilding and recreating the transport container with persistent volumes. Local MTA acceptance is still not a public delivery receipt.

## Connected SenderPermit dashboard

Start the mail lab first, then run `node transport-service/lab/start-dashboard.mjs` from the app directory. Open http://localhost:4312/signin-with-chatgpt to enter the local workspace. The local sign-in creates a localhost-only test session; it is not a ChatGPT sign-in or a production login.

The launcher reads the ignored `dashboard.env` file containing `DATABASE_URL` for the existing isolated test branch (ep-wispy-bird). It explicitly overrides inherited database configuration and clears production email, billing, authentication and model credentials. It creates only the dedicated lab workspace and its local domains/identity. Keep this file private. The database is an isolated Neon test database, not a database running on this computer.

In Overview, create an API key to enable the outgoing test, or click Receive test message to send a real SMTP message into Postfix. Incoming mail is imported into Conversations and processed through the existing policy/approval logic. A sample reply waits in Approvals. Approve sends through the local queue and Postfix into Mailpit; Reject sends nothing. The dashboard checks incoming mail every ten seconds while open. Held or failed messages remain available for explicit retry in Actions. API mail remains labeled queued: this lab does not manufacture public delivery receipts.

Drafting is an explicitly labeled deterministic test fixture; there are no model calls or AI allowance deductions. Real AI integration is not part of this lab step. The lab uses the same production API-key, quota, policy, approval, rejection and audit handlers, with local transport and sign-in adapters supplied only by `vite.lab.config.ts`. The ordinary build keeps Resend and normal authentication, and the lab route returns 404. The lab config refuses production builds.

Run `node transport-service/lab/verify-dashboard.mjs` while the dashboard is running to verify unauthenticated rejection, CSRF, API delivery, replay without duplication, inbound conversations, pending approvals with no early send, approval delivery, rejection, repeat approval rejection and audit records. The script creates test messages and revokes its test API key afterward. Stop the dashboard with Ctrl+C; Docker mail services can remain running.
