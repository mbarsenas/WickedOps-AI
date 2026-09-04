#!/bin/bash
set -euo pipefail
[[ $(id -u) = 0 ]] || { echo 'Run with sudo'; exit 1; }
[[ $(uname -m) = x86_64 ]] || { echo 'This installer targets x86_64'; exit 1; }
source_dir=$(cd "$(dirname "$0")/.." && pwd)
backup_dir=/var/backups/senderpermit/$(date -u +%Y%m%dT%H%M%SZ)
install -d -m 700 "$backup_dir"
cp -a /etc/postfix/main.cf /etc/postfix/master.cf /etc/opendkim.conf "$backup_dir/"
if ! test -x /opt/senderpermit-node/bin/node; then
  install -d /opt/senderpermit-node
  temp_dir=$(mktemp -d)
  trap 'rm -rf "$temp_dir"' EXIT
  archive=node-v24.20.0-linux-x64.tar.xz
  curl -fsS --retry 3 "https://nodejs.org/dist/v24.20.0/$archive" -o "$temp_dir/$archive"
  curl -fsS --retry 3 https://nodejs.org/dist/v24.20.0/SHASUMS256.txt -o "$temp_dir/SHASUMS256.txt"
  (cd "$temp_dir"; grep "  $archive$" SHASUMS256.txt | sha256sum -c -)
  tar -xJf "$temp_dir/$archive" -C /opt/senderpermit-node --strip-components=1
fi
id senderpermit >/dev/null 2>&1 || useradd --system --home-dir /var/lib/senderpermit --shell /usr/sbin/nologin senderpermit
install -d -m 755 /opt/senderpermit/transport-service
install -d -o senderpermit -g senderpermit -m 700 /var/lib/senderpermit
install -d -m 700 /etc/senderpermit
cp "$source_dir/"*.mjs /opt/senderpermit/transport-service/
cp "$source_dir/lab/package.json" "$source_dir/lab/package-lock.json" /opt/senderpermit/
(cd /opt/senderpermit; PATH=/opt/senderpermit-node/bin:$PATH npm ci --omit=dev --ignore-scripts --no-audit --no-fund)
if ! test -f /etc/senderpermit/transport.env; then
 python3 - <<'PY'
import json,secrets,os
account={'workspace':'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','token':secrets.token_hex(32),'domains':['senderpermit.com']}
path='/etc/senderpermit/transport.env'
with open(path,'x') as f:
 f.write('TRANSPORT_DB=/var/lib/senderpermit/transport.sqlite\nPORT=4380\n')
 f.write("TRANSPORT_ACCOUNTS='"+json.dumps([account],separators=(',',':'))+"'\n")
os.chmod(path,0o600)
PY
fi
install -m 644 "$source_dir/deploy/senderpermit-intake.service" /etc/systemd/system/
install -m 644 "$source_dir/deploy/senderpermit-worker.service" /etc/systemd/system/
# Fail closed if the signer is unavailable. Send only on the verified IPv4 path.
postconf -e 'myorigin=senderpermit.com' 'milter_default_action=tempfail' 'inet_protocols=ipv4'
if test -f /var/spool/postfix/etc/resolv.conf; then chown root:root /var/spool/postfix/etc/resolv.conf; fi
postfix check
systemctl restart postfix
systemctl daemon-reload
systemctl enable --now senderpermit-intake
echo "Intake installed on 127.0.0.1:4380. Worker NOT enabled. Backup: $backup_dir"
