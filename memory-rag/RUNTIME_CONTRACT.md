# Memory/RAG Runtime Contract

## Write path

Every meaningful user instruction enters the command ledger before execution.

1. Capture exact instruction text.
2. Assign user_key and project_key.
3. Normalize intent without replacing the original text.
4. Record the exact command/tool call when one is executed.
5. Record the raw result summary and structured evidence.
6. On success, create a verified state snapshot.
7. On failure, record the failure and keep the request visible.
8. On user correction, create a correction memory and supersede the conflicting active memory.

## Standing execution rule

Once the user has approved, started, or explicitly told the assistant to build a workflow, continue through the remaining dependent steps without repeatedly asking for `ok`, `continue`, `go`, `please can we start`, or equivalent confirmation.

Pause only when one of these is true:
- a real blocker is encountered;
- a secret or credential must be entered locally by the user;
- an external action requires explicit confirmation or cannot be completed by the assistant's available tools;
- the observed environment contradicts remembered state and must be inspected before continuing.

Do not make the user repeat already-approved work. Treat prior approval as standing authorization for the current workflow unless the user changes direction.

## Distillation

After an execution or conversation turn, create durable memory items only for information that should survive the current turn.

Do not embed:
- secrets;
- access tokens;
- passwords;
- OAuth client secrets;
- API keys;
- raw credential payloads;
- unnecessary personal data.

## Retrieval

For an incoming request:

1. Resolve project_key from the current context.
2. Retrieve exact active state snapshots for affected entities.
3. Retrieve recent command ledger entries for the same project.
4. Retrieve explicit instructions, corrections, decisions, and incidents.
5. Run vector similarity against memory_items/chunks.
6. Merge and deduplicate by source ID.
7. Rank verified state and explicit instructions above inferred semantic matches.
8. Build a compact working-state object.
9. Only then plan a consequential action.

## Conflict handling

If retrieved state conflicts with a new explicit user instruction:
- the new explicit instruction wins for the requested operation;
- preserve the prior state;
- create a correction/supersession record.

If retrieved state conflicts with observed infrastructure:
- do not guess;
- mark the state conflicted;
- inspect the authoritative system;
- write a new verified snapshot after inspection.

## Command lifecycle

requested
planned
executing
succeeded
verified
failed
reverted

A command is not considered completed merely because a command was issued. It becomes completed/verified only when the expected result is observed.

## Why this prevents tonight's failure mode

The assistant must be able to answer these questions before issuing a command:

- What did Mark ask me to build?
- What have we already done?
- What did the last command actually return?
- What did Mark correct afterward?
- What is the verified current state?
- What should I not make him repeat?

The command ledger answers execution-history questions. The state ledger answers current-state questions. Vector memory answers semantic/context questions. None of the three replaces the others.
