# Vercel production runbook

Use this runbook for the supported Vercel + Neon PostgreSQL + Clerk path. The generated application is portable; these services are deployment adapters, not runtime dependencies of the factory.

## 1. Freeze a verified source revision

Before creating cloud resources:

- validate the AppSpec and run `python scripts/test_scaffold.py`;
- generate into a new or empty directory and run `python scripts/verify_scaffold.py <directory>`;
- install locked dependencies and run `pnpm typecheck` or `pnpm build`;
- apply migrations to a disposable PostgreSQL database with `pnpm db:apply`;
- run `pnpm db:smoke` and verify one complete CRUD path in a real browser;
- commit the source, lockfile, generated migrations, and documentation, but never environment files or secrets.

Do not deploy directly from an uncommitted working tree.

## 2. Provision one independent application

Create one Vercel project, one Neon database, one Clerk application, and one credential set for the generated application. Do not share these resources across unrelated clients.

Connect the GitHub repository to Vercel and set the framework to Next.js. Preserve the generated `vercel-build` command: in production it applies idempotent migrations, bootstraps the pending administrator when configured, and then executes `next build`. Preview builds do not mutate the production database.

Confirm the Vercel project actually reports an active Git repository link. A successful push is only source backup when that link is absent; it does not create a deployment. For an intentional CLI fallback:

- add `.vercel/` to `.gitignore` before linking locally;
- link the exact organization and project, then verify both identifiers in `.vercel/project.json` without committing that directory;
- run the production deployment from a clean, committed tree;
- record the resulting deployment ID and confirm that the stable alias points to it.

The generated migration runner normalizes CRLF/LF line endings before calculating checksums. This keeps the immutable-migration guard strict while preventing Windows, Git, or deployment transport from reporting a false modification of identical SQL.

## 3. Configure environment variables

Keep values scoped to the smallest required Vercel environments.

| Variable | Scope | Purpose |
|---|---|---|
| `DATABASE_URL` | Production, runtime | Pooled Neon connection used by the application |
| `DATABASE_URL_DIRECT` | Production, build | Direct/unpooled connection preferred for migrations |
| `DATABASE_CA_CERT` | Optional, sensitive | PEM CA for verified PostgreSQL TLS; supports literal `\\n` separators |
| `DATABASE_CA_CERT_FILE` | Local/server only | Path to a CA file; generally unsuitable for Vercel's immutable environment |
| `DATABASE_SSL` | Optional | `off` for trusted local networks or `relaxed` as an explicit unverified fallback |
| `NEXT_PUBLIC_APP_URL` | Production | Canonical application origin used in links |
| `MCP_ALLOWED_HOSTS` | Optional | Additional comma-separated hosts accepted by `/api/mcp` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Production | Public Clerk application identifier |
| `CLERK_SECRET_KEY` | Production, sensitive | Server-side Clerk operations |
| `BOOTSTRAP_ADMIN_EMAIL` | Production | Email for the first pending administrator |
| `BOOTSTRAP_ADMIN_NAME` | Production | Optional display name for that administrator |

Never configure `ALLOW_UNSAFE_LOCAL_PREVIEW=true` in Vercel. Production ignores it, but its presence creates misleading operational state.

`app_setting` is not a secret manager. Keep any client-feature token or password in Vercel environment variables or an approved external secret store.

Use a Clerk production instance and its live key pair before calling an environment production-ready. Clerk development keys are acceptable for a temporary Hobby evaluation, but they have strict limits and keep the deployment in test status even when authentication itself works.

Keep the PostgreSQL TLS mode explicit. Prefer the provider URL when it already verifies TLS, or set `DATABASE_CA_CERT` for an explicit trusted CA. `DATABASE_SSL=relaxed` disables certificate verification and must not become the normal production setting. If the connection parser warns that `sslmode=require` will change semantics in a future major release, plan and test a controlled move to verified TLS; do not silently rewrite a production connection string during an unrelated deployment.

## 4. Close identity before opening access

- Configure Clerk for invitation-only access.
- Set the same verified email in `BOOTSTRAP_ADMIN_EMAIL` and in the first Clerk invitation or identity.
- Deploy while the application remains private or otherwise inaccessible to uninvited users.
- Sign in as the first administrator and confirm that the pending PostgreSQL identity links to the stable Clerk subject.
- Create later users from `/users`; PostgreSQL remains authoritative for active status and role.

Clerk proves identity. It does not replace server-side permission checks or the `app_user` record.

## 5. Deploy and verify the complete story

A green build is necessary but insufficient. Verify all of the following against the production URL:

1. Vercel reports the deployment as ready and build logs show the expected migrations.
2. `GET /api/health` returns `200` and confirms database access without exposing secrets.
3. An unauthenticated visitor is redirected to sign-in and cannot read application data.
4. The invited administrator can sign in and reaches the application with the expected role.
5. One representative create, read, update, and delete flow enforces permissions and writes audit events.
6. `/users` can invite or stage a user without allowing self-deactivation or unauthorized role changes.
7. `/settings` can save and delete a representative non-secret JSON option, and its audit events are visible.
8. Create a distinct expiring MCP agent, connect with its one-time token, call `list_entities`, then run a representative idempotent create/update/delete cycle first against a disposable database and finally against production; confirm tool events and linked mutation audits at `/agents` and `/audit`.
9. Runtime logs contain no unhandled error for the verified flow.

Record the source commit, production deployment URL, migration result, and verification date in the delivery handoff.

## 6. Recovery and portability

- A Vercel rollback rolls back code, not PostgreSQL. Prefer additive, backward-compatible migrations; destructive changes require an explicit data migration, backup, and rollback plan.
- Configure Neon backups or point-in-time recovery appropriate to the client's data and test restoration before claiming recoverability.
- Export or document Clerk configuration and recovery ownership.
- Keep deployment environment variables inventoried without copying their secret values into GitHub.

If Vercel disappears, the committed Next.js application can run on another Node-compatible host. If the factory disappears, every generated application still contains its ordinary source, migrations, AppSpec, and runtime documentation.

## Stop conditions

Do not declare the deployment production-ready when any of these remain unresolved:

- the default branch does not contain the deployed source;
- a secret or customer record is present in Git history;
- authentication permits public sign-up unintentionally;
- a supposedly production environment still uses Clerk development keys;
- server-side permissions or the first-admin link have not been tested;
- MCP accepts an unauthenticated request, an unapproved host, or an agent cannot be attributed by token and role;
- migrations are destructive or have no recovery plan;
- database recovery ownership is unknown;
- health, logs, and an authenticated browser flow have not been checked.
