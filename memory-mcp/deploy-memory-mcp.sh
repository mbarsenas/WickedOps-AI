#!/usr/bin/env bash
set -euo pipefail

ROOT="${ROOT:-/opt/wickedops-memory-mcp}"
SERVICE="wickedops-memory-mcp.service"
DOMAIN="${DOMAIN:-memory-mcp.wickedadmin.com}"
LOCAL_PORT="${PORT:-8110}"
ENV_FILE="$ROOT/.env"
PY="$ROOT/.venv/bin/python"

log(){ printf '\n==> %s\n' "$*"; }
fail(){ printf '\nERROR: %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || fail "Run as root."
[[ -d "$ROOT" ]] || fail "Missing $ROOT"
[[ -f "$ROOT/server.py" ]] || fail "Missing server.py"
[[ -f "$ROOT/requirements.txt" ]] || fail "Missing requirements.txt"
[[ -f "$ENV_FILE" ]] || fail "Missing $ENV_FILE"

log "Validating required environment"
"$PY" - <<'PY'
from dotenv import dotenv_values
from pathlib import Path
p=Path('/opt/wickedops-memory-mcp/.env')
vals=dotenv_values(p)
required=['ENTRA_TENANT_ID','MCP_AUDIENCE','MCP_RESOURCE','DATABASE_URL','OPENAI_API_KEY']
missing=[k for k in required if not vals.get(k)]
if missing:
    raise SystemExit('Missing required values: '+', '.join(missing))
for k in required:
    v=vals[k]
    if isinstance(v,str) and v.startswith('PASTE_'):
        raise SystemExit(f'{k} still contains a placeholder')
print('Environment validation: PASS')
PY

log "Installing Python dependencies"
"$ROOT/.venv/bin/pip" install -r "$ROOT/requirements.txt"

log "Compiling server"
"$PY" -m py_compile "$ROOT/server.py"

log "Testing Neon connectivity and schema"
"$PY" - <<'PY'
from dotenv import load_dotenv
import os, psycopg
load_dotenv('/opt/wickedops-memory-mcp/.env')
required_tables={
 'sable_memory_items','sable_memory_chunks','sable_command_ledger',
 'sable_state_snapshots','sable_memory_retrieval_log'
}
with psycopg.connect(os.environ['DATABASE_URL']) as conn:
    rows=conn.execute("select tablename from pg_tables where schemaname='public'").fetchall()
    tables={r[0] for r in rows}
    missing=sorted(required_tables-tables)
    if missing:
        raise SystemExit('Missing database tables: '+', '.join(missing))
    ext=conn.execute("select extversion from pg_extension where extname='vector'").fetchone()
    if not ext:
        raise SystemExit('pgvector extension is not enabled')
    print('Database schema validation: PASS; pgvector', ext[0])
PY

log "Installing systemd unit"
cp "$ROOT/wickedops-memory-mcp.service" "/etc/systemd/system/$SERVICE"
systemctl daemon-reload
systemctl enable "$SERVICE"
systemctl restart "$SERVICE"
sleep 2
systemctl is-active --quiet "$SERVICE" || { journalctl -u "$SERVICE" -n 80 --no-pager; fail "Service failed to start"; }

log "Checking local health"
curl -fsS --max-time 10 "http://127.0.0.1:${LOCAL_PORT}/healthz" >/tmp/wickedops-memory-health.json
cat /tmp/wickedops-memory-health.json

log "Checking OAuth protected-resource metadata"
meta="$(curl -fsS --max-time 10 "http://127.0.0.1:${LOCAL_PORT}/.well-known/oauth-protected-resource/mcp")"
printf '%s\n' "$meta" | "$PY" - <<'PY'
import sys, json, os
from dotenv import load_dotenv
load_dotenv('/opt/wickedops-memory-mcp/.env')
d=json.load(sys.stdin)
expected=os.environ['MCP_RESOURCE']
if d.get('resource') != expected:
    raise SystemExit(f"resource mismatch: {d.get('resource')} != {expected}")
if 'MCP.Access' not in d.get('scopes_supported',[]):
    raise SystemExit('MCP.Access not advertised')
print('OAuth metadata validation: PASS')
PY

if command -v nginx >/dev/null 2>&1; then
  log "Checking nginx configuration"
  nginx -t
fi

if getent ahostsv4 "$DOMAIN" >/dev/null 2>&1; then
  log "Checking public HTTPS health"
  curl -fsS --max-time 15 "https://${DOMAIN}/healthz"
  echo
  log "Checking public MCP authentication boundary"
  code="$(curl -sS -o /tmp/wickedops-memory-mcp-public.json -w '%{http_code}' --max-time 10 "https://${DOMAIN}/mcp" || true)"
  if [[ "$code" != "401" ]]; then
    cat /tmp/wickedops-memory-mcp-public.json || true
    fail "Expected unauthenticated /mcp to return 401, got $code"
  fi
  echo "Public /mcp authentication boundary: PASS (401)"
else
  echo "WARNING: $DOMAIN does not currently resolve; skipping public checks"
fi

log "Deployment validation complete"
echo "SERVICE=$SERVICE"
echo "LOCAL_PORT=$LOCAL_PORT"
echo "PUBLIC_URL=https://${DOMAIN}/mcp"
echo "NEXT_REQUIRED_EXTERNAL_STEP=Complete Entra/ChatGPT OAuth connector wiring and run authenticated MCP tool acceptance tests"
