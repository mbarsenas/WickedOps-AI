# WickedOps Memory MCP — End-to-End Acceptance Test

## Goal

Prove the live ChatGPT connector can persist and retrieve durable instructions/state through the Memory MCP without the user having to repeat prior work.

## Preconditions

- ChatGPT plugin is connected to `https://memory-mcp.wickedadmin.com/mcp`.
- All eight actions are discoverable:
  - `memory_record`
  - `memory_search`
  - `memory_get`
  - `command_record`
  - `command_search`
  - `state_record`
  - `state_get`
  - `memory_context`
- Entra OAuth is working.
- `MCP_AUDIENCE=04810cf3-d33c-4ac0-906e-7b86a5694525` on the VPS.

## Acceptance sequence

1. Record a command with `command_record` using project key `wickedops-memory-mcp` and the instruction text:
   `Continue approved workflows automatically until completion or a real blocker; do not wait for me to say continue.`

2. Record the same durable instruction with `memory_record` as `memory_type=instruction`, `importance=1.0`, `confidence=1.0`.

3. Record verified connector state with `state_record`:
   - `entity_type=connector`
   - `entity_key=wickedops-memory-mcp-chatgpt`
   - `state=connected`
   - value containing the MCP URL, tool count 8, and API audience app id.

4. Retrieve the command with `command_search` using query `continue approved workflows automatically`.

5. Retrieve the durable instruction with `memory_search` using query `do not wait for me to say continue`.

6. Retrieve connector state with `state_get`.

7. Run `memory_context` with query `How should approved work continue and what is the current Memory MCP connector state?`.

8. Pass only if:
   - the recorded command is returned;
   - the instruction memory is returned;
   - connector state is returned as connected;
   - `memory_context` surfaces the instruction and prior execution/state context without the user repeating them.

## Completion criteria

The Memory MCP is only considered functionally complete once the live ChatGPT connector has passed this sequence. Tool discovery alone is not sufficient.
