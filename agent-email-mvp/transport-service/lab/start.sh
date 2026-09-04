#!/bin/sh
set -eu
[ "${LOCAL_MAIL_LAB:-}" = yes ] || exit 1
postconf -e 'myhostname=mail.senderpermit.test' 'mydestination=' 'inet_protocols=ipv4' 'inet_interfaces=all' 'mynetworks=127.0.0.0/8' 'relayhost=[inbox]:1025' 'relay_domains=inbox.senderpermit.test' 'smtpd_relay_restrictions=reject_unauth_destination' 'relay_recipient_maps=hash:/etc/postfix/lab_recipients' 'smtp_tls_security_level=none' 'smtpd_tls_security_level=none' 'maillog_file=/dev/stdout'
printf 'support@inbox.senderpermit.test OK\n' > /etc/postfix/lab_recipients
postmap /etc/postfix/lab_recipients
# Container DNS and the recipient map live outside Debian's default chroot.
postconf -F 'smtp/inet/chroot=n' 'smtp/unix/chroot=n' 'relay/unix/chroot=n'
postfix start
node transport-service/server.mjs &
api=$!
node transport-service/worker.mjs &
worker=$!
trap 'kill "$api" "$worker" 2>/dev/null || true; postfix stop; exit 0' TERM INT
while kill -0 "$api" 2>/dev/null && kill -0 "$worker" 2>/dev/null; do sleep 2; done
kill "$api" "$worker" 2>/dev/null || true
postfix stop
exit 1
