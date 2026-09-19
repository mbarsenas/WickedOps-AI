# WickedOps Memory MCP

Persistent command, state, and semantic memory for Sable/WickedOps.

## Tools

- memory_record
- memory_search
- memory_get
- command_record
- command_search
- state_record
- state_get
- memory_context

## Required environment

ENTRA_TENANT_ID
MCP_AUDIENCE
MCP_RESOURCE
DATABASE_URL
OPENAI_API_KEY

Optional:
EMBEDDING_MODEL=text-embedding-3-small
PORT=8110

## Transport

Streamable HTTP:

https://<host>/mcp

Protected resource metadata:

https://<host>/.well-known/oauth-protected-resource/mcp

## Security

All memory is scoped to the Entra subject/object id from the validated bearer token. Secrets and credentials must never be stored as memory content or embeddings.
