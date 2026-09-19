# WickedOps Memory MCP Automation Runbook

This runbook turns the deployed Memory MCP into the automated ChatGPT memory loop.

## Current verified state

- Memory MCP service deployed under systemd on the VPS.
- Public endpoint: `https://memory-mcp.wickedadmin.com/mcp`.
- `/healthz` returns HTTP 200.
- OAuth protected-resource metadata is published.
- Unauthenticated `/mcp` correctly returns HTTP 401.
- Production Neon schema and pgvector memory tables are live.

## Remaining automation path

### 1. Dedicated Entra resource application

Create an Entra app registration named `WickedOps Memory MCP API`.

- Single tenant.
- Application ID URI: `https://memory-mcp.wickedadmin.com/mcp`
- Delegated scope: `MCP.Access`
- `requestedAccessTokenVersion`: `2`

After creation, set the VPS `.env` value:

`MCP_AUDIENCE=<application-client-id>`

Restart `wickedops-memory-mcp.service` and validate a token against `/mcp`.

### 2. ChatGPT OAuth client

Create a dedicated Entra client application for the ChatGPT connector rather than reusing the Factory OAuth client.

Configure the exact ChatGPT redirect URI shown by the connector UI and request the fully-qualified delegated scope:

`https://memory-mcp.wickedadmin.com/mcp/MCP.Access`

### 3. Connector validation

The connector is not considered complete until all of these succeed through the live ChatGPT connection:

1. `memory_record`
2. `memory_search`
3. `memory_get`
4. `command_record`
5. `command_search`
6. `state_record`
7. `state_get`
8. `memory_context`

### 4. Automatic memory loop

The automation acceptance criterion is not merely that the tools are callable.

For every meaningful approved workflow:

- Record the exact user instruction to the command ledger before execution.
- Retrieve `memory_context` before consequential planning.
- Record exact execution commands/tool calls.
- Record success/failure and evidence.
- On success, write verified current-state snapshots.
- Persist durable corrections/decisions as semantic memories.
- Do not store credentials, tokens, passwords, API keys, or raw secrets.

### 5. Final acceptance test

The system is complete only when a fresh ChatGPT interaction can:

1. retrieve a prior standing instruction without the user repeating it;
2. identify the last verified state of the active project;
3. avoid repeating a previously completed command;
4. record a new instruction and its execution result;
5. retrieve that new state in a later interaction.

If any one of these fails, the automated RAG loop is not complete.
