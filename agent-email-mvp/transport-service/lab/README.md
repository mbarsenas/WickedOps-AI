# SenderPermit local mail lab

Run `./transport-service/lab/start-local.ps1` from PowerShell with Docker Desktop running. The script generates a local-only credential in ignored `.env`, builds Postfix and the transport service, and starts a persistent Mailpit test inbox.

Open http://localhost:8025 to view test mail. The submission API is at http://localhost:4380. Test inbound SMTP is localhost:2525 and accepts only support@inbox.senderpermit.test. Unknown recipients and unrelated relay destinations are rejected. Outbound mail always routes into Mailpit. Docker's internal network prevents external delivery; no GoDaddy DNS records or real mailboxes are changed.

Run `node transport-service/lab/verify.mjs` for an end-to-end local test: authenticated HTTP submission, queue, worker, actual Postfix handoff, SMTP reception in Mailpit, replay check, inbound SMTP and unauthorized relay rejection.

Stop without deleting messages:
`docker compose -f transport-service/lab/compose.yaml --env-file transport-service/lab/.env stop`

Data lives in dedicated Docker volumes. Do not remove volumes unless intentionally deleting test mail. The API credential is local-only; it is not a production key. The lab does not use Resend or make AI calls. Mailpit simulates recipient inboxes. This is not a production SMTP configuration: it intentionally has no public TLS/DKIM/DNS setup or external delivery path. A later production deployment needs those plus transport events, bounce/complaint handling, abuse controls and ingress integration with the application.

The fixed-destination gateway exposes the three localhost ports. Only the gateway joins the access network; Postfix and Mailpit remain on the internal network. It is not a general-purpose proxy. Debian Postfix's SMTP chroot is disabled inside the lab container so Docker DNS and the recipient allowlist resolve correctly.

Verified locally: outbound API-to-Postfix-to-Mailpit delivery, inbound SMTP delivery to the allowed recipient, duplicate submission replay without duplicate mail, rejection of unknown inbound recipients, and rejection of unrelated relay destinations. These checks passed again after rebuilding and recreating the transport container with persistent volumes. Local MTA acceptance is still not a public delivery receipt.
