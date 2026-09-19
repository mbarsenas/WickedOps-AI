#!/usr/bin/env bash
set -euo pipefail

ROOT="${ROOT:-/opt/wickedops-memory-mcp}"
SERVICE="wickedops-memory-mcp.service"
DOMAIN="${DOMAIN:-memory-mcp.wickedadmin.com}"
LOCAL_PORT="${PORT:-8110}"
ENV_FILE="$ROOT/.env"
PY="$ROOT/.venv/bin/python"
SERVER_URL="https://raw.githubusercontent.com/mbarsenas/WickedOps-AI/feat/persistent-rag-memory/memory-mcp/server.py"
REQ_URL="https://raw.githubusercontent.com/mbarsenas/WickedOps-AI/feat/persistent-rag-memory/memory-mcp/requirements.txt"
UNIT_URL="https://raw.githubusercontent.com/mbarsenas/WickedOps-AI/feat/persistent-rag-memory/memory-mcp/wickedops-memory-mcp.service"

log(){ printf '\n==> %s\n' "$*"; }
fail(){ printf '\nERROR: %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || fail "Run as root."
[[ -d "$ROOT" ]] || fail "Missing $ROOT"
[[ -f "$ENV_FILE" ]] || fail "Missing $ENV_FILE"
[[ -x "$PY" ]] || fail "Missing Python virtualenv at $ROOT/.venv"

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$ROOT/backups/$STAMP"
mkdir -p "$BACKUP"
for f in server.py requirements.txt wickedops-memory-mcp.service; do
  [[ -f "$ROOT/$f" ]] && cp -a "$ROOT/$f" "$BACKUP/$f"
done

rollback(){
  rc=$?
  if [[ $rc -ne 0 ]]; then
    printf '\nDeployment failed; attempting rollback from %s\n' "$BACKUP" >&2
    for f in server.py requirements.txt wickedops-memory-mcp.service; do
      [[ -f "$BACKUP/$f" ]] && cp -a "$BACKUP/$f" "$ROOT/$f"
    done
    [[ -f "$BACKUP/wickedops-memory-mcp.service" ]] && cp -a "$BACKUP/wickedops-memory-mcp.service" "/etc/systemd/system/$SERVICE"
    systemctl daemon-reload || true
    systemctl restart "$SERVICE" || true
  fi
  exit $rc
}
trap rollback EXIT

log "Fetching latest Memory MCP build from GitHub"
curl -fsSL "$SERVER_URL?nocache=$STAMP" -o "$ROOT/server.py"
curl -fsSL "$REQ_URL?nocache=$STAMP" -o "$ROOT/requirements.txt"
curl -fsSL "$UNIT_URL?nocache=$STAMP" -o "$ROOT/wickedops-memory-mcp.service"

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
META="$meta" "$PY" - <<'PY'
from dotenv import load_dotenv
import json, os
load_dotenv('/opt/wickedops-memory-mcp/.env')
d=json.loads(os.environ['META'])
expected=os.environ['MCP_RESOURCE']
actual=d.get('resource')
if actual != expected:
    raise SystemExit(f'resource mismatch: {actual} != {expected}')
if 'MCP.Access' not in d.get('scopes_supported', []):
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
  code="$(curl -sS -o /tmp/wickedops-memory-mcp-public.json -w '%{http_code}' --max-time 10 -X POST "https://${DOMAIN}/mcp" -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"deploy-check","version":"1"}}}' || true)"
  if [[ "$code" != "401" ]]; then
    cat /tmp/wickedops-memory-mcp-public.json || true
    fail "Expected unauthenticated /mcp POST to return 401, got $code"
  fi
  echo "Public /mcp authentication boundary: PASS (401)"
else
  echo "WARNING: $DOMAIN does not currently resolve; skipping public checks"
fi

log "Inspecting recent service errors"
if journalctl -u "$SERVICE" --since '-2 minutes' --no-pager | grep -E 'Traceback|ERROR:|421 Misdirected Request|Task group is not initialized' >/tmp/wickedops-memory-errors.txt; then
  cat /tmp/wickedops-memory-errors.txt
  fail "Recent service errors detected"
fi

trap - EXIT
log "Deployment validation complete"
echo "SERVICE=$SERVICE"
echo "LOCAL_PORT=$LOCAL_PORT"
echo "PUBLIC_URL=https://${DOMAIN}/mcp"
echo "BACKUP=$BACKUP"
echo "NEXT_REQUIRED_EXTERNAL_STEP=Refresh the ChatGPT plugin actions, then run the live authenticated MCP acceptance sequence."
