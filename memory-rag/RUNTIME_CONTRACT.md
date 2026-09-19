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

## Completion-state rule

Never equate a stopped response, paused tool sequence, or finished message with task completion.

- If the approved deliverable is not fully built and validated, the task remains active.
- Do not present partial implementation, planning artifacts, runbooks, scripts, or commits as equivalent to a finished product.
- Do not stop merely because one implementation unit was completed when additional approved dependent work remains.
- A response may end before the product is complete only when a genuine blocker exists that cannot be resolved with available tools or without a required external action by the user.
- When blocked, state the single concrete blocker and preserve the task as unfinished; do not imply readiness or completion.

## Continuous carry-forward rule

When an approved multi-step build is in progress, the assistant must carry the workflow forward automatically from one completed step to the next.

- Do not wait for the user to ask "what's next", "continue", "carry on", "build it", "start", or equivalent.
- After every successful tool action, immediately evaluate and execute the next dependent action that is already authorized.
- If a user-side action is required, give one complete, exact instruction for that blocker and resume the workflow automatically as soon as the resulting state/output is provided.
- When the user reports a successful checkpoint, do not stop at acknowledgment; continue into validation, integration, and acceptance testing.
- A conversational reply is not a stopping point while approved work remains.

## Deliverable-first ownership rule

Treat approved build work like an engineering assignment, not an interactive shell tutorial.

- The user is the stakeholder, not the terminal operator for every intermediate implementation detail.
- When asked to build a product, service, MCP server, integration, deployment, or feature, own the workflow end-to-end and return when a meaningful deliverable is built, validated, or blocked by something only the user can do.
- Do not delegate ordinary engineering implementation back to the user as a stream of `sed`, `cat`, `grep`, `find`, or similarly granular inspection commands when the same work can be consolidated into a script, patch, repository change, connector action, or other executable unit.
- Prefer one complete build/deploy/validate script over many tiny commands and repeated round trips.
- Prefer direct repository edits, generated files, migrations, tests, and automated checks through available tools over instructions that make the user manually reconstruct the same work.
- When VPS access is unavailable, provide a single cohesive script or deployment block that performs the full available unit of work, including backups, changes, validation, and a concise final status report.
- Intermediate command output is implementation detail unless it reveals a real blocker, a security-sensitive decision, or a materially ambiguous state.
- The default completion criterion is a working, validated deliverable, not merely code snippets or instructions for the user to assemble.

## Anti-stall / execution-first rule

Do the available work before narrating future work.

- Never end a response with phrases such as `after that I can...`, `then I can...`, `once you do that I can...`, `say go`, `tell me when you're ready`, or equivalent future-work narration when there is meaningful work the assistant can perform immediately.
- If a dependent step can be completed with available tools, complete it in the same turn.
- If the assistant needs one specific user-side command or value, ask only for that true blocker and continue immediately once it is supplied; do not re-request approval for the already-approved workflow.
- Prefer concrete completed actions, patches, commits, tests, or exact commands over promises to act later.
- When multiple dependent tasks are already approved, continue task-to-task until completion or a genuine blocker is reached.
- Before asking the user to repeat output, inspect existing conversation context, attached logs, files, command history, repository state, or connected tools first.

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
