# Fairhour: guide for Claude Code sessions

Fairhour is an open-source, self-hostable time tracker that turns tracked time into
**the exact amounts to put on an invoice** through a pluggable, country-specific tax
engine (Italy is the reference pack). Tagline: _Every hour, fairly billed._

`PROGRESS.md` is the source of truth for what is done and what comes next. Read it first.

## Repo map

| Path                         | What lives there                                                               |
| ---------------------------- | ------------------------------------------------------------------------------ |
| `apps/web`                   | Next.js (App Router) web app + PWA, tRPC client, next-intl (en, it)            |
| `apps/desktop`               | Tauri 2 companion (tray timer, idle detection, activity suggestions)           |
| `apps/docs`                  | Starlight documentation site (GitHub Pages, base `/fairhour/`)                 |
| `packages/money`             | Exact money/decimal arithmetic on `bigint` minor units (MIT)                   |
| `packages/core`              | Time math, rounding, overlaps, rates, budgets, quick-add parser                |
| `packages/tax-core`          | Pure tax engine: `TaxPack` interface, pipeline, trace, conformance suite (MIT) |
| `packages/tax-pack-it`       | Italy: forfettario + ordinario (MIT)                                           |
| `packages/tax-pack-generic`  | Configurable VAT/no-VAT pack for any country (MIT)                             |
| `packages/tax-pack-template` | Copy-me template for new country packs (MIT)                                   |
| `packages/db`                | PostgreSQL + Drizzle schema, migrations, seed, tenant-scoped repositories      |
| `packages/api`               | tRPC routers for the app + zod → OpenAPI public REST                           |
| `packages/ui`                | Accessible design system (shadcn/ui based, light/dark)                         |
| `packages/pdf`               | PDF timesheets and invoice previews                                            |
| `packages/config`            | Shared tsconfig / eslint / prettier / tailwind presets                         |
| `scripts/github`             | Backlog sync, DCO check, repo automation (tested TypeScript)                   |
| `.github/backlog`            | The product backlog as code (synced to GitHub issues)                          |
| `docs/adr`                   | Architecture Decision Records. Every non-obvious decision gets one             |

## Commands

```bash
pnpm install                 # install (Node >= 22.18, pnpm via corepack)
pnpm dev                     # start everything (run `docker compose up -d` first for Postgres + Mailpit)
pnpm build                   # turbo build
pnpm lint                    # eslint (strict-type-checked) + prettier check
pnpm format                  # prettier --write
pnpm typecheck               # tsc --noEmit in every package
pnpm test                    # vitest unit tests (with coverage thresholds)
pnpm test:integration        # integration tests against Postgres (DATABASE_URL)
pnpm test:e2e                # Playwright E2E (desktop + mobile, axe checks)
pnpm knip                    # unused files/exports/dependencies
pnpm db:migrate              # apply Drizzle migrations
pnpm db:seed                 # demo data (several countries)
pnpm db:generate             # generate a migration after a schema change
pnpm i18n:check              # every locale has every English key
pnpm --filter @fairhour/<pkg> <script>   # run a script in one package
```

## Conventions

- TypeScript strict everywhere (`strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`). No `any`, no non-null assertions without a comment.
- **zod at every boundary** (HTTP, DB rows → domain, env, config files, tax pack config).
- **Money is never a float.** Use `@fairhour/money` (`bigint` minor units, explicit rounding).
- Timestamps are stored in UTC and rendered in the user's time zone (DST-safe, see `packages/core`).
- Every query goes through the workspace-scoped data layer. Never query a tenant table without `workspaceId`.
- Never log PII or secrets; use the pino logger from `@fairhour/api`.
- UI copy goes through next-intl. English is the source locale; never hard-code strings.
- Package scope is `@fairhour/*`; every package is `"private": true` for now.
- Files: kebab-case. React components: PascalCase exports. Tests: `*.test.ts` next to the code,
  integration tests in `*.int.test.ts`, E2E in `apps/web/e2e`.

## Commits and PRs

- Conventional Commits (`feat(tax-pack-it): …`, `fix(web): …`), enforced by commitlint and the PR title check.
- **DCO**: every commit is signed off (`git commit -s`). The `dco` workflow rejects unsigned commits.
- Reference work: `Closes #N` when the issue exists, otherwise `Refs CORE-012` (backlog ID).
- User-facing changes in packages need a changeset (`pnpm changeset`).
- Small, coherent commits. Never commit a broken build or failing tests.

## Definition of done

1. Code + tests (unit; integration for DB/API; E2E for user flows), coverage thresholds hold.
2. `pnpm lint && pnpm typecheck && pnpm test` pass (plus `test:integration`/`test:e2e` when touched).
3. Docs updated (`apps/docs`, `docs/`, ADR when a decision was made), i18n keys in `en` and `it`.
4. `reviewer` subagent approved the diff.
5. Backlog item marked `status: done` in `.github/backlog/*.yml`, `PROGRESS.md` updated.

## Delegation policy (follow it without being asked)

The main session **plans, splits the work and integrates the results**; it delegates by
default. Independent tasks run as parallel subagents.

| Work                                                                                                                     | Delegate to            |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| Architecture, cross-package design, ADRs, data model changes, anything in `packages/tax-*` (design _and_ implementation) | `architect`            |
| Feature implementation in apps/packages (except `tax-*`), refactors, bug fixes                                           | `implementer`          |
| Writing/extending unit, integration, property-based and E2E tests                                                        | `test-writer`          |
| Reviewing every change before it is committed or a PR is opened                                                          | `reviewer` (mandatory) |
| Finding code, mapping how something works, reading many files                                                            | `explorer`             |
| Translations, locale files, copy and docs typos                                                                          | `i18n`                 |
| Labels, backlog YAML, issue/PR text, changelog entries                                                                   | `triage`               |

Rules:

- Never use `explorer`, `i18n` or `triage` for anything touching `packages/tax-*`.
- `test-writer` may add tests in `packages/tax-*` only from a test plan written by `architect`.
- A change is done only after `reviewer` approves it **and** all checks pass.
- Give each subagent a self-contained brief: goal, files, constraints, acceptance criteria, commands to run.
- Subagents do not commit; the main session commits after review.

## Hard rules

- Never skip, weaken or delete a test to make it pass. Fix the code or record the issue in `PROGRESS.md` and the backlog.
- No `TODO: implement` in core or tax logic. Later-phase stubs must say so and link a backlog ID.
- No secrets in the repo (`.env.example` only). No force-push, no history rewrites on shared branches.
- Workflows: least-privilege `permissions:` and actions pinned to a full commit SHA with a version comment.
- Tax rules cite their legal source in code comments **and** in `docs/tax-packs/<country>.md`.
  See `packages/tax-core/CLAUDE.md` before touching anything under `packages/tax-*`.
- Cross-tenant access must be impossible: every new table/route gets a tenant-isolation test.
- Lockfile is committed. Prefer well-maintained dependencies; add one only with a reason.
