#!/usr/bin/env bash
set -euo pipefail

ROOT="${ROOT:-/opt/wickedops-memory-mcp}"
ENV_FILE="$ROOT/.env"
BACKUP_FILE="${1:-}"
TARGET_URL="${RESTORE_DATABASE_URL:-}"

[[ -f "$ENV_FILE" ]] || { echo "Missing $ENV_FILE" >&2; exit 1; }
[[ -n "$BACKUP_FILE" ]] || { echo "Usage: $0 /path/to/wickedops-memory-*.sql.gz" >&2; exit 2; }
[[ -f "$BACKUP_FILE" ]] || { echo "Backup not found: $BACKUP_FILE" >&2; exit 1; }
[[ -n "$TARGET_URL" ]] || { echo "RESTORE_DATABASE_URL must point to a disposable validation database; production restore is intentionally not automatic." >&2; exit 2; }

gzip -t "$BACKUP_FILE"

gunzip -c "$BACKUP_FILE" | psql "$TARGET_URL" -v ON_ERROR_STOP=1 >/tmp/wickedops-memory-restore.log

psql "$TARGET_URL" -Atc "select count(*) from sable_memory_items" >/tmp/wickedops-memory-restore-memory-count.txt
psql "$TARGET_URL" -Atc "select count(*) from sable_command_ledger" >/tmp/wickedops-memory-restore-command-count.txt
psql "$TARGET_URL" -Atc "select count(*) from sable_state_snapshots" >/tmp/wickedops-memory-restore-state-count.txt

echo "RESTORE_VALIDATION=PASS"
echo "MEMORY_ROWS=$(cat /tmp/wickedops-memory-restore-memory-count.txt)"
echo "COMMAND_ROWS=$(cat /tmp/wickedops-memory-restore-command-count.txt)"
echo "STATE_ROWS=$(cat /tmp/wickedops-memory-restore-state-count.txt)"
