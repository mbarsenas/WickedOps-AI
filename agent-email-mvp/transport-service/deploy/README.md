# EC2 transport bootstrap

Inspected and bootstrapped 2026-09-04 at mail.senderpermit.com (16.58.195.161), us-east-2. Live IMDS reports t3.small; /etc/os-release reports Ubuntu 26.04.1 LTS. Earlier setup notes naming t3.micro and Ubuntu 24.04 were stale.

Installed Node 24.20.0 from the official distribution, checking the archive against its HTTPS SHA256 manifest. Installed the durable transport under /opt/senderpermit, owned by root, running as the unprivileged senderpermit user. SQLite data is in /var/lib/senderpermit with private permissions. A generated workspace-scoped credential is stored only in root-readable /etc/senderpermit/transport.env. It is not a customer API key. Initial canary workspace is aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa, restricted to senderpermit.com.

The intake systemd service is enabled on 127.0.0.1:4380. The worker is installed but disabled and additionally requires /etc/senderpermit/enable-worker to exist. Do not create that marker or start the worker until direct delivery is authorized, outbound port 25 works, and the canary queue has been reviewed. Installing the intake does not switch the hosted application from Resend.

Postfix/OpenDKIM configuration was backed up under /var/backups/senderpermit/20260904T052600Z. Changes: remove the duplicate myorigin setting, defer on milter failure, use IPv4 with the verified A/PTR path, and correct ownership of Postfix's copied resolver file. Existing mail queue contents were preserved. One pre-existing mail-tester message remains deferred. No external test messages were submitted by this bootstrap.

Production validation passed on the Contabo host: transport tests, authenticated intake, direct SMTP delivery to Gmail, and SPF, DKIM, and DMARC authentication. OpenDKIM uses a signing table so addresses on SenderPermit subdomains are signed with the published `senderpermit.com` key.

## HTTPS completion

Nginx and Certbot are installed. http-bootstrap.conf is active: only the ACME challenge path is served for mail.senderpermit.com, other paths return 404. The security group currently prevents public port 80 access from the operator's computer.

1. Allow inbound TCP 80 and 443 in the EC2 security group. Keep 4380 closed, and SSH restricted.
2. Run deploy/enable-https.sh on the server as root. It obtains a certificate using the existing A record and HTTP webroot validation, activates https-intake.conf, configures Postfix's TLS certificate, and installs renewal reload hooks.
3. Verify public HTTPS rejects an unauthenticated request with 401 and succeeds with the canary credential; never print the token or put it in a URL.
4. Keep port 80 available for automatic HTTP-01 renewal; test renewal before cutover.

The staged HTTPS proxy limits body size, request rate and timeouts, and exposes only submission/status routes. Application integration still needs scoped secret provisioning and explicit canary backend routing; do not replace production credentials globally.

## Remaining external and application work

- Confirm reverse DNS, forward DNS, and outbound port 25 before enabling a replacement host.
- Publish only one DMARC TXT record at _dmarc.senderpermit.com. DNS currently returns two: one reporting to dmarc@senderpermit.com and another to dmarc_rua@onsecureserver.net. Confirm the desired reporting destination; the first mailbox is not provisioned.
- Inbound/MX and bounce domains are not configured. Do not claim receiving, bounce reconciliation, or complaint processing is live.
- Complete inbound storage/parsing, delivery-event reconciliation/suppression, authenticated application routing and public end-to-end tests before customer cutover.

For future uploads, transfer an explicit archive containing service *.mjs files, deploy files and package manifests only. Exclude lab .env/dashboard.env, SQLite data, node_modules and all keys. Keep the local mail lab operating independently.
