# Agent access through MCP

Use this contract when an external agent such as Riel, Codex, Claude, or another coordinator needs to read or later operate a generated application's data. The factory and the agent are separate systems: the generated application owns authentication, authorization, data, and audit history; the external agent brings its own model and orchestration.

## Initial read-only surface

The generated runtime exposes stateless Streamable HTTP at `/api/mcp` using the official TypeScript MCP SDK. Its first capability set is deliberately read-only:

- `list_entities`: discover authorized entities;
- `describe_entity`: inspect fields, relationships, attachments, and labels;
- `count_records`: count a bounded query;
- `query_records`: search, filter, sort, and paginate up to 100 records;
- `get_record`: read one record by UUID;
- `export_snapshot`: export up to 10 authorized entities and 100 records per entity with a content fingerprint.

Do not add arbitrary SQL or a generic code-execution tool. Add new tools by composing validated repository functions, AppSpec permissions, bounded inputs, and attribution.

## Identity and authorization

Apply database migrations, then create one credential per agent:

```bash
pnpm mcp:agent:create -- --name "Riel" --role admin --expires-days 90
```

The command prints the token once. Store it in the consuming agent's secret environment and never in source control. PostgreSQL stores only its SHA-256 hash. The selected role must exist in AppSpec; entity access is the intersection of the agent's MCP scopes and that role's generated `list` or `read` permissions.

Connect to `https://<application-host>/api/mcp` using `Authorization: Bearer <token>`. Configure `NEXT_PUBLIC_APP_URL` accurately. Use `MCP_ALLOWED_HOSTS` only for additional explicit hosts, separated by commas.

Deactivate or expire a credential in `app_agent` when it is no longer needed. Never share one credential between independent agents or environments.

## Traceability

Every tool call must create an `app_agent_event` before accessing records and finish it as completed or failed. Store the agent, tool, optional entity, bounded input summary, result count, duration, and error. Do not store plaintext credentials or returned business records in the event log.

Read activity is attributed but not mixed into the human mutation audit table. Future write tools must use the same rules and transaction boundaries as human CRUD and record both the data mutation and the agent execution.

## Safe expansion

Before adding write tools, define separately:

- `records:write` scopes and least-privilege agent roles;
- deterministic input parsing and AppSpec rule execution;
- idempotency keys for every mutation;
- proposal versus immediate-execution policies;
- human approval for sensitive actions;
- transactional mutation audit with the agent identity;
- rate, payload, and result limits.

The embedded application assistant is optional and independent. MCP access must continue working when no OpenAI, Anthropic, or AI Gateway key exists in the generated application.
