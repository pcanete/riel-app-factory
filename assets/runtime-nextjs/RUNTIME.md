# Generated runtime

This project is a local application foundation generated from `app-spec.json`.

## Local preview

1. Start PostgreSQL with `docker compose up -d db`, or provide any PostgreSQL connection.
2. Copy `.env.example` to `.env.local` and set `DATABASE_URL`.
3. Install dependencies with `pnpm install` or `npm install`.
4. Apply the generated migration with `pnpm db:apply`.
5. Verify real CRUD with `pnpm db:smoke`.
6. Run `pnpm dev` and choose a role at `/dev-access`.

`ALLOW_UNSAFE_LOCAL_PREVIEW=true` enables a passwordless role selector only outside production. Every page and mutation still enforces the generated permission matrix on the server. Production ignores this local path. Clerk proves identity; PostgreSQL remains authoritative for account status, role, and permissions. Without both Clerk keys the production login stays closed.

Every create, update, and delete operation writes `app_audit_log` in the same database transaction. Roles with full list/read/delete access across every entity can review and filter the history at `/audit`.

## User management

Users with full administrative access can manage application users at `/users`: create pending identities, send Clerk invitations, assign one AppSpec role, and activate or deactivate access. User mutations are validated on the server and written to the audit log. Accounts are deactivated instead of deleted so their history remains attributable.

Local-preview identities are read-only and the current administrator cannot deactivate their own account or remove their own role. The module intentionally does not edit role permissions at runtime: roles and their permission matrices remain versioned in AppSpec. On first production login, a verified Clerk email is atomically matched to an active `pending:` user, replaced with the stable Clerk subject, and audited.

For a new deployment, connect Neon and Clerk to the Vercel project. Production deployments run the idempotent database migrations before `next build`; preview deployments never mutate the production database. Define `BOOTSTRAP_ADMIN_EMAIL` and optionally `BOOTSTRAP_ADMIN_NAME` in the Production environment before the first deployment to create the pending PostgreSQL administrator automatically. Configure Clerk for invitation-only access and invite that same email from Clerk or create the first identity there. Its first verified login links the Clerk identity to the pending PostgreSQL user. Subsequent invitations can be sent from `/users`.

Outside Vercel, set `DATABASE_URL_DIRECT`, run `pnpm db:apply`, define `BOOTSTRAP_ADMIN_EMAIL` and optionally `BOOTSTRAP_ADMIN_NAME`, then run `pnpm auth:bootstrap`.

## Production verification and recovery

Treat a successful Vercel build as the beginning of production verification, not its end. Confirm the deployed source commit, migration logs, `GET /api/health`, unauthenticated redirect, invited administrator login, one permission-checked CRUD path, audit events, `/users`, `/settings`, and one authenticated MCP cycle when agent access is enabled. Review runtime logs for the verified flow.

Keep one independent Vercel project, Neon database, Clerk application, and credential set for this application. Store production secrets only in the deployment environment and an approved recovery system; never commit them.

A code rollback does not roll back PostgreSQL. Prefer additive, backward-compatible migrations and require an explicit data backup, migration, and rollback plan for destructive changes. Configure database backup or point-in-time recovery appropriate to the application and test restoration. Record who owns recovery for source, data, identity, and environment variables.

## Safe application evolution

Keep `app-spec.json` as the committed current baseline. To add entities, fields, relationships, views, permissions, or deterministic rules, create a separate proposed AppSpec and use App Factory's `scripts/evolve_app.py` first in plan mode and then with `--apply`. The tool creates the next immutable generated migration and refreshes only `app-spec.json`, `src/generated/`, and generated reports.

Never replace the current AppSpec before producing the comparison. Review `EVOLUTION_REPORT.md` and the SQL diff, confirm database recovery, and test the migration outside production. Removals, renames, type changes, enum-value removal, and required-column backfills intentionally stop for a custom migration and rollback plan.

Every entity also exposes generic CSV/XLSX transfer tools:

- export and template downloads require the entity's server-side permissions;
- imports accept at most 5 MB and 1,000 create-only rows;
- every file is prevalidated before a user-owned preview batch is staged for one hour;
- confirmation inserts the complete batch and its audit events in one database transaction;
- relationship cells accept an existing UUID or an exact title-field value.

Production operations must schedule cleanup of expired `app_import_batch` rows and review import/export limits for the client.

## Attachments

Entities that enable `attachments` in AppSpec expose a protected attachment panel on each record. Upload and deletion require the entity's `update` permission; listing and download require `read`. File metadata, bytes, checksum, actor, and audit event are committed through PostgreSQL, with a hard limit of 4 MB per file.

The PostgreSQL adapter keeps local and small deployments portable. Large files, direct browser uploads, antivirus scanning, OCR, or external object storage belong behind a reviewed client adapter.

## Named views

Navigation-enabled table, kanban, calendar, and dashboard definitions are rendered at `/views/[view]`:

- table views support combined field filters, searchable text, and validated ordering;
- kanban columns come from a validated enum field;
- calendar events use a validated date/datetime field and the AppSpec timezone;
- dashboards provide count/sum/average metrics, enum/boolean breakdowns, and recent-record tables without arbitrary SQL.

These views are read-oriented. Drag-and-drop mutations, scheduling side effects, and specialized charting remain client features.

## Deterministic rules

AppSpec rules execute before create, update, delete, or both create/update (`before_save`). The evaluator accepts only validated condition trees and deterministic `set` or `block` actions. Successful assignments and their rule keys are included in the same audit event as the mutation; blocked operations write nothing.

Administrators can inspect the active definitions at `/rules`. The kernel deliberately rejects arbitrary expressions and does not provide approvals, schedules, email, webhooks, external writes, or AI actions.

## MCP access for external agents

The application exposes a stateless Streamable HTTP endpoint at `/api/mcp` with separately scoped read, write, and delete capabilities. MCP is the default AI and agent interface: an external coordinator such as Riel, Codex, or Claude brings its own model, model provider, context, and orchestration. The application therefore requires no embedded chat or LLM credential.

After applying migrations, administrators create, revoke, and reactivate agent connections at `/agents`. The interface displays the credential once and prepares a ready-to-paste Claude Code command. The CLI remains available for automation and recovery:

```bash
pnpm mcp:agent:create -- --name "Riel" --role admin --access write --expires-days 90
```

The token is displayed once and stored only as a SHA-256 hash. Send it as `Authorization: Bearer <token>` to `https://<application-host>/api/mcp`. Configure `NEXT_PUBLIC_APP_URL` correctly and use `MCP_ALLOWED_HOSTS` only for explicit additional hosts. `--access read` permits discovery and bounded queries; `write` adds idempotent create/update; `full` also adds explicitly confirmed deletion. AppSpec role permissions, deterministic rules, payload/rate bounds, transactional audit, and agent attribution still apply. Returned business records and plaintext tokens are not copied into the tool-event log.

Before production, run `pnpm mcp:smoke:write` against a local or disposable database with representative entity values. Do not use production as the first write test.

Mutation tools remain constrained by AppSpec rules, idempotency, transactional auditing, explicit delete confirmation, and the agent's role and scopes.

## Application settings

`/settings` is an administrator-only surface backed by `app_setting`, a namespaced key/value registry with a native `jsonb` value. It accepts strings, numbers, booleans, objects, arrays, and null, and is the default home for non-secret module and presentation options. Use `getApplicationOption(namespace, key, fallback)` from `src/features/settings/store.ts` in client features. Keep tokens, passwords, and private credentials in deployment environment variables or an approved secret manager, never in `app_setting`.

## Ownership

Do not add client behavior to `src/generated/` or `database/generated/`. Use `src/features/`, `src/components/custom/`, and `database/custom/`.
