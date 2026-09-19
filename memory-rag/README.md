# Persistent RAG Memory for Sable / WickedOps

## Purpose

Create a durable project-and-command memory layer so Sable can reliably recover:
- what Mark explicitly instructed;
- what actions were actually executed;
- what succeeded, failed, or was reverted;
- current project state;
- constraints and preferences;
- decisions and corrections;
- source evidence needed to justify a memory.

This is not a replacement for the existing sable_memories table. It adds a structured memory ledger plus semantic retrieval.

## Design principles

1. Exact command history is authoritative. Store the user's instruction, planned action, executed action, and result separately.
2. Explicit user statements outrank inference.
3. Completed/verified state outranks assumed state.
4. Corrections create a new record and supersede the previous memory; history is never silently overwritten.
5. Every durable memory has provenance.
6. Retrieval is hybrid: exact metadata filters + full-text matching + vector similarity. Vector search alone is not sufficient for infrastructure state.
7. Project isolation is mandatory. Memories are scoped by user and project.
8. Sensitive values are never embedded. Secrets, tokens, passwords, OAuth client secrets, API keys and raw credentials are excluded from embeddings and normal retrieval.
9. The system keeps an operational state ledger separate from semantic memories.
10. Every command has a lifecycle: requested -> planned -> executing -> succeeded/failed -> verified/reverted.

## Memory classes

- instruction — explicit user command or constraint.
- decision — architecture/design decision.
- state — verified current state.
- correction — explicit correction of a previous assumption.
- preference — durable user preference.
- project_fact — stable project fact.
- procedure — reusable workflow/command pattern.
- artifact — repository/file/document reference.
- incident — failure and its root cause/resolution.

## Retrieval contract

For every meaningful request, the assistant should retrieve:
1. active project state;
2. recent command history;
3. applicable constraints/preferences;
4. relevant decisions;
5. recent corrections/incidents;
6. source evidence.

Then construct a working state snapshot before issuing any consequential command.

## Anti-repeat guard

Before recommending an action, compare it against the command ledger and state ledger.
If the same action was already completed, do not ask the user to repeat it. If the environment contradicts the remembered state, mark the state as CONFLICTED and inspect the source of truth before changing anything.

## Initial implementation target

The first implementation uses the existing WickedOps Neon project and the existing Sable application. The database migration in SCHEMA.sql is intentionally prepared but not applied until reviewed.