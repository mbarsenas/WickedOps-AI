# WickedOps Memory MCP Automation Runbook

This runbook documents the production Memory MCP and its operating/recovery procedures.

## Current verified state

- Memory MCP service runs under systemd on the VPS.
- Public endpoint: `https://memory-mcp.wickedadmin.com/mcp`.
- `/healthz` returns HTTP 200.
- OAuth protected-resource metadata is published and validated.
- Unauthenticated `/mcp` correctly returns HTTP 401.
- Production Neon schema and pgvector memory tables are live.
- Dedicated Entra resource API and ChatGPT OAuth client are configured.
- ChatGPT can discover and invoke the Memory MCP tool surface.
- Fresh-chat RAG acceptance has passed.

## Normal operating flow

For meaningful approved work:

1. Call `memory_context` (or `work_begin`, which retrieves context first) before consequential planning.
2. Record the instruction and execution target in the command ledger.
3. Execute the approved work.
4. Update the command lifecycle with result/evidence.
5. Record verified state when the expected result is observed.
6. Persist durable corrections/decisions as memory.
7. Continue automatically through dependent steps until completion, explicit user stop, or one concrete user-side blocker.

## Tool surface

- `memory_record`
- `memory_search`
- `memory_get`
- `memory_supersede`
- `command_record`
- `command_update`
- `command_search`
- `state_record`
- `state_get`
- `state_search`
- `memory_context`
- `work_begin`
- `work_complete`

## Production validation

The deployment is healthy only when all of these pass:

- Python compile.
- Neon connectivity.
- Required memory tables present.
- pgvector enabled.
- systemd service active.
- local `/healthz` returns 200.
- protected-resource metadata matches `MCP_RESOURCE` and advertises `MCP.Access`.
- `nginx -t` succeeds.
- public `/healthz` returns 200.
- unauthenticated MCP initialize POST returns 401.
- recent service logs contain no startup traceback, `421 Misdirected Request`, or uninitialized FastMCP task-group error.

Use `memory-mcp/deploy-memory-mcp.sh` for the validated deploy path. It backs up the deployed service files and rolls back automatically on failure.

## ChatGPT connector recovery

If actions disappear or show `RECONNECT NEEDED`:

1. Confirm `https://memory-mcp.wickedadmin.com/healthz` is healthy.
2. Confirm OAuth metadata is reachable at `/.well-known/oauth-protected-resource/mcp`.
3. Reconnect the ChatGPT plugin account if required.
4. Refresh actions in the plugin settings.
5. Verify the action list repopulates.
6. Run a non-destructive retrieval test from a new chat, such as asking for the standing execution instruction and current connector state.

## OAuth / Entra recovery

Resource API:

- Resource URI: `https://memory-mcp.wickedadmin.com/mcp`
- Delegated scope: `MCP.Access`
- Access tokens are validated against the configured `MCP_AUDIENCE`, tenant issuer, tenant ID, and delegated scope.

When rotating a ChatGPT client secret, update the connector configuration with the new secret and reconnect the account. Never store the client secret in Memory MCP records.

If replacing the Entra resource application, update `MCP_AUDIENCE`, verify the resource URI/scope, restart the service, reconnect ChatGPT, and rerun live retrieval acceptance before treating the replacement as production-ready.

## Memory safety

Never persist or embed:

- passwords;
- access or refresh tokens;
- OAuth client secrets;
- API keys;
- raw credential payloads;
- unnecessary sensitive personal data.

Corrections should supersede conflicting active memory instead of silently overwriting history.

## Acceptance test

The production loop is considered working when a fresh ChatGPT interaction can:

1. retrieve a prior standing instruction without the user repeating it;
2. identify the last verified state of the active project;
3. avoid repeating already completed work based on that state;
4. record a new instruction and execution result;
5. retrieve that new context later.

The current deployment has passed this acceptance test.
