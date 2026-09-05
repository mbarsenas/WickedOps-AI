# Bounce handling

Installed on the SenderPermit mail host. Public reception requires an MX record for
`bounces.senderpermit.com` pointing to `mail.senderpermit.com` and inbound TCP 25.
The outbound worker remains disabled pending outbound connectivity and canary activation.

The worker uses a signed per-recipient envelope sender when BOUNCE_DOMAIN is set.
BOUNCE_SECRET is generated on the server and must remain stable across restarts.
The visible From header is unchanged. Back up the secret securely with the queue:
changing it prevents correlation of outstanding return addresses.

Postfix routes only the bounce domain to the Python DSN handler. The recipient map
rejects addresses with an invalid token shape. The handler validates the signature,
matches Final-Recipient against the original record, and processes multipart/report
delivery-status parts. Invalid or unsupported reports are discarded without generating
another bounce. Processing or database errors return a temporary failure so Postfix retries.

Confirmed 5.x failures become `bounced`; 4.x delay reports become `deferred`.
Delays never requeue the original message in the application: Postfix owns SMTP retries.
Only 5.1.1 nonexistent-mailbox failures create a workspace-scoped suppression.
Policy failures and full mailboxes do not suppress recipients. Duplicate reports are
idempotent and late delays cannot undo a permanent failure. Status is available through
the transport submission status endpoint; production dashboard synchronization is separate work.

Verification: `verify-bounces.py` injects a synthetic DSN through localhost Postfix,
using a unique example.invalid recipient in a dedicated test workspace. It verifies
the stored failure and suppression and rejects duplicate/mismatched/forged reports.
It never submits an outgoing email. The synthetic records are retained for inspection.

This does not establish successful remote delivery tracking, complaints, or public
internet reachability. Signed return paths prove correlation, not the authenticity of
the remote reporter; someone who possesses a valid return path can fabricate a DSN.
