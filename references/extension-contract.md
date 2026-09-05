# Extension contract

The factory owns structure; client code owns behavior that is not safely expressible as neutral metadata.

## Ownership zones

Generated and replaceable:

- `src/generated/`
- `BUILD_REPORT.md`

Generated SQL in `database/generated/` is immutable after application, not replaceable.
Shared auth, users, settings and MCP live in `src/platform/`. Runtime upgrades use
`platform-manifest.json` and [platform-updates.md](platform-updates.md), not regeneration.

Human- and agent-owned:

- `src/features/`
- `src/components/custom/`
- `database/custom/`
- deployment configuration containing client decisions

Exceptions are exact historical Factory files only: the ten auth/users/settings/mcp
import bridges in `src/features/` and seven SQL migrations 110–170 in `database/custom/`.
They remain for compatibility and are listed in `scripts/platform_files.py`; Factory
does not own other files in those directories. New platform SQL lives in `database/platform/`.

Never edit generated files to add client behavior. Add a feature module and register it through an explicit extension point. A later compiler may replace generated output without reading or rewriting feature implementations.

## What belongs in AppSpec

- entities, fields, relationships;
- standard validation and permissions;
- standard views and navigation;
- stable, declarative business intent.
- deterministic before-mutation conditions using the reviewed `set` and `block` actions.
- bounded record-attachment policies using the built-in PostgreSQL adapter.
- immutable custom migrations without their own transaction boundary; the runner commits SQL and migration ledger atomically.
- deterministic table, kanban, calendar, and dashboard view definitions.
- bounded, opt-in table bulk edits and kanban/calendar moves that reuse permissions, rules, transactions, and audit.

## What belongs in a feature

- domain calculations and scoring;
- third-party integrations;
- multi-step workflows and approvals;
- specialized reports;
- AI tools and prompts;
- bespoke interfaces;
- large-file, direct-upload, antivirus, OCR, or provider-specific storage adapters;
- side effects such as email, payments, or external writes.

The generic Clerk identity adapter and invitation policy belong to `src/platform/auth/`,
not a client feature. Client-specific identity behavior needs a reviewed integration;
modifying shared files is tracked as a local change and may conflict on upgrade.

## Database evolution

- Generated migrations are immutable after deployment.
- Run `scripts/evolve_app.py` in plan mode before changing an existing generated application; read [evolution.md](evolution.md) for its safety contract.
- Safe AppSpec changes create a new numbered migration and update only factory-owned artifacts; they do not rewrite an applied migration or client extension.
- Custom migrations use a separate sequence and must declare dependencies.
- Destructive schema changes require explicit review and a rollback or data-migration plan.

## Independence

Each generated project must be runnable from its own repository and documented environment variables. It may use ordinary open-source packages or chosen infrastructure, but it must not call App Factory or depend on the Riel coordinator at runtime.
