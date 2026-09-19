# WickedOps Memory MCP — Automation Completion Plan

This file tracks the remaining work required for the Memory MCP to become the automated ChatGPT memory loop the project requires.

## Already working

- Memory MCP server is implemented with Streamable HTTP.
- Production Neon schema is live.
- `memory_record`, `memory_search`, `memory_get`, `command_record`, `command_search`, `state_record`, `state_get`, and `memory_context` are implemented.
- VPS deployment is running under systemd.
- Public HTTPS endpoint is live at `https://memory-mcp.wickedadmin.com/mcp`.
- `/healthz` is public and returns 200.
- OAuth protected-resource metadata is published.
- Unauthenticated `/mcp` correctly returns 401.

## Completion definition

The Memory MCP is not considered complete until all of the following work end to end:

1. A dedicated Entra resource app exists for `https://memory-mcp.wickedadmin.com/mcp`.
2. `MCP_AUDIENCE` on the VPS is updated to that app registration and a real delegated token can authenticate to `/mcp`.
3. A ChatGPT OAuth client is configured for the Memory MCP resource.
4. ChatGPT can connect to the MCP and enumerate/call its tools.
5. End-to-end tool tests succeed through the live connector:
   - `memory_record`
   - `memory_search`
   - `command_record`
   - `command_search`
   - `state_record`
   - `state_get`
   - `memory_context`
6. Runtime behavior is enforced:
   - every meaningful approved instruction is written to the command ledger before execution;
   - durable corrections/decisions are persisted to memory;
   - completed work writes verified state snapshots;
   - `memory_context` is retrieved before consequential planning;
   - completed work is not re-requested unless observed infrastructure contradicts memory.
7. One acceptance test proves the loop:
   - record an instruction;
   - record completion and verified state;
   - start a fresh interaction;
   - retrieve the prior instruction/state automatically;
   - avoid asking the user to repeat the completed work.

## Current hard blocker

Creating the dedicated Entra resource app and OAuth client requires access to the user's Microsoft Entra tenant. The GitHub connector cannot perform that tenant mutation. Until an Entra-capable tool or the user's tenant-side action is available, repository-side and backend implementation can continue, but live ChatGPT authentication cannot be completed.

## Execution rule

Do not divert to unrelated Factory work until this acceptance test passes or a genuine external blocker prevents progress.
