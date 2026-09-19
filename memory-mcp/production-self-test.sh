#!/usr/bin/env bash
set -euo pipefail

ROOT="${ROOT:-/opt/wickedops-memory-mcp}"
SERVICE="${SERVICE:-wickedops-memory-mcp.service}"
DOMAIN="${DOMAIN:-memory-mcp.wickedadmin.com}"
PORT="${PORT:-8110}"
ENV_FILE="$ROOT/.env"
PY="$ROOT/.venv/bin/python"

fail(){ echo "FAIL: $*" >&2; exit 1; }
pass(){ echo "PASS: $*"; }

[[ -x "$PY" ]] || fail "Python venv missing at $PY"
[[ -f "$ENV_FILE" ]] || fail "Missing $ENV_FILE"

systemctl is-active --quiet "$SERVICE" || fail "$SERVICE is not active"
pass "systemd service active"

local_health="$(curl -fsS --max-time 10 "http://127.0.0.1:${PORT}/healthz")"
[[ "$local_health" == *'"status":"ok"'* ]] || fail "local health endpoint returned unexpected payload"
pass "local health"

public_health="$(curl -fsS --max-time 15 "https://${DOMAIN}/healthz")"
[[ "$public_health" == *'"status":"ok"'* ]] || fail "public health endpoint returned unexpected payload"
pass "public HTTPS health"

meta="$(curl -fsS --max-time 10 "https://${DOMAIN}/.well-known/oauth-protected-resource/mcp")"
META="$meta" "$PY" - <<'PY'
from dotenv import load_dotenv
import json, os
load_dotenv('/opt/wickedops-memory-mcp/.env')
d=json.loads(os.environ['META'])
expected=os.environ['MCP_RESOURCE']
if d.get('resource') != expected:
    raise SystemExit(f"resource mismatch: {d.get('resource')} != {expected}")
if 'MCP.Access' not in d.get('scopes_supported', []):
    raise SystemExit('MCP.Access not advertised')
print('PASS: OAuth protected-resource metadata')
PY

code="$(curl -sS -o /tmp/wickedops-memory-selftest-mcp.json -w '%{http_code}' --max-time 10 -X POST "https://${DOMAIN}/mcp" -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"production-self-test","version":"1"}}}' || true)"
[[ "$code" == "401" ]] || { cat /tmp/wickedops-memory-selftest-mcp.json || true; fail "unauthenticated /mcp expected 401, got $code"; }
pass "MCP auth boundary"

"$PY" - <<'PY'
from dotenv import load_dotenv
import os, psycopg
load_dotenv('/opt/wickedops-memory-mcp/.env')
required={'sable_memory_items','sable_memory_chunks','sable_command_ledger','sable_state_snapshots','sable_memory_retrieval_log'}
with psycopg.connect(os.environ['DATABASE_URL']) as conn:
    tables={r[0] for r in conn.execute("select tablename from pg_tables where schemaname='public'").fetchall()}
    missing=sorted(required-tables)
    if missing:
        raise SystemExit('missing tables: '+', '.join(missing))
    vector=conn.execute("select extversion from pg_extension where extname='vector'").fetchone()
    if not vector:
        raise SystemExit('pgvector extension missing')
    counts={}
    for table in sorted(required):
        counts[table]=conn.execute(f'select count(*) from {table}').fetchone()[0]
    print('PASS: database schema + pgvector', vector[0])
    print('INFO: row counts', counts)
PY

if journalctl -u "$SERVICE" --since '-10 minutes' --no-pager | grep -E 'Traceback|Task group is not initialized|421 Misdirected Request|Application startup failed' >/tmp/wickedops-memory-selftest-errors.txt; then
  cat /tmp/wickedops-memory-selftest-errors.txt
  fail "recent fatal service errors detected"
fi
pass "no recent fatal service errors"

echo "SELF_TEST=PASS"
