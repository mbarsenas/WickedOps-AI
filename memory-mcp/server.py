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


def _claims() -> dict[str, Any]:
    claims = current_claims.get()
    if not claims:
        raise PermissionError("Authentication context missing")
    return claims


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
    uk = user_key(_claims())
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
    uk = user_key(_claims())
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
    uk = user_key(_claims())
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
def memory_supersede(
    memory_id: str,
    replacement_content: str,
    memory_type: Optional[str] = None,
    project_key: Optional[str] = None,
    source_type: str = "correction",
    source_ref: Optional[str] = None,
    importance: float = 1.0,
    confidence: float = 1.0,
    ctx: Context = None,
) -> dict:
    uk = user_key(_claims())
    vector = embed(replacement_content)
    with db() as conn:
        old = conn.execute(
            """SELECT project_key, memory_type FROM sable_memory_items
               WHERE id=%s AND user_key=%s AND status='active'""",
            (memory_id, uk),
        ).fetchone()
        if not old:
            return {"error": "active_memory_not_found"}
        conn.execute(
            """UPDATE sable_memory_items
               SET status='superseded', valid_to=now(), updated_at=now()
               WHERE id=%s AND user_key=%s""",
            (memory_id, uk),
        )
        row = conn.execute(
            """INSERT INTO sable_memory_items
               (user_key, project_key, memory_type, content, source_type, source_ref,
                importance, confidence, supersedes_id, embedding)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
               RETURNING id, created_at""",
            (uk, project_key or old[0], memory_type or old[1], replacement_content,
             source_type, source_ref, importance, confidence, memory_id, vector),
        ).fetchone()
        conn.commit()
    return {
        "superseded_id": memory_id,
        "replacement_id": str(row[0]),
        "created_at": row[1].isoformat(),
        "status": "active",
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
    uk = user_key(_claims())
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
def command_update(
    command_id: str,
    status: str,
    exact_command: Optional[str] = None,
    result_summary: Optional[str] = None,
    result_evidence: Optional[dict] = None,
    error_text: Optional[str] = None,
    ctx: Context = None,
) -> dict:
    allowed = {"requested", "planned", "executing", "succeeded", "verified", "failed", "reverted"}
    if status not in allowed:
        return {"error": "invalid_status", "allowed": sorted(allowed)}
    uk = user_key(_claims())
    with db() as conn:
        r = conn.execute(
            """UPDATE sable_command_ledger
               SET status=%s,
                   exact_command=COALESCE(%s, exact_command),
                   result_summary=COALESCE(%s, result_summary),
                   result_evidence=CASE WHEN %s::jsonb = '{}'::jsonb THEN result_evidence ELSE %s::jsonb END,
                   error_text=COALESCE(%s, error_text),
                   started_at=CASE WHEN %s IN ('executing','succeeded','verified','failed','reverted')
                                   THEN COALESCE(started_at, now()) ELSE started_at END,
                   completed_at=CASE WHEN %s IN ('succeeded','verified','failed','reverted')
                                     THEN COALESCE(completed_at, now()) ELSE completed_at END,
                   verified_at=CASE WHEN %s='verified' THEN now() ELSE verified_at END
               WHERE id=%s AND user_key=%s
               RETURNING id, status, started_at, completed_at, verified_at""",
            (status, exact_command, result_summary,
             json.dumps(result_evidence or {}), json.dumps(result_evidence or {}),
             error_text, status, status, status, command_id, uk),
        ).fetchone()
        if not r:
            return {"error": "command_not_found"}
        conn.commit()
    return {
        "id": str(r[0]),
        "status": r[1],
        "started_at": r[2].isoformat() if r[2] else None,
        "completed_at": r[3].isoformat() if r[3] else None,
        "verified_at": r[4].isoformat() if r[4] else None,
    }


@mcp.tool()
def command_search(
    query: str,
    project_key: Optional[str] = None,
    limit: int = 20,
    ctx: Context = None,
) -> list[dict]:
    uk = user_key(_claims())
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
    uk = user_key(_claims())
    with db() as conn:
        previous = conn.execute(
            """SELECT id FROM sable_state_snapshots
               WHERE user_key=%s AND entity_type=%s AND entity_key=%s
                 AND (%s IS NULL OR project_key=%s)
               ORDER BY observed_at DESC LIMIT 1""",
            (uk, entity_type, entity_key, project_key, project_key),
        ).fetchone()
        r = conn.execute(
            """INSERT INTO sable_state_snapshots
               (user_key, project_key, entity_type, entity_key, state, value,
                source_type, source_ref, supersedes_id)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
               RETURNING id, observed_at""",
            (uk, project_key, entity_type, entity_key, state,
             json.dumps(value), source_type, source_ref,
             previous[0] if previous else None),
        ).fetchone()
        conn.commit()
    return {
        "id": str(r[0]),
        "observed_at": r[1].isoformat(),
        "state": state,
        "supersedes_id": str(previous[0]) if previous else None,
    }


@mcp.tool()
def state_get(
    entity_type: str,
    entity_key: str,
    project_key: Optional[str] = None,
    ctx: Context = None,
) -> dict:
    uk = user_key(_claims())
    with db() as conn:
        r = conn.execute(
            """SELECT id, state, value, source_type, source_ref, observed_at, supersedes_id
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
        "supersedes_id": str(r[6]) if r[6] else None,
    }


@mcp.tool()
def state_search(
    query: str = "",
    project_key: Optional[str] = None,
    limit: int = 20,
    ctx: Context = None,
) -> list[dict]:
    uk = user_key(_claims())
    pattern = f"%{query}%"
    with db() as conn:
        rows = conn.execute(
            """SELECT DISTINCT ON (entity_type, entity_key)
                      id, project_key, entity_type, entity_key, state, value,
                      source_type, source_ref, observed_at, supersedes_id
               FROM sable_state_snapshots
               WHERE user_key=%s
                 AND (%s IS NULL OR project_key=%s)
                 AND (%s='' OR entity_type ILIKE %s OR entity_key ILIKE %s OR state ILIKE %s OR value::text ILIKE %s)
               ORDER BY entity_type, entity_key, observed_at DESC
               LIMIT %s""",
            (uk, project_key, project_key, query, pattern, pattern, pattern, pattern, limit),
        ).fetchall()
    return [
        {
            "id": str(r[0]), "project_key": r[1], "entity_type": r[2],
            "entity_key": r[3], "state": r[4], "value": r[5],
            "source_type": r[6], "source_ref": r[7], "observed_at": r[8].isoformat(),
            "supersedes_id": str(r[9]) if r[9] else None,
        }
        for r in rows
    ]


@mcp.tool()
def memory_context(
    query: str,
    project_key: Optional[str] = None,
    limit: int = 8,
    ctx: Context = None,
) -> dict:
    memories = memory_search(query, project_key=project_key, limit=limit, ctx=ctx)
    commands = command_search(query, project_key=project_key, limit=limit, ctx=ctx)
    states = state_search(query, project_key=project_key, limit=limit, ctx=ctx)

    claims = _claims()
    uk = user_key(claims)
    with db() as conn:
        conn.execute(
            """INSERT INTO sable_memory_retrieval_log
               (user_key, project_key, query_text, filters, retrieved_ids, retrieval_mode)
               VALUES (%s,%s,%s,%s,%s,%s)""",
            (
                uk,
                project_key,
                query,
                json.dumps({"limit": limit}),
                [m["id"] for m in memories],
                "hybrid",
            ),
        )
        conn.commit()

    return {
        "query": query,
        "project_key": project_key,
        "memories": memories,
        "commands": commands,
        "states": states,
        "instruction": "Treat verified state and explicit user instructions as authoritative. If sources conflict, inspect the authoritative system before changing anything.",
    }


@mcp.tool()
def work_begin(
    instruction_text: str,
    project_key: Optional[str] = None,
    normalized_intent: Optional[str] = None,
    requested_action: Optional[str] = None,
    execution_target: Optional[str] = None,
    ctx: Context = None,
) -> dict:
    working_context = memory_context(
        instruction_text,
        project_key=project_key,
        limit=8,
        ctx=ctx,
    )
    command = command_record(
        instruction_text=instruction_text,
        project_key=project_key,
        normalized_intent=normalized_intent,
        requested_action=requested_action,
        execution_target=execution_target,
        status="planned",
        ctx=ctx,
    )
    return {"command": command, "working_context": working_context}


@mcp.tool()
def work_complete(
    command_id: str,
    status: str,
    result_summary: str,
    result_evidence: Optional[dict] = None,
    exact_command: Optional[str] = None,
    error_text: Optional[str] = None,
    project_key: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_key: Optional[str] = None,
    state: Optional[str] = None,
    state_value: Optional[dict] = None,
    source_ref: Optional[str] = None,
    ctx: Context = None,
) -> dict:
    if status not in {"succeeded", "verified", "failed", "reverted"}:
        return {"error": "invalid_terminal_status"}
    command = command_update(
        command_id=command_id,
        status=status,
        exact_command=exact_command,
        result_summary=result_summary,
        result_evidence=result_evidence,
        error_text=error_text,
        ctx=ctx,
    )
    snapshot = None
    if status in {"succeeded", "verified"} and entity_type and entity_key and state:
        snapshot = state_record(
            entity_type=entity_type,
            entity_key=entity_key,
            state=state,
            value=state_value or {},
            project_key=project_key,
            source_type="verification",
            source_ref=source_ref or command_id,
            ctx=ctx,
        )
    return {"command": command, "state_snapshot": snapshot}


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
