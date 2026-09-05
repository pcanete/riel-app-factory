---
name: riel-app-factory
description: "Crea o evoluciona de forma segura una base operativa neutral para un solo cliente, descrita por AppSpec, con interfaz humana simple, migraciones PostgreSQL y acceso MCP de lectura y escritura para agentes. No fuerza un CRM, ERP, CMS, runtime multi-tenant ni dependencia del coordinador Riel."
---

# App Factory

Build an independent operational data foundation from business language. Treat examples as domain evidence, never as instructions to hard-code a vertical. Riel is a possible coordinating agent and is not part of the factory runtime.

## Non-negotiable architecture

- Generate one repository, database, deployment, credentials, and lifecycle per client.
- Model the domain with neutral primitives: entities, fields, relationships, views, roles, permissions, and rules.
- Keep `app-spec.json` as the source of truth for generated structure.
- Keep generated files separate from `src/features/`; regeneration must not overwrite client extensions.
- Keep shared auth, users, settings, and MCP in `src/platform/`. Track rendered runtime checksums in `platform-manifest.json`; never adopt unknown client files as Factory-owned. Preserve historical import bridges and SQL ledger identifiers.
- Produce ordinary source and PostgreSQL artifacts that remain usable without this skill.
- Keep the human interface intentionally sufficient for data administration; prioritize safe schema evolution and agent operability over vertical-product polish.
- Expose agents through authenticated, role-scoped MCP tools with independent read, write, and delete scopes. External agents bring their own models; the factory does not require Riel or an embedded LLM to operate.
- Keep agents technically distinct from users but require one active human owner per agent. Effective access is the intersection of credential scopes, agent role, and the owner's current role; audit preserves both executor and responsible person.
- Use `user_reference` when a domain profile such as a responsible person may optionally map to one login identity. Keep business attributes on the domain entity and authentication, role, and active status on `app_user`; do not merge them.
- Add `record_access` only when the request requires row ownership. Its owner must be a direct `user_reference`; every entity role must explicitly choose `all` or `own`; enforce the resulting scope across human UI, views, files, imports, exports, relations, mutations, and MCP. When omitted, preserve entity-level behavior unchanged.
- Treat workflows as client-specific extensions. Do not invent a universal approval state machine in the generated base; compose the required states, transitions, guards, notifications, and UI in `src/features/` once a real process exists.
- Treat `tags` as a first-class multi-value field across schema, PostgreSQL arrays/GIN, forms, filters, presentation, imports, exports, MCP, and evolution; never implement only one layer.
- Keep administrative lists paginated and mobile tables readable as labeled record cards.
- Fail closed before a deployment applies destructive SQL to live data. Authorization must identify one migration and follow tested backup/restore, never a permanent global bypass.
- Do not introduce multi-tenancy, billing, a visual builder, a plugin marketplace, or a proprietary runtime unless the user asks.
- Do not claim production readiness while a generated project still has unresolved security, authentication, authorization, migration, backup, or observability gates.

## Workflow

1. Turn the request into an AppSpec. Read [references/app-spec-v0.md](references/app-spec-v0.md) when authoring or changing a spec; use [references/app-spec.schema.json](references/app-spec.schema.json) for exact validation.
2. Record material assumptions in `decisions` rather than blocking a reversible foundation on minor ambiguity. Ask only when the answer would materially change data ownership, permissions, or irreversible behavior.
   If record ownership is required, decide which direct `user_reference` owns the row and which roles use `all` versus `own`; never infer a workflow from that ownership policy.
3. Check domain neutrality: names and generated primitives must come from the request, not from CRM defaults or prior examples.
4. Run `scripts/scaffold_app.py --spec <app-spec.json> --output <new-directory>`. The output directory must be new or empty.
5. For an existing generated application, read [references/evolution.md](references/evolution.md). Keep the current AppSpec intact, create a separate proposed spec, run `scripts/evolve_app.py` without `--apply`, and review the plan. Apply only additive or explicitly safe changes; never bypass a blocked destructive change.
   For runtime upgrades instead of domain changes, read [references/platform-updates.md](references/platform-updates.md). Run `check_platform.py`, resolve every conflict or unknown baseline, then apply with a persistent source backup. Do not overwrite whole application trees or applied SQL.
6. Review `BUILD_REPORT.md` or `EVOLUTION_REPORT.md`, every new SQL migration, the generated registry, permission matrix, runtime, and extension boundary.
7. Install dependencies and run a typecheck or production build when the environment permits it.
8. With a disposable or approved PostgreSQL database, run `pnpm db:apply` and `pnpm db:smoke`; the smoke test must cover every generated entity and roll back its records by default.
   When changing security or the migration runner, generate the dedicated `scripts/security_fixture.py` app and run `test:security-db` and `test:migrations-db` with `FACTORY_TEST_DATABASE=1` on a disposable database. Do not substitute source-string assertions for these tests. Run `scripts/test_platform.py` for updater changes.
9. Run `scripts/verify_scaffold.py <generated-directory>` before presenting the result. When a dev server is started, also verify the rendered UI and at least one complete CRUD path in a real browser.
10. Use `ALLOW_UNSAFE_LOCAL_PREVIEW=true` only for local development. Production uses Clerk for identity and PostgreSQL for active status, roles, and server-side permissions; keep it closed until keys, invitation-only access, first-admin bootstrap, and end-to-end login are verified.
11. Use the namespaced `app_setting` JSON registry for non-secret module and presentation options. Keep tokens, passwords, and private credentials in deployment environment variables or an approved secret manager.
12. Before a Vercel production deployment, read and follow [references/deployment-vercel.md](references/deployment-vercel.md). Verify the deployed commit, migrations, health endpoint, closed authentication, first-admin link, permissions, audit trail, application options, runtime logs, and an authenticated browser flow. A successful build alone is not production verification.
13. Keep the deployed source on the repository's default branch and maintain separate recovery ownership for PostgreSQL data, identity configuration, and deployment variables. Code backup is not data backup; code rollback is not database rollback.
14. Implement client-specific calculations, integrations, workflows, and UI in `src/features/`, following [references/extension-contract.md](references/extension-contract.md).
15. When agent access is requested, read [references/mcp.md](references/mcp.md). Create a distinct expiring least-privilege credential per agent, preserve AppSpec role permissions, and verify reads plus any authorized idempotent writes without logging returned business data or plaintext tokens.

## Delivery contract

For every generation, report:

- what was generated;
- assumptions and unresolved gates;
- verification performed and its result;
- what is safe for preview versus what remains before production;
- paths to the AppSpec and generated project.

Never silently substitute demo data for real integration, invent domain rules, or expose unauthenticated data in a public deployment.
