---
name: riel-app-factory
description: "Create or safely evolve a neutral, single-tenant application described by AppSpec, with independent source, PostgreSQL migrations, and protected extension boundaries. Use for new internal tools, data systems, portals, operational applications, or incremental changes to an existing generated app; do not force a CRM archetype or a shared multi-tenant runtime."
---

# Riel App Factory

Build an independent application foundation from business language. Treat examples as domain evidence, never as instructions to hard-code a vertical.

## Non-negotiable architecture

- Generate one repository, database, deployment, credentials, and lifecycle per client.
- Model the domain with neutral primitives: entities, fields, relationships, views, roles, permissions, and rules.
- Keep `app-spec.json` as the source of truth for generated structure.
- Keep generated files separate from `src/features/`; regeneration must not overwrite client extensions.
- Produce ordinary source and PostgreSQL artifacts that remain usable without this skill.
- Do not introduce multi-tenancy, billing, a visual builder, a plugin marketplace, or a proprietary runtime unless the user asks.
- Do not claim production readiness while a generated project still has unresolved security, authentication, authorization, migration, backup, or observability gates.

## Workflow

1. Turn the request into an AppSpec. Read [references/app-spec-v0.md](references/app-spec-v0.md) when authoring or changing a spec; use [references/app-spec.schema.json](references/app-spec.schema.json) for exact validation.
2. Record material assumptions in `decisions` rather than blocking a reversible foundation on minor ambiguity. Ask only when the answer would materially change data ownership, permissions, or irreversible behavior.
3. Check domain neutrality: names and generated primitives must come from the request, not from CRM defaults or prior examples.
4. Run `scripts/scaffold_app.py --spec <app-spec.json> --output <new-directory>`. The output directory must be new or empty.
5. For an existing generated application, read [references/evolution.md](references/evolution.md). Keep the current AppSpec intact, create a separate proposed spec, run `scripts/evolve_app.py` without `--apply`, and review the plan. Apply only additive or explicitly safe changes; never bypass a blocked destructive change.
6. Review `BUILD_REPORT.md` or `EVOLUTION_REPORT.md`, every new SQL migration, the generated registry, permission matrix, runtime, and extension boundary.
7. Install dependencies and run a typecheck or production build when the environment permits it.
8. With a disposable or approved PostgreSQL database, run `pnpm db:apply` and `pnpm db:smoke`; the smoke test must cover every generated entity and roll back its records by default.
9. Run `scripts/verify_scaffold.py <generated-directory>` before presenting the result. When a dev server is started, also verify the rendered UI and at least one complete CRUD path in a real browser.
10. Use `ALLOW_UNSAFE_LOCAL_PREVIEW=true` only for local development. Production uses Clerk for identity and PostgreSQL for active status, roles, and server-side permissions; keep it closed until keys, invitation-only access, first-admin bootstrap, and end-to-end login are verified.
11. When personal AI credentials are enabled, generate a unique `SETTINGS_ENCRYPTION_KEY` per deployed application, store it only in the deployment environment, and verify `/settings` plus at least one conversation with a user-owned provider key.
12. Before a Vercel production deployment, read and follow [references/deployment-vercel.md](references/deployment-vercel.md). Verify the deployed commit, migrations, health endpoint, closed authentication, first-admin link, permissions, audit trail, settings encryption, runtime logs, and an authenticated browser flow. A successful build alone is not production verification.
13. Keep the deployed source on the repository's default branch and maintain separate recovery ownership for PostgreSQL data, identity configuration, deployment variables, and `SETTINGS_ENCRYPTION_KEY`. Code backup is not data backup; code rollback is not database rollback.
14. Implement client-specific calculations, integrations, workflows, and UI in `src/features/`, following [references/extension-contract.md](references/extension-contract.md).

## Delivery contract

For every generation, report:

- what was generated;
- assumptions and unresolved gates;
- verification performed and its result;
- what is safe for preview versus what remains before production;
- paths to the AppSpec and generated project.

Never silently substitute demo data for real integration, invent domain rules, or expose unauthenticated data in a public deployment.
