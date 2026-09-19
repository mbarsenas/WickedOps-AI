import os
import json
from contextlib import asynccontextmanager
from typing import Any, Optional
from contextvars import ContextVar

import jwt
import psycopg
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from jwt import PyJWKClient
from mcp.server.fastmcp import FastMCP, Context
from mcp.server.transport_security import TransportSecuritySettings

TENANT_ID = os.environ["ENTRA_TENANT_ID"]
AUDIENCE = os.environ["MCP_AUDIENCE"]
DATABASE_URL = os.environ["DATABASE_URL"]
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")

ISSUER = f"https://login.microsoftonline.com/{TENANT_ID}/v2.0"
JWKS_URL = f"https://login.microsoftonline.com/{TENANT_ID}/discovery/v2.0/keys"
jwks = PyJWKClient(JWKS_URL)
current_claims: ContextVar[dict[str, Any] | None] = ContextVar("current_claims", default=None)

# This service is bound to localhost:8110 and exposed only through the trusted
# nginx TLS reverse proxy at memory-mcp.wickedadmin.com. FastMCP's built-in
# DNS-rebinding host validation rejects the proxied Host header in this setup,
# so disable that layer here and rely on nginx + Entra bearer validation.
transport_security = TransportSecuritySettings(
    enable_dns_rebinding_protection=False,
)

mcp = FastMCP(
    "WickedOps Memory",
    stateless_http=True,
    json_response=True,
    transport_security=transport_security,
)

mcp_app = mcp.streamable_http_app()


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with mcp.session_manager.run():
        yield


app = FastAPI(title="WickedOps Memory MCP", lifespan=lifespan)


def verify_token(request: Request) -> dict[str, Any]:
    header = request.headers.get("authorization", "")
    if not header.startswith("Bearer "):
        raise PermissionError("Authentication required")
    token = header[7:].strip()
    signing_key = jwks.get_signing_key_from_jwt(token)
    claims = jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        audience=[AUDIENCE, f"api://{AUDIENCE}"],
        issuer=ISSUER,
        options={"require": ["exp", "iss", "aud", "tid"]},
    )
    if claims.get("tid") != TENANT_ID:
        raise PermissionError("Invalid tenant")
    scopes = set((claims.get("scp") or "").split())
    if "MCP.Access" not in scopes:
        raise PermissionError("Required scope missing")
    return claims


def db():
    return psycopg.connect(DATABASE_URL)


def user_key(claims: dict[str, Any]) -> str:
    return str(claims.get("oid") or claims.get("sub") or claims.get("preferred_username"))


def embed(text: str) -> list[float]:
    from openai import OpenAI
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("OPENAI_API_KEY is required for semantic memory writes")
    client = OpenAI(api_key=key)
    return client.embeddings.create(model=EMBEDDING_MODEL, input=text).data[0].embedding


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    if request.url.path == "/healthz" or request.url.path.startswith("/.well-known/"):
        return await call_next(request)
    try:
        claims = verify_token(request)
        token = current_claims.set(claims)
    except Exception as exc:
        return JSONResponse(
            {"error": "invalid_token", "error_description": str(exc)},
            status_code=401,
            headers={
                "WWW-Authenticate": 'Bearer error="invalid_token", error_description="Authentication required"',
            },
        )
    try:
        return await call_next(request)
    finally:
        current_claims.reset(token)


@mcp.tool()
def memory_record(
    content: str,
    memory_type: str,
    project_key: Optional[str] = None,
    source_type: str = "conversation",
    source_ref: Optional[str] = None,
    importance: float = 0.5,
    confidence: float = 1.0,
    ctx: Context = None,
) -> dict:
    claims = current_claims.get()
    if not claims:
        raise PermissionError("Authentication context missing")
    uk = user_key(claims)
    vector = embed(content)
    with db() as conn:
        row = conn.execute(
            """INSERT INTO sable_memory_items
               (user_key, project_key, memory_type, content, source_type, source_ref,
                importance, confidence, embedding)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
               RETURNING id, created_at""",
            (uk, project_key, memory_type, content, source_type, source_ref,
             importance, confidence, vector),
        ).fetchone()
        conn.commit()
    return {"id": str(row[0]), "created_at": row[1].isoformat(), "status": "active"}


@mcp.tool()
def memory_search(
    query: str,
    project_key: Optional[str] = None,
    memory_types: Optional[list[str]] = None,
    limit: int = 10,
    ctx: Context = None,
) -> list[dict]:
    claims = current_claims.get()
    if not claims:
        raise PermissionError("Authentication context missing")
    uk = user_key(claims)
    vector = embed(query)
    clauses = ["user_key=%s", "status='active'"]
    params: list[Any] = [uk]
    if project_key:
        clauses.append("project_key=%s")
        params.append(project_key)
    if memory_types:
        clauses.append("memory_type = ANY(%s)")
        params.append(memory_types)
    where = " AND ".join(clauses)
    sql_params = [vector, *params, vector, limit]
    with db() as conn:
        rows = conn.execute(
            f"""SELECT id, project_key, memory_type, content, source_type, source_ref,
                       importance, confidence, created_at,
                       1 - (embedding <=> %s::vector) AS similarity
                FROM sable_memory_items
                WHERE {where}
                ORDER BY embedding <=> %s::vector
                LIMIT %s""",
            sql_params,
        ).fetchall()
    return [
        {
            "id": str(r[0]), "project_key": r[1], "memory_type": r[2],
            "content": r[3], "source_type": r[4], "source_ref": r[5],
            "importance": r[6], "confidence": r[7],
            "created_at": r[8].isoformat(), "similarity": float(r[9]),
        }
        for r in rows
    ]


@mcp.tool()
def memory_get(memory_id: str, ctx: Context = None) -> dict:
    claims = current_claims.get()
    if not claims:
        raise PermissionError("Authentication context missing")
    uk = user_key(claims)
    with db() as conn:
        r = conn.execute(
            """SELECT id, project_key, memory_type, content, source_type, source_ref,
                      importance, confidence, status, valid_from, valid_to, supersedes_id,
                      created_at, updated_at
               FROM sable_memory_items WHERE id=%s AND user_key=%s""",
            (memory_id, uk),
        ).fetchone()
    if not r:
        return {"error": "memory_not_found"}
    return {
        "id": str(r[0]), "project_key": r[1], "memory_type": r[2],
        "content": r[3], "source_type": r[4], "source_ref": r[5],
        "importance": r[6], "confidence": r[7], "status": r[8],
        "valid_from": r[9].isoformat(), "valid_to": r[10].isoformat() if r[10] else None,
        "supersedes_id": str(r[11]) if r[11] else None,
        "created_at": r[12].isoformat(), "updated_at": r[13].isoformat(),
    }


@mcp.tool()
def command_record(
    instruction_text: str,
    project_key: Optional[str] = None,
    normalized_intent: Optional[str] = None,
    requested_action: Optional[str] = None,
    execution_target: Optional[str] = None,
    exact_command: Optional[str] = None,
    status: str = "requested",
    result_summary: Optional[str] = None,
    result_evidence: Optional[dict] = None,
    error_text: Optional[str] = None,
    ctx: Context = None,
) -> dict:
    claims = current_claims.get()
    if not claims:
        raise PermissionError("Authentication context missing")
    uk = user_key(claims)
    with db() as conn:
        r = conn.execute(
            """INSERT INTO sable_command_ledger
               (user_key, project_key, instruction_text, normalized_intent,
                requested_action, execution_target, exact_command, status,
                result_summary, result_evidence, error_text,
                started_at, completed_at, verified_at)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                       CASE WHEN %s IN ('executing','succeeded','verified','failed','reverted') THEN now() END,
                       CASE WHEN %s IN ('succeeded','verified','failed','reverted') THEN now() END,
                       CASE WHEN %s='verified' THEN now() END)
               RETURNING id""",
            (uk, project_key, instruction_text, normalized_intent,
             requested_action, execution_target, exact_command, status,
             result_summary, json.dumps(result_evidence or {}), error_text,
             status, status, status),
        ).fetchone()
        conn.commit()
    return {"id": str(r[0]), "status": status}


@mcp.tool()
def command_search(
    query: str,
    project_key: Optional[str] = None,
    limit: int = 20,
    ctx: Context = None,
) -> list[dict]:
    claims = current_claims.get()
    if not claims:
        raise PermissionError("Authentication context missing")
    uk = user_key(claims)
    pattern = f"%{query}%"
    with db() as conn:
        rows = conn.execute(
            """SELECT id, project_key, instruction_text, normalized_intent,
                      requested_action, exact_command, status, result_summary,
                      requested_at, completed_at, verified_at
               FROM sable_command_ledger
               WHERE user_key=%s
                 AND (%s IS NULL OR project_key=%s)
                 AND (instruction_text ILIKE %s OR COALESCE(normalized_intent,'') ILIKE %s
                      OR COALESCE(requested_action,'') ILIKE %s)
               ORDER BY requested_at DESC LIMIT %s""",
            (uk, project_key, project_key, pattern, pattern, pattern, limit),
        ).fetchall()
    return [
        {
            "id": str(r[0]), "project_key": r[1], "instruction_text": r[2],
            "normalized_intent": r[3], "requested_action": r[4],
            "exact_command": r[5], "status": r[6], "result_summary": r[7],
            "requested_at": r[8].isoformat(), "completed_at": r[9].isoformat() if r[9] else None,
            "verified_at": r[10].isoformat() if r[10] else None,
        } for r in rows
    ]


@mcp.tool()
def state_record(
    entity_type: str,
    entity_key: str,
    state: str,
    value: dict,
    project_key: Optional[str] = None,
    source_type: str = "verification",
    source_ref: Optional[str] = None,
    ctx: Context = None,
) -> dict:
    claims = current_claims.get()
    if not claims:
        raise PermissionError("Authentication context missing")
    uk = user_key(claims)
    with db() as conn:
        r = conn.execute(
            """INSERT INTO sable_state_snapshots
               (user_key, project_key, entity_type, entity_key, state, value,
                source_type, source_ref)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
               RETURNING id, observed_at""",
            (uk, project_key, entity_type, entity_key, state,
             json.dumps(value), source_type, source_ref),
        ).fetchone()
        conn.commit()
    return {"id": str(r[0]), "observed_at": r[1].isoformat(), "state": state}


@mcp.tool()
def state_get(
    entity_type: str,
    entity_key: str,
    project_key: Optional[str] = None,
    ctx: Context = None,
) -> dict:
    claims = current_claims.get()
    if not claims:
        raise PermissionError("Authentication context missing")
    uk = user_key(claims)
    with db() as conn:
        r = conn.execute(
            """SELECT id, state, value, source_type, source_ref, observed_at
               FROM sable_state_snapshots
               WHERE user_key=%s AND entity_type=%s AND entity_key=%s
                 AND (%s IS NULL OR project_key=%s)
               ORDER BY observed_at DESC LIMIT 1""",
            (uk, entity_type, entity_key, project_key, project_key),
        ).fetchone()
    if not r:
        return {"found": False}
    return {
        "found": True, "id": str(r[0]), "state": r[1], "value": r[2],
        "source_type": r[3], "source_ref": r[4], "observed_at": r[5].isoformat(),
    }


@mcp.tool()
def memory_context(
    query: str,
    project_key: Optional[str] = None,
    limit: int = 8,
    ctx: Context = None,
) -> dict:
    memories = memory_search(query, project_key=project_key, limit=limit, ctx=ctx)
    commands = command_search(query, project_key=project_key, limit=limit, ctx=ctx)
    return {
        "query": query,
        "project_key": project_key,
        "memories": memories,
        "commands": commands,
        "instruction": "Treat verified state and explicit user instructions as authoritative. If sources conflict, inspect the authoritative system before changing anything.",
    }


@app.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "wickedops-memory-mcp"}


@app.get("/.well-known/oauth-protected-resource/mcp")
async def protected_resource_metadata():
    return {
        "resource": os.environ.get("MCP_RESOURCE", ""),
        "authorization_servers": [f"https://login.microsoftonline.com/{TENANT_ID}/v2.0"],
        "scopes_supported": ["MCP.Access"],
        "bearer_methods_supported": ["header"],
    }


app.mount("/", mcp_app)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8110")))
