# Independent inbound pilot

The AWS Postfix route accepts only `pilot@inbound.senderpermit.com` and maps it to
Pilot Test (`743121e2-2429-49f5-af41-9230fd324643`). Provision additional addresses
explicitly; this is not a catch-all mailbox. Public reception requires MX
`inbound.senderpermit.com -> mail.senderpermit.com`, priority 10.

The Python pipe saves the raw message and a bounded text representation in the
transport SQLite database, using FULL synchronization. The combination of Postfix
queue ID, envelope recipient and raw content makes pipe retries idempotent without
discarding independently submitted identical messages. Temporary storage failures
leave the message in Postfix for retry. SMTP size limit is 5 MB; stored inbound data
is bounded at 512 MB / 10,000 records. Capacity requires operator attention; no
automatic deletion is implemented.

Authenticated HTTPS list/get/ack routes are workspace scoped. Acknowledgement removes
an item from the pending list but preserves stored content for explicit processing
retries. Raw MIME/attachments are retained locally; attachment download and scanning
are not implemented. HTML is converted to plain text before use by the application.

The existing authenticated scheduler imports up to three pending messages per run.
The app records received email, creates conversations, applies the existing agent
and policy workflow, and exposes held/failed work in Actions. The pilot agent starts
paused. Null-sender and automated messages do not trigger replies. SMTP sender identity
is not proof of authenticity: inbound SPF/DKIM verification and spam filtering remain
separate production-hardening work. Sending remains behind the AWS pilot gate.
