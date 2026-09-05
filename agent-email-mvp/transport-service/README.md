# SenderPermit transport foundation

This is a separate Node 24 service, not a Sites Worker. It provides durable outbound intake and a local Postfix-compatible submission worker without Resend. It is not a production-ready public email service yet.

## Run an isolated intake service
Install the app dependencies, then run from the app root:

    node transport-service/server.mjs

Required environment:
- TRANSPORT_DB: absolute path on a durable local volume (never commit this file).
- TRANSPORT_ACCOUNTS: JSON array of `{workspace,token,domains}`. Use a UUID workspace, a random secret of at least 32 characters, and explicitly provisioned sending domains. Each credential is restricted to one workspace. Keep this in secret management, never source control.
- PORT: optional, default 4380. Service binds loopback only. A production deployment requires an authenticated HTTPS edge, host hardening, request limits and backups.

POST /v1/submissions takes `{workspace,message:{from,to,subject,text,replyTo?,headers?}}`, Bearer authorization and Idempotency-Key. Returns `stage:queued` only after the transaction commits. GET /v1/submissions/{id} returns recipient states only for the authorized workspace. This service does not grant domain ownership; provision domains only after verification and signing configuration.

## Local mail handoff
On a configured Linux mail host, run `ENABLE_MTA=yes node transport-service/worker.mjs` with the same durable database. It invokes /usr/sbin/sendmail with argument arrays and MIME on stdin. A zero exit means the local MTA accepted the message, not remote delivery or inbox placement. Postfix performs actual SMTP delivery after this handoff. Nonzero exits, timeouts and expired in-flight leases become uncertain and are not automatically replayed. Operator reconciliation is required.

Queue state, recipient state and events persist across process restarts. A hard cap of 10,000 queued/in-flight recipients applies. Suppression entries are workspace-scoped and checked both at intake and immediately before a claim. No automatic customer billing occurs here.

## Integration boundary
lib/transport/contracts.ts defines outbound submission and an HTTPS client for this service. lib/transport/resend.ts retains the existing compatibility adapter. The production app remains on Resend; the independent adapter is deliberately not switchable through a global environment flag because old provider IDs, inbound retrieval, domains and delivery webhooks still require migration. The new queue's `queued` acknowledgement must not be translated to the app's existing `email.sent` events.

## Still required before independent production cutover
- Provision Linux mail hosts, outbound mail eligibility, IPs, reverse DNS, certificates and signing keys.
- Domain provisioning and SPF/DKIM/DMARC verification; no arbitrary domains in account config.
- Inbound SMTP, durable raw-message storage and safe MIME/attachment parsing.
- Remote delivery/bounce/complaint reconciliation and suppression administration.
- Per-tenant quotas and abuse monitoring, retention, backup/restore and operational alerts.
- Per-workspace backend routing, normalized provider-independent events and migration of pending messages without replay.
- Real external deliverability tests. No real email is sent by the automated tests.

Test: `node --test transport-service/transport.test.mjs`; `npm test` for app tests.

References: https://nodejs.org/api/sqlite.html and https://www.postfix.org/sendmail.1.html
