#!/bin/bash
set -euo pipefail
[[ $(id -u) = 0 ]] || exit 1
source_dir=$(cd "$(dirname "$0")" && pwd)
certbot certonly --webroot -w /var/www/senderpermit-acme -d mail.senderpermit.com --non-interactive --agree-tos --register-unsafely-without-email
cp "$source_dir/https-intake.conf" /etc/nginx/sites-available/senderpermit-intake
nginx -t
systemctl reload nginx
postconf -e 'smtpd_tls_cert_file=/etc/letsencrypt/live/mail.senderpermit.com/fullchain.pem' 'smtpd_tls_key_file=/etc/letsencrypt/live/mail.senderpermit.com/privkey.pem'
postfix check
systemctl reload postfix
install -d /etc/letsencrypt/renewal-hooks/deploy
printf '#!/bin/sh\nnginx -t && systemctl reload nginx\npostfix check && systemctl reload postfix\n' > /etc/letsencrypt/renewal-hooks/deploy/senderpermit-services
chmod 755 /etc/letsencrypt/renewal-hooks/deploy/senderpermit-services
systemctl enable --now certbot.timer
