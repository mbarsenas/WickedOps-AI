#!/usr/bin/env bash
set -euo pipefail

ROOT="${ROOT:-/opt/wickedops-memory-mcp}"
ENV_FILE="$ROOT/.env"
BACKUP_FILE="${1:-}"
TARGET_URL="${RESTORE_DATABASE_URL:-}"
PSQL_BIN="${PSQL_BIN:-/usr/lib/postgresql/18/bin/psql}"
RESTORE_LOG="${RESTORE_LOG:-/tmp/wickedops-memory-restore.log}"
VALIDATION_RETRIES="${VALIDATION_RETRIES:-5}"
VALIDATION_DELAY_SECONDS="${VALIDATION_DELAY_SECONDS:-2}"
REQUIRED_TABLES=(
  sable_memory_items
  sable_memory_chunks
  sable_command_ledger
  sable_state_snapshots
  sable_memory_retrieval_log
)

fail(){ echo "RESTORE_VALIDATION=FAIL: $*" >&2; exit 1; }

[[ -f "$ENV_FILE" ]] || fail "Missing $ENV_FILE"
[[ -n "$BACKUP_FILE" ]] || { echo "Usage: $0 /path/to/wickedops-memory-*.sql.gz" >&2; exit 2; }
[[ -f "$BACKUP_FILE" ]] || fail "Backup not found: $BACKUP_FILE"
[[ -n "$TARGET_URL" ]] || { echo "RESTORE_DATABASE_URL must point to a disposable validation database; production restore is intentionally not automatic." >&2; exit 2; }
[[ -x "$PSQL_BIN" ]] || fail "psql not found at $PSQL_BIN"

gzip -t "$BACKUP_FILE"

# The dump contains vector columns but not CREATE EXTENSION. Ensure pgvector exists
# before replaying schema/data into an otherwise-empty validation database.
"$PSQL_BIN" "$TARGET_URL" -v ON_ERROR_STOP=1 -Atqc \
  "CREATE SCHEMA IF NOT EXISTS public; CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;" \
  >/dev/null

: > "$RESTORE_LOG"
if ! gunzip -c "$BACKUP_FILE" | "$PSQL_BIN" "$TARGET_URL" -v ON_ERROR_STOP=1 >"$RESTORE_LOG" 2>&1; then
  echo "--- restore log tail ---" >&2
  tail -n 120 "$RESTORE_LOG" >&2 || true
  fail "SQL replay failed"
fi

validate_restore() {
  local table_list row

  table_list="$($PSQL_BIN "$TARGET_URL" -Atqc \
    "select tablename from pg_tables where schemaname='public' and tablename like 'sable_%' order by tablename" 2>/dev/null || true)"

  for t in "${REQUIRED_TABLES[@]}"; do
    grep -Fxq "$t" <<<"$table_list" || return 1
  done

  # Force schema qualification so validation is independent of search_path.
  for t in "${REQUIRED_TABLES[@]}"; do
    row="$($PSQL_BIN "$TARGET_URL" -Atqc "select count(*) from public.\"$t\"" 2>/dev/null || true)"
    [[ "$row" =~ ^[0-9]+$ ]] || return 1
  done
  return 0
}

attempt=1
until validate_restore; do
  if (( attempt >= VALIDATION_RETRIES )); then
    echo "--- restore log tail ---" >&2
    tail -n 120 "$RESTORE_LOG" >&2 || true
    fail "restored tables were not queryable after ${VALIDATION_RETRIES} attempts"
  fi
  sleep "$VALIDATION_DELAY_SECONDS"
  attempt=$((attempt + 1))
done

MEMORY_ROWS="$($PSQL_BIN "$TARGET_URL" -Atqc 'select count(*) from public.sable_memory_items')"
CHUNK_ROWS="$($PSQL_BIN "$TARGET_URL" -Atqc 'select count(*) from public.sable_memory_chunks')"
COMMAND_ROWS="$($PSQL_BIN "$TARGET_URL" -Atqc 'select count(*) from public.sable_command_ledger')"
STATE_ROWS="$($PSQL_BIN "$TARGET_URL" -Atqc 'select count(*) from public.sable_state_snapshots')"
RETRIEVAL_ROWS="$($PSQL_BIN "$TARGET_URL" -Atqc 'select count(*) from public.sable_memory_retrieval_log')"

# Cross-check restored counts against the COPY row counts emitted by psql.
# This catches a superficially successful restore where replay stopped before data load.
mapfile -t COPY_COUNTS < <(grep -E '^COPY [0-9]+$' "$RESTORE_LOG" | awk '{print $2}')
if (( ${#COPY_COUNTS[@]} != 5 )); then
  fail "expected 5 COPY results in restore log, found ${#COPY_COUNTS[@]}"
fi

# pg_dump emits COPY blocks in the same order as the requested table set in backup-memory-db.sh.
[[ "${COPY_COUNTS[0]}" == "$COMMAND_ROWS" ]] || fail "command row count mismatch: dump=${COPY_COUNTS[0]} restored=$COMMAND_ROWS"
[[ "${COPY_COUNTS[1]}" == "$CHUNK_ROWS" ]] || fail "chunk row count mismatch: dump=${COPY_COUNTS[1]} restored=$CHUNK_ROWS"
[[ "${COPY_COUNTS[2]}" == "$MEMORY_ROWS" ]] || fail "memory row count mismatch: dump=${COPY_COUNTS[2]} restored=$MEMORY_ROWS"
[[ "${COPY_COUNTS[3]}" == "$RETRIEVAL_ROWS" ]] || fail "retrieval row count mismatch: dump=${COPY_COUNTS[3]} restored=$RETRIEVAL_ROWS"
[[ "${COPY_COUNTS[4]}" == "$STATE_ROWS" ]] || fail "state row count mismatch: dump=${COPY_COUNTS[4]} restored=$STATE_ROWS"

echo "RESTORE_VALIDATION=PASS"
echo "MEMORY_ROWS=$MEMORY_ROWS"
echo "CHUNK_ROWS=$CHUNK_ROWS"
echo "COMMAND_ROWS=$COMMAND_ROWS"
echo "STATE_ROWS=$STATE_ROWS"
echo "RETRIEVAL_ROWS=$RETRIEVAL_ROWS"
echo "RESTORE_LOG=$RESTORE_LOG"
