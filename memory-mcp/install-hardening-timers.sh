#!/usr/bin/env bash
set -euo pipefail

ROOT="${ROOT:-/opt/wickedops-memory-mcp}"
SELFTEST_SERVICE="wickedops-memory-selftest.service"
SELFTEST_TIMER="wickedops-memory-selftest.timer"
BACKUP_SERVICE="wickedops-memory-backup.service"
BACKUP_TIMER="wickedops-memory-backup.timer"

[[ $EUID -eq 0 ]] || { echo "Run as root" >&2; exit 1; }

install -m 0755 "$ROOT/production-self-test.sh" "$ROOT/production-self-test.sh"
install -m 0755 "$ROOT/backup-memory-db.sh" "$ROOT/backup-memory-db.sh"

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

echo "TIMERS=PASS"
systemctl list-timers --all "$SELFTEST_TIMER" "$BACKUP_TIMER" --no-pager
