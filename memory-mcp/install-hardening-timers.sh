#!/usr/bin/env bash
set -euo pipefail

ROOT="${ROOT:-/opt/wickedops-memory-mcp}"
SELFTEST_SERVICE="wickedops-memory-selftest.service"
SELFTEST_TIMER="wickedops-memory-selftest.timer"
BACKUP_SERVICE="wickedops-memory-backup.service"
BACKUP_TIMER="wickedops-memory-backup.timer"

[[ $EUID -eq 0 ]] || { echo "Run as root" >&2; exit 1; }
[[ -d "$ROOT" ]] || { echo "Missing $ROOT" >&2; exit 1; }

BASE_URL="https://raw.githubusercontent.com/mbarsenas/WickedOps-AI/feat/memory-hardening/memory-mcp"
STAMP="$(date +%s%N)"

for f in production-self-test.sh backup-memory-db.sh restore-memory-db.sh; do
  curl -fsSL -H 'Cache-Control: no-cache' "$BASE_URL/$f?nocache=$STAMP" -o "$ROOT/$f"
  chmod 0755 "$ROOT/$f"
done

cat > "/etc/systemd/system/$SELFTEST_SERVICE" <<EOF
[Unit]
Description=WickedOps Memory MCP production self-test
After=network-online.target wickedops-memory-mcp.service
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=$ROOT
ExecStart=$ROOT/production-self-test.sh
User=root
EOF

cat > "/etc/systemd/system/$SELFTEST_TIMER" <<EOF
[Unit]
Description=Run WickedOps Memory MCP self-test every 15 minutes

[Timer]
OnBootSec=5min
OnUnitActiveSec=15min
Persistent=true
Unit=$SELFTEST_SERVICE

[Install]
WantedBy=timers.target
EOF

cat > "/etc/systemd/system/$BACKUP_SERVICE" <<EOF
[Unit]
Description=Backup WickedOps Memory MCP database
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=$ROOT
ExecStart=$ROOT/backup-memory-db.sh
User=root
EOF

cat > "/etc/systemd/system/$BACKUP_TIMER" <<EOF
[Unit]
Description=Nightly WickedOps Memory MCP database backup

[Timer]
OnCalendar=*-*-* 03:15:00
Persistent=true
Unit=$BACKUP_SERVICE

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now "$SELFTEST_TIMER" "$BACKUP_TIMER"

systemctl start "$SELFTEST_SERVICE"
systemctl start "$BACKUP_SERVICE"

systemctl is-active --quiet "$SELFTEST_TIMER"
systemctl is-active --quiet "$BACKUP_TIMER"

latest_backup="$(find "$ROOT/backups/db" -maxdepth 1 -type f -name 'wickedops-memory-*.sql.gz' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n1 | cut -d' ' -f2-)"
[[ -n "$latest_backup" ]] || { echo "No database backup produced" >&2; exit 1; }
gzip -t "$latest_backup"

echo "HARDENING_INSTALL=PASS"
echo "SELFTEST_TIMER=$SELFTEST_TIMER"
echo "BACKUP_TIMER=$BACKUP_TIMER"
echo "LATEST_BACKUP=$latest_backup"
systemctl list-timers --all "$SELFTEST_TIMER" "$BACKUP_TIMER" --no-pager
