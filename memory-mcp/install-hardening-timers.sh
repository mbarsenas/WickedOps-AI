#!/usr/bin/env bash
set -euo pipefail

ROOT="${ROOT:-/opt/wickedops-memory-mcp}"
SELFTEST_SERVICE="wickedops-memory-selftest.service"
SELFTEST_TIMER="wickedops-memory-selftest.timer"
BACKUP_SERVICE="wickedops-memory-backup.service"
BACKUP_TIMER="wickedops-memory-backup.timer"
PG_MAJOR="${PG_MAJOR:-18}"

[[ $EUID -eq 0 ]] || { echo "Run as root" >&2; exit 1; }
[[ -d "$ROOT" ]] || { echo "Missing $ROOT" >&2; exit 1; }

BASE_URL="https://raw.githubusercontent.com/mbarsenas/WickedOps-AI/feat/memory-hardening/memory-mcp"
STAMP="$(date +%s%N)"

for f in production-self-test.sh backup-memory-db.sh restore-memory-db.sh; do
  curl -fsSL -H 'Cache-Control: no-cache' "$BASE_URL/$f?nocache=$STAMP" -o "$ROOT/$f"
  chmod 0755 "$ROOT/$f"
done

ensure_pg_client() {
  local current_major=""
  if command -v pg_dump >/dev/null 2>&1; then
    current_major="$(pg_dump --version | sed -E 's/.* ([0-9]+)(\.[0-9]+)?.*/\1/')"
  fi
  if [[ "$current_major" != "$PG_MAJOR" ]]; then
    echo "PostgreSQL client major $PG_MAJOR required; current=${current_major:-missing}. Installing/upgrading..."
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y curl ca-certificates gnupg lsb-release
    install -d -m 0755 /etc/apt/keyrings
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/keyrings/postgresql.gpg
    echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list
    apt-get update
    apt-get install -y "postgresql-client-$PG_MAJOR"
  fi
}

ensure_pg_client

PG_DUMP_BIN="/usr/lib/postgresql/$PG_MAJOR/bin/pg_dump"
PSQL_BIN="/usr/lib/postgresql/$PG_MAJOR/bin/psql"
[[ -x "$PG_DUMP_BIN" ]] || { echo "Required pg_dump $PG_MAJOR not found at $PG_DUMP_BIN" >&2; exit 1; }
[[ -x "$PSQL_BIN" ]] || { echo "Required psql $PG_MAJOR not found at $PSQL_BIN" >&2; exit 1; }
"$PG_DUMP_BIN" --version
"$PSQL_BIN" --version

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
Environment=PG_DUMP_BIN=$PG_DUMP_BIN
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
