# WickedOps Memory MCP — Automation Completion Plan

This file tracks the production state and ongoing hardening work for the WickedOps Memory MCP.

## Production status

The Memory MCP is functionally complete and accepted in production.

Verified working:

- Memory MCP server is implemented with Streamable HTTP.
- Production Neon schema is live with pgvector.
- Public HTTPS endpoint is live at `https://memory-mcp.wickedadmin.com/mcp`.
- `/healthz` returns HTTP 200.
- OAuth protected-resource metadata is published and validated.
- Dedicated Entra resource API exists for the Memory MCP resource.
- `MCP_AUDIENCE` is configured for the dedicated API application.
- Dedicated ChatGPT OAuth client authenticates successfully.
- ChatGPT discovers and invokes the Memory MCP tools.
- Deployment validation passes: compile, schema, pgvector, systemd, local health, OAuth metadata, nginx, public HTTPS, unauthenticated MCP boundary, and recent service-error scan.
- Live connector write/read acceptance passed.
- Fresh-chat RAG acceptance passed: a new chat retrieved the persisted standing instruction and connector state without the user restating either.

## Current tool surface

Core tools:

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

## Runtime guarantees

For approved workflows:

1. Retrieve working context before consequential planning.
2. Record the instruction and execution lifecycle.
3. Persist durable corrections and decisions.
4. Preserve verified state independently from semantic memory.
5. Continue approved work automatically until completion, explicit user stop, or one concrete user-side blocker.
6. Do not store credentials, access tokens, passwords, API keys, OAuth client secrets, or raw secret payloads in memory.

## Acceptance result

PASS.

The acceptance sequence proved that the connector can:

- persist a standing instruction;
- persist current connector state;
- retrieve both through the live MCP;
- surface them from a fresh ChatGPT interaction without the user repeating them.

## Ongoing hardening work

These are improvements, not completion blockers:

- add automated regression tests for command lifecycle transitions and memory supersession;
- add retention/compaction policy for retrieval logs and stale state snapshots;
- add structured observability for MCP tool latency, error rate, and retrieval quality;
- add backup/restore validation for the Neon memory tables;
- add a periodic production self-test that validates health, auth boundary, schema, and a non-destructive read path;
- document recovery steps for OAuth client rotation and Entra resource-app replacement.

## Execution rule

Do not treat a conversational response as a stopping condition while approved dependent work remains. Continue until the active deliverable is complete, the user explicitly stops or changes direction, or one concrete user-side blocker prevents further execution.
