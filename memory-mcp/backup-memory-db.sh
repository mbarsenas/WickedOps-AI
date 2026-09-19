#!/usr/bin/env bash
set -euo pipefail

ROOT="${ROOT:-/opt/wickedops-memory-mcp}"
ENV_FILE="$ROOT/.env"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups/db}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/wickedops-memory-$STAMP.sql.gz"
KEEP_DAYS="${KEEP_DAYS:-14}"
PY="$ROOT/.venv/bin/python"
PG_DUMP_BIN="${PG_DUMP_BIN:-$(command -v pg_dump || true)}"

[[ -f "$ENV_FILE" ]] || { echo "Missing $ENV_FILE" >&2; exit 1; }
[[ -x "$PY" ]] || { echo "Missing Python venv at $PY" >&2; exit 1; }
[[ -n "$PG_DUMP_BIN" && -x "$PG_DUMP_BIN" ]] || { echo "pg_dump not found; install PostgreSQL client tools" >&2; exit 1; }
mkdir -p "$BACKUP_DIR"

DATABASE_URL="$("$PY" - <<'PY'
from dotenv import dotenv_values
v=dotenv_values('/opt/wickedops-memory-mcp/.env')
print(v.get('DATABASE_URL',''))
PY
)"
[[ -n "$DATABASE_URL" ]] || { echo "DATABASE_URL missing" >&2; exit 1; }

"$PG_DUMP_BIN" "$DATABASE_URL" \
  --no-owner --no-privileges \
  --table=sable_memory_items \
  --table=sable_memory_chunks \
  --table=sable_command_ledger \
  --table=sable_state_snapshots \
  --table=sable_memory_retrieval_log \
  | gzip -9 > "$OUT"

test -s "$OUT" || { echo "Backup file is empty" >&2; exit 1; }
gzip -t "$OUT"
find "$BACKUP_DIR" -type f -name 'wickedops-memory-*.sql.gz' -mtime "+$KEEP_DAYS" -delete

echo "BACKUP=PASS"
echo "FILE=$OUT"
echo "BYTES=$(stat -c%s "$OUT")"
