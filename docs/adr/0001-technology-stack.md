# ADR-0001: Technology stack

- **Status:** Accepted
- **Date:** 2026-10-09
- **Deciders:** @fabiovincenzi (lead maintainer)
- **Backlog:** FND-007

## Context

Fairhour is a self-hostable time tracker whose distinguishing feature is a pluggable tax engine
that turns tracked time into the exact amounts to put on an invoice. The repository holds:

- a web app (with a PWA) that most people use, and later a public REST API;
- a desktop companion that needs OS integration (idle time, frontmost application);
- a documentation site served from GitHub Pages;
- pure libraries (`money`, `tax-core`, `tax-pack-*`) that must give identical results on the
  server, in the browser (live invoice previews) and in the desktop app, and that are meant to be
  reused outside Fairhour ([ADR-0002](0002-licensing.md)).

A small team maintains the project. Tax packs and translations come from the community, often
from people who know the law or the language better than the toolchain. Much of the code is
written with AI assistance (Claude Code with [`CLAUDE.md`](../../CLAUDE.md) and the subagents in
`.claude/agents`), so conventions have to be written down and enforced by tools rather than
carried in people's heads.

Phase 1 (FND-001) builds the monorepo foundation, so the stack has to be fixed now. Choices that
only matter later (the zod to OpenAPI generator, the internals of `@fairhour/money`) get their
own ADRs. The versions below were the current releases on 2026-10-09; this ADR decides the
release line, not the patch version.

## Decision drivers

1. **Correctness.** Exact money, strict types, validation at every boundary, and tests against
   the real database.
2. **One language end to end.** Domain logic and tax packs run unchanged on the server, in the
   browser and in the desktop app.
3. **Self-hosting first.** One container plus PostgreSQL, no dependency on a hosting vendor, and
   no data leaves an instance unless its operator configures it.
4. **Contributor accessibility.** Mainstream, well-documented tools, fast local feedback, few
   bespoke build steps.
5. **Low maintenance for a small team.** Few moving parts, stable release lines, grouped
   automated updates.
6. **License compatibility** with [ADR-0002](0002-licensing.md): permissive dependencies for the
   MIT libraries, nothing incompatible with AGPL-3.0 for the apps.
7. **Explicit conventions.** Rules live in shared config, lint rules and `CLAUDE.md`, so that
   humans and agents apply them the same way.

## Considered options

The chosen option comes first in each row; the reasons are in the [Decision](#decision).

| Area                | Options considered                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------- |
| Workspace and tasks | **pnpm workspaces + Turborepo**; npm or Yarn workspaces; Nx                                   |
| Language            | **TypeScript 6.0**; TypeScript 7 (native port); TypeScript 7 for type checks + 6 for lint     |
| Lint and format     | **ESLint + typescript-eslint + Prettier**; Biome; oxlint                                      |
| Package consumption | **TypeScript source inside the workspace**; build every package to `dist`; project references |
| Web framework       | **Next.js (App Router)**; React Router 7 (framework mode); SvelteKit; TanStack Start          |
| UI                  | **Tailwind CSS + shadcn/ui on Radix**; MUI; Mantine                                           |
| App API             | **tRPC**; REST only; GraphQL                                                                  |
| Database access     | **Drizzle ORM**; Prisma; Kysely; hand-written SQL                                             |
| Authentication      | **Better Auth**; Auth.js; hosted identity (Clerk, Auth0); our own implementation              |
| Testing             | **Vitest + fast-check, Playwright**; Jest; Cypress                                            |
| Docs site           | **Starlight (Astro)**; Fumadocs; Nextra; Docusaurus                                           |
| Desktop             | **Tauri 2**; Electron; a native app per OS                                                    |

## Decision

### Summary

| Area               | Choice                                                                                                     | Release line                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Runtime            | Node.js LTS: baseline 22 (at least 22.18), CI also on 24                                                   | 22, 24                                        |
| Package manager    | pnpm workspaces, pinned with `packageManager`                                                              | 10                                            |
| Task runner        | Turborepo                                                                                                  | 2.11                                          |
| Language           | TypeScript, capped below 6.1                                                                               | 6.0                                           |
| Lint and format    | ESLint flat config, typescript-eslint `strictTypeChecked` + `stylisticTypeChecked`, Prettier               | ESLint 10, typescript-eslint 8.71, Prettier 3 |
| Repository hygiene | knip; lefthook + lint-staged; commitlint (Conventional Commits + `Signed-off-by`); Changesets              | knip 6, Changesets 3                          |
| Library builds     | tsdown (ESM + `.d.ts`), publish-ready libraries only                                                       | 0.23                                          |
| Web                | Next.js App Router, React                                                                                  | 16, 19                                        |
| Styling and UI     | Tailwind CSS (CSS-first configuration), shadcn/ui on Radix primitives                                      | Tailwind 4                                    |
| Client data        | TanStack Query, where client-side caching is needed                                                        | 5                                             |
| i18n               | next-intl; `en` is the source locale, `it` the first translation                                           | 4                                             |
| Charts             | Recharts                                                                                                   | 3                                             |
| App API            | tRPC                                                                                                       | 11                                            |
| Public API         | REST described by OpenAPI 3.1, generated from zod (generator chosen in phase 7)                            | n/a                                           |
| Database           | PostgreSQL                                                                                                 | 16                                            |
| ORM and migrations | Drizzle ORM and drizzle-kit, postgres.js driver                                                            | 0.45, 0.31                                    |
| Authentication     | Better Auth with database sessions through the Drizzle adapter                                             | 1.7                                           |
| Validation         | zod at every boundary                                                                                      | 4                                             |
| Money              | `@fairhour/money`: integer minor units as `bigint` (own ADR in phase 2)                                    | n/a                                           |
| Testing            | Vitest + coverage-v8, fast-check, Playwright + @axe-core/playwright, real PostgreSQL for integration tests | Vitest 5, fast-check 4, Playwright 1.64       |
| Docs site          | Starlight on Astro, static output with `base: '/fairhour/'`                                                | Astro 7                                       |
| Desktop            | Tauri with React and Vite                                                                                  | 2                                             |
| Observability      | pino; OpenTelemetry API; Sentry-compatible SDK, inactive without a DSN                                     | n/a                                           |
| Containers         | Multi-stage, non-root image from the Next.js standalone output; GHCR, linux/amd64 + linux/arm64            | n/a                                           |

### Runtime, workspace and tasks

**Node.js 22 LTS** is the baseline, and CI also runs the unit tests on Node 24. The minimum is
**22.18**, the first 22.x release that runs TypeScript files without flags; the repository
scripts depend on it (see [How packages are consumed](#how-packages-are-consumed)). Node 22
reaches end of life on 2027-04-30, and the baseline moves to 24 before then in an ordinary PR.

**pnpm 10 workspaces**, pinned through `packageManager` and enabled with corepack. Its strict
`node_modules` layout catches undeclared dependencies, and it does not run the lifecycle scripts
of dependencies unless they are allow-listed, which closes a common supply-chain attack vector.
**Turborepo 2** runs `build`, `lint`, `typecheck`, `test` and `dev` across packages in dependency
order, with local caching; a remote cache is optional and off by default. Nx does the same job
with much more machinery (generators, plugins, its own project configuration). Plain workspace
scripts have no caching and no affected-only runs. New majors of pnpm or Turborepo arrive as
Renovate PRs with human review and need no new ADR.

### TypeScript 6.0, not TypeScript 7

TypeScript 7, the native port, is the current release and type-checks much faster. We still pin
**TypeScript 6.0.x (`>=6.0 <6.1`)**, because type-aware linting is a core part of our safety net
and typescript-eslint 8.71 declares `typescript >=4.8.4 <6.1.0`: its type-aware rules are built
on the TypeScript compiler API, and it does not support TypeScript 7 yet. Running TypeScript 7 for
`tsc --noEmit` and TypeScript 6 for ESLint was rejected: two compilers that can disagree, two
versions to maintain, and editor feedback that differs from CI. Renovate enforces the cap, and
our configs avoid the compiler options deprecated in 6.0, so that the move to 7 is a dependency
update when it comes.

Every package extends the base config in `@fairhour/config`, which enables `strict`,
`noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` (plus `verbatimModuleSyntax`,
`noImplicitOverride` and related checks).

### Lint, format and repository hygiene

**ESLint 10** flat config, shared from `@fairhour/config`, with typescript-eslint's
`strictTypeChecked` and `stylisticTypeChecked` presets; CI allows zero warnings. The type-aware
rules (floating promises, unsafe `any`, unnecessary conditions, restricted template expressions)
catch the bugs that matter most in money and async code. Biome and oxlint are much faster but do
not yet cover these type-aware rules to the same extent; we will look again as they mature.
**Prettier 3** formats every file, and `eslint-config-prettier` turns off the rules that would
conflict with it. **knip 6** reports unused files, exports and dependencies.

**lefthook** runs lint-staged (Prettier and ESLint on staged files) before each commit, and
**commitlint** checks the commit message (Conventional Commits and a `Signed-off-by` trailer).
CI repeats every check, so hooks give early feedback but are not the gate. **Changesets 3**
versions packages and writes the changelogs.

### How packages are consumed

- **Internal packages are consumed as TypeScript source.** Each package's `exports` points at
  `src/index.ts`; imports are extensionless and resolved with `moduleResolution: "Bundler"`. The
  consumers compile them: Next.js (`transpilePackages`), Vite and Vitest. There is no build step
  in development, no stale `dist`, and "go to definition" lands in real code.
- **Publish-ready libraries** (`money`, `tax-core`, `tax-pack-*`) also build ESM and `.d.ts`
  files with **tsdown**. Their `publishConfig` replaces `exports` with the `dist` entry points at
  publish time, so the workspace keeps using the source while npm consumers get compiled output.
  All packages stay `"private": true` until npm publishing is enabled (see the
  [release process](../maintainers/release-process.md)).
- **Repository automation** (`scripts/github`, `scripts/i18n`) runs directly on Node's built-in
  type stripping: no build step, and no dependencies where possible, so that fast CI jobs such as
  the DCO check run without `pnpm install`. These packages use the `node` tsconfig preset:
  `NodeNext` resolution, explicit `.ts` extensions and `erasableSyntaxOnly` (no enums, namespaces
  or parameter properties).

- **The Turborepo cache sees source changes of dependencies.** Turborepo hashes a task from its
  own package and from the tasks it depends on, not from the sources of the packages it imports.
  `turbo.json` therefore defines an empty `transit` task (`dependsOn: ["^transit"]`) and makes
  `build`, `lint`, `typecheck`, `test` and `test:integration` depend on it. That links every
  package to its dependencies, so editing a library invalidates its dependents, while the tasks
  of different packages still run in parallel. Tasks run in strict environment mode: the
  variables of `.env.example` are passed to `dev`, `build`, `test:integration` and `test:e2e` and
  not to the cached `lint`, `typecheck` and `test`, which keeps unit tests hermetic. Tests in
  `scripts/github` keep `turbo.json` and `.env.example` in sync.

Building every package to `dist` was rejected because it brings watch processes, stale output
and slower feedback. TypeScript project references add configuration that buys little at our
size.

### Web

**Next.js 16 with the App Router and React 19.** Server components keep the report-heavy pages
fast, `output: "standalone"` produces a small server that is easy to self-host, and the React
ecosystem we rely on (Radix, shadcn/ui, next-intl, TanStack Query) and the pool of potential
contributors are the largest available. We use only features that work in the self-hosted
Node.js server, never ones that need Vercel's platform. React Router 7 was the closest
alternative; SvelteKit has a smaller ecosystem of accessible components; TanStack Start is
promising but has a much shorter production track record.

**Tailwind CSS 4** with CSS-first configuration (`@theme` tokens shared from `@fairhour/config`)
and **shadcn/ui** components copied into `packages/ui`, built on **Radix** primitives for correct
keyboard and screen-reader behaviour. We own the component code, so there is no lock-in to a UI
kit, unlike MUI or Mantine. **TanStack Query 5** is used only where client-side caching is needed
(through tRPC's integration); server components fetch directly otherwise. **next-intl 4** handles
ICU messages, with `en` as the source locale and `it` as the first translation. **Recharts 3**
draws the report charts.

### API

**tRPC 11** serves the web app and the desktop companion: end-to-end types, zod-validated inputs
and no code generation. tRPC procedures are an internal contract and may change in any release.
Third parties get a versioned **public REST API** (`/api/v1`) described by **OpenAPI 3.1**,
generated from the same zod schemas; the generator is chosen in phase 7 (API-002) with its own
ADR. GraphQL was rejected: its schema tooling, resolver complexity and heavier clients bring no
benefit over tRPC internally and plain REST externally.

### Data

**PostgreSQL** is the only supported database, with **16** as the minimum version; CI and
`docker compose` run 16. It is transactional, widely offered by managed providers and Linux
distributions, and good at the reporting queries we need.

**Drizzle ORM 0.45 with drizzle-kit 0.31.** The schema is TypeScript, queries are typed, the SQL
stays visible, and migrations are generated, reviewed and committed as SQL (forward-only). Its
runtime is a thin layer with no separate query engine. Prisma was rejected for its separate schema
language, generated client and heavier runtime. Kysely is an excellent query builder but has no
schema-driven migrations. The driver is **postgres.js**: pure JavaScript, no native bindings.
Drizzle 1.0 is in release candidate; we start on the stable 0.45 line and plan the upgrade once
1.0 is final.

### Authentication

**Better Auth 1.7** with **database sessions** stored in PostgreSQL through the Drizzle adapter:
sessions are revocable and auditable, and users, accounts and sessions are ordinary tables in our
schema and migrations. Magic links and passkeys come from first-party plugins, Google and GitHub
sign-in from built-in providers (enabled only when configured), all with complete TypeScript
types. Auth.js was the main alternative; Better Auth treats database sessions, plugins and types
as first-class features where Auth.js needs more glue, and since September 2025 Auth.js has been
maintained by the Better Auth team, who recommend Better Auth for new projects. Hosted identity
providers were rejected because they break self-hosting. Writing our own was rejected:
authentication is security-critical and is not where Fairhour adds value.

### Validation and money

**zod 4** validates every boundary: HTTP input, environment variables, configuration files, tax
pack configuration, and database rows mapped to domain types. The same schemas drive tRPC inputs,
forms and the OpenAPI document.

**Money is never a float.** `@fairhour/money`, our own small MIT library, represents amounts as
`bigint` integer minor units with an ISO 4217 currency, and rates and quantities as exact
decimals parsed from strings; every rounding names its mode explicitly. Its design gets its own
ADR in phase 2 (CORE-002).

### Testing

**Vitest 5** with v8 coverage and per-package thresholds (at least 95% for `money`, `core` and
the tax packages). **fast-check 4** for property-based tests of money, rounding and tax
invariants. **Playwright 1.64** with **@axe-core/playwright** for end-to-end tests on desktop and
mobile viewports, with accessibility checks. Integration tests (`*.int.test.ts`) run against a
**real PostgreSQL 16** (a service container in CI), because tenant isolation, constraints and
migrations cannot be verified against mocks. Jest was rejected for its friction with ESM and
TypeScript, Cypress for weaker multi-browser and parallel support.

### Documentation site

**Starlight on Astro 7** in `apps/docs`: static output with `base: '/fairhour/'` for GitHub
Pages, built-in full-text search (Pagefind), built-in i18n, and Markdown/MDX content that people
who are not developers can edit. Fumadocs and Nextra are built around Next.js: exporting them as
static sites under a base path needs more configuration, and they pay off when the docs live
inside a Next.js app, which ours deliberately do not. Docusaurus is heavier than we need.

### Desktop companion

**Tauri 2 with React and Vite.** Small binaries that use the system WebView, a Rust backend for
OS integration (idle time, frontmost application), and a capability-based permission model. The
UI reuses `packages/ui`, `core` and `money` from source. Electron was rejected for its bundle size
and memory use (a full Chromium per app) and its larger attack surface. A native app per OS would
triple the work.

### Observability and containers

**pino** writes structured JSON logs with redaction (no PII, no secrets). The server calls the
**OpenTelemetry API**, so operators can attach an SDK and an exporter. Error reporting uses a
**Sentry-compatible SDK** that stays inactive without a DSN and also works with self-hosted,
Sentry-compatible services. Nothing leaves an instance unless its operator configures it.

The production image is **multi-stage**, runs as a **non-root** user and contains only the
Next.js **standalone output**. It is published to **GHCR** for linux/amd64 and linux/arm64, with
an SBOM and build provenance.

## Consequences

### Positive

- One language and one type system from the database schema to the UI; tax packs run unchanged
  on the server, in the browser and in the desktop app.
- Strict compiler flags and type-aware lint rules eliminate whole classes of bugs (unchecked
  indexing, `undefined` versus a missing property, floating promises) before review.
- Source-consumed packages and type-stripped scripts mean almost no build steps in development,
  and cheap CI jobs for repository automation.
- Self-hosting is one image plus PostgreSQL, with no telemetry by default.
- Mainstream, well-documented tools make onboarding easier, give better answers from search and
  AI assistants, and fit Renovate's grouped updates.

### Negative

- Staying on TypeScript 6 gives up TypeScript 7's type-checking speed. Type checking also grows
  with the codebase, because each package checks the source of the packages it imports.
- Several dependencies are still below 1.0 (Drizzle 0.45 with 1.0 in release candidate, tsdown
  0.23, Starlight 0.42), so minor releases can break. Renovate groups them and majors need human
  review; the Drizzle 1.0 upgrade is planned work.
- Next.js, Turborepo and Better Auth (acquired by Vercel in July 2026) now share one corporate
  steward. We mitigate this by relying on permissive licenses, avoiding Vercel-only platform
  features, and keeping Turborepo's remote cache optional.
- The App Router's server/client boundaries and caching rules raise the bar for contributors, so
  `apps/web` needs documented patterns.
- Two API surfaces, tRPC and REST, must stay consistent. They share zod schemas and the service
  layer, and only REST is versioned.
- Every consumer of an internal package must compile TypeScript, and publish-ready libraries have
  a second, published shape (`publishConfig`) that must be verified before npm publishing is
  enabled.
- `bigint` amounts are not JSON-serializable, so every boundary encodes them explicitly (as
  zod-validated strings).
- Tauri needs a Rust toolchain in CI and for desktop contributors, and the system WebViews
  differ (WebKitGTK, WKWebView, WebView2), so the desktop UI has to be tested on all three.
- PostgreSQL 16 as the minimum rules out newer server features (for example the native `uuidv7()`
  of PostgreSQL 18) until the minimum is raised.
- Recharts does not provide text alternatives for charts; report pages must add them.

### Revisit when

- typescript-eslint, or a type-aware linter covering the same rules, supports TypeScript 7: lift
  the Renovate cap and upgrade.
- Node 22 approaches its end of life (2027-04-30): raise the baseline to 24.
- Drizzle 1.0 is released: plan the upgrade.
- A choice here blocks a feature or stops being maintained: write an ADR that supersedes the
  affected section.

## Compliance and enforcement

- **Versions:** `packageManager` and `engines.node` in the root `package.json` (the engines
  range must start at `>=22.18.0`), `.nvmrc`, the CI matrix (Node 22 and 24) and the committed
  lockfile.
- **Renovate** ([`renovate.json`](../../renovate.json)): `typescript` is capped with
  `allowedVersions: "<6.1.0"` and a reference to this ADR; `lint-staged` is capped below 17,
  which requires Node 22.22.1 or later while the floor is 22.18; toolchains are grouped (lint,
  test, Next.js and React, Drizzle, Tauri, docs site); major updates need human review.
- **Shared presets:** `@fairhour/config` holds the tsconfig, ESLint, Prettier, tsdown and
  Tailwind presets. Packages extend them instead of redefining rules.
- **CI:** `pnpm lint` (ESLint with `--max-warnings=0`, then `prettier --check`), `pnpm typecheck`,
  `pnpm test` with coverage thresholds, integration tests against PostgreSQL, end-to-end tests
  with axe, and `pnpm knip`; the PR title and DCO workflows. lefthook gives the same feedback
  locally, earlier.
- **Documented conventions:** [`CLAUDE.md`](../../CLAUDE.md),
  [`CONTRIBUTING.md`](../../CONTRIBUTING.md) and `.claude/agents/*` restate the conventions that
  follow from this ADR. A PR that changes one of these choices updates them and adds an ADR that
  supersedes the affected section of this one.
- **New dependencies:** a new runtime dependency needs a reason in its PR, and an ADR when it has
  a large footprint or introduces a new architectural pattern
  ([GOVERNANCE.md](../../GOVERNANCE.md#decision-making)).

## Links

- [ADR-0002: Licensing](0002-licensing.md)
- [`CLAUDE.md`](../../CLAUDE.md), [`CONTRIBUTING.md`](../../CONTRIBUTING.md),
  [`PROGRESS.md`](../../PROGRESS.md), [release process](../maintainers/release-process.md)
- typescript-eslint, supported dependency versions:
  <https://typescript-eslint.io/users/dependency-versions>
- Node.js, running TypeScript natively: <https://nodejs.org/api/typescript.html>
- Node.js release schedule: <https://github.com/nodejs/release#release-schedule>
- Auth.js is now part of Better Auth (2025-09-22):
  <https://www.better-auth.com/blog/authjs-joins-better-auth>
- Better Auth joins Vercel (2026-07): <https://better-auth.com/blog/better-auth-joins-vercel>
- Starlight: <https://starlight.astro.build/>
- Tauri 2: <https://v2.tauri.app/>
