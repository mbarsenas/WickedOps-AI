# SenderPermit independent email transport: architecture decision

Status: proposed implementation architecture; not a claim of existing capability.

## Objective
Replace Resend as the transport dependency with SenderPermit-operated sending and receiving infrastructure. Preserve the customer API, dashboard, workspaces, policies, approvals, billing and audit records. Infrastructure hosting and an established mail-transfer engine are compatible with this objective; reselling another email API as our own transport is not the intended endpoint.

## Verified current coupling
- lib/api-send.ts calls Resend directly for customer API sends. Existing quota reservations, workspace-scoped idempotency and uncertain-send handling must survive migration.
- lib/email.ts calls Resend for governed replies and retrieves inbound message bodies from its receiving API.
- lib/domains.ts delegates domain provisioning, verification and DNS records to Resend.
- app/api/[...path]/route.ts enables receiving through Resend and exposes Resend-specific configuration.
- app/api/webhooks/resend/route.ts verifies provider events and translates delivery outcomes into application records.
- lib/inbound.ts already routes captured incoming messages to workspaces based on enabled receiving domains; preserve tenant isolation.

## Target responsibilities
Keep the web application as the management service. Deploy mail transport separately, with an authenticated internal submission API, a durable delivery queue, a maintained mail-transfer engine, and an inbound SMTP receiver. Select the engine and hosting only after checking current operational requirements and host policies; neither is selected here.

Outbound: customer API or approved agent action -> authenticated durable submission -> transport queue -> DKIM signing -> SMTP delivery -> per-recipient outcomes -> normalized application events.
Inbound: customer MX -> SMTP recipient/domain validation -> durable raw-message storage -> parsing and limits -> workspace routing -> customer webhook / agent workflow.

Use a stable SenderPermit message ID independent of any backend. Store backend and backend-specific ID separately. Queue acceptance, remote-server acceptance, bounce, complaint and inbox placement are different concepts; never label queue acceptance as delivery. Do not promise exactly-once delivery: SMTP uncertainty requires explicit handling.

## Required work packages and completion gates
1. Transport interface and compatibility adapter. Move Resend calls behind explicit submit, domain, inbound-fetch and event contracts without changing current production routing. Contract tests preserve idempotency, recipient accounting, tenant isolation and approval enforcement. This is migration scaffolding, not independence.
2. Durable submission service. Persist messages before acknowledging acceptance. Add per-recipient state, leases, bounded retries, deduplicated submission and backpressure. Test process crashes before and after acceptance and avoid unsafe automatic replay after ambiguous handoff.
3. SenderPermit-operated transport pilot. Configure test sending identities, DKIM keys, bounce addresses, SPF guidance and receiving DNS on an isolated domain. Confirm hosting supports the required mail traffic, IP assignment and reverse DNS before provisioning. Do not alter current customer MX records.
4. Delivery operations. Implement suppression handling, bounce classification, complaint ingestion where available, per-tenant limits, abuse response, reputation monitoring, alerts, backups and an operator stop switch. Review retention and access controls for raw messages and signing keys.
5. Inbound receiver. Reject unauthorized recipients and relay attempts, enforce resource limits, durably store accepted mail and safely handle attachments and untrusted content. Test duplicate events and tenant routing.
6. Canary migration. Route only an explicitly selected test workspace through the new transport. Verify real send, receive, bounce, retry, suppression, AI draft, approve/reject and audit flows. Measure outcomes instead of claiming provider-equivalent deliverability.
7. Customer cutover. Migrate domains individually after DNS verification. Keep old events and queued messages attributed to their original backend. Roll back new submissions without replaying accepted messages. Remove Resend credentials only after its queues and event dependencies are drained.

## Decisions still required before infrastructure purchase/cutover
Hosting region and budget; mail-server hosting eligibility; initial sending volume; tenant abuse controls; IP strategy; retention requirements; operational ownership and incident response. No spending or production DNS changes are authorized by this document alone.

## Immediate next implementation
Extract the transport boundary and add compatibility tests. Production continues using its current transport until the independent pilot passes. Public messaging must continue disclosing the existing Resend dependency during migration.
