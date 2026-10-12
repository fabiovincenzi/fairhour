# Progress

This file is the hand-off between Claude Code sessions (and humans). Keep it current at the end
of every phase. Resume with `/resume`; to work in parallel with other agents, see
[AGENTS.md](AGENTS.md) and [docs/maintainers/ai-agents.md](docs/maintainers/ai-agents.md).

## Environment notes (session of 2026-10-09)

- **GitHub CLI**: `gh` is installed but **not authenticated** in the build environment (the
  provided token is invalid). Therefore the backlog was **not** synced from the session: commits
  reference backlog IDs (`Refs CORE-012`) and `.github/workflows/sync-backlog.yml` creates the
  labels, milestones and issues on the first push to `main` after merge.
- Docker daemon is not available in the build environment; integration tests run against a
  local PostgreSQL 16 (`DATABASE_URL`). CI uses a Postgres service container.
- Rust stable is available (for `cargo check` of the desktop app).
- Toolchain pins: Node ≥ 22.18 (`.nvmrc` 22; native type stripping), pnpm 10.28.0, TypeScript
  6.0.x (typescript-eslint does not support TypeScript 7 yet; see ADR-0001), lint-staged 16.x
  (17.x requires Node ≥ 22.22.1).
- **Subagents**: `.claude/agents/*` are loaded when a session starts. This session created them
  mid-run, so it emulated each one with a general-purpose agent running the same definition and
  model. Fresh sessions get the real agent types.
- **Review timing**: cloud sessions have a stop hook that requires work to be committed and
  pushed before a turn ends, so verified work is committed first and the `reviewer` reviews the
  commit range afterwards; its findings land as follow-up commits, and a phase is only closed
  once the reviewer approves.
- **Usage limits**: on 2026-10-12 the weekly limit for subagents was reached (reset 2026-10-14
  01:00 UTC). To keep going meanwhile, the remaining work was split into small backlog items that
  any agent can take in parallel (see "Next").

## Phase status

| Phase                      | Status                               |
| -------------------------- | ------------------------------------ |
| 0. Project bootstrap       | ✅ done                              |
| 1. Foundation              | ✅ done                              |
| 2. Core + tax engine       | ✅ done (review follow-ups: REV-001) |
| 3. Data & auth             | ⏳ next                              |
| 4. Web MVP                 | ⬜                                   |
| 5. Reports                 | ⬜                                   |
| 6. Hardening               | ⬜                                   |
| 7. Public API & webhooks   | ⬜                                   |
| 8. Self-hosting & releases | ⬜                                   |
| 9. Desktop companion       | ⬜                                   |
| 10. FatturaPA XML          | ⬜                                   |
| 11. Launch polish          | ⬜                                   |

## Done

### Phase 0: project bootstrap (BOOT-001 … BOOT-009)

- AI development setup: `CLAUDE.md` (delegation policy), `.claude/agents/*` (architect,
  implementer, test-writer, reviewer, explorer, i18n, triage), `.claude/commands/*` (/next-issue,
  /implement-issue, /resume, /review-pr, /new-tax-pack, /release-check), `.claude/settings.json`,
  nested `CLAUDE.md` in `packages/tax-core` and `packages/tax-pack-template`.
- Governance: AGPL-3.0 `LICENSE`, README, CONTRIBUTING, CODE_OF_CONDUCT (Contributor Covenant
  2.1), SECURITY, GOVERNANCE, SUPPORT, MAINTAINERS, CODEOWNERS, FUNDING (placeholder),
  all-contributors config.
- Backlog as code: `.github/labels.yml` (44 labels), `.github/milestones.yml` (11 milestones),
  `.github/backlog/*.yml` (115 items, 13 epics, 20 good first issues).
- `scripts/github`: tested TypeScript (Node native type stripping, no build step) for the
  idempotent backlog sync (marker `<!-- backlog-id: X -->`, hash-based detection of manual edits,
  never duplicates, never reopens) and the DCO check. `scripts/i18n`: locale completeness check.
- Templates: 5 issue forms + `config.yml`, PR template.
- Workflows (all SHA-pinned, least privilege, actionlint clean): `ci`, `pr-title`, `labeler`,
  `dco`, `welcome`, `stale`, `lock`, `sync-backlog`, `add-to-project`, `release`, `docker`,
  `desktop-release`, `docs`, `codeql`, `dependency-review`, `scorecard`, `i18n`; Renovate config.
- Maintainer docs in `docs/maintainers/`.

### Phase 1: foundation (FND-001 … FND-008)

- Turborepo (with a `transit` task so source-consumed packages invalidate dependents' caches),
  `@fairhour/config` (strict tsconfig presets, ESLint flat config with strict-type-checked plus
  the opt-in `mitLibrary` and `moneySafety` guards, Prettier, tsdown helper, Tailwind v4 theme
  with WCAG contrast tests), lefthook + lint-staged + commitlint (Conventional Commits and DCO),
  knip, Changesets (`release:publish` tags only unless `NPM_PUBLISH_ENABLED=true`),
  `license:check` (ADR-0002 boundary), `docker-compose.yml` (Postgres 16 + Mailpit) and a
  documented `.env.example` kept in sync with turbo's env pass-through by a test.
- Starlight docs site (`apps/docs`, base `/fairhour/`, en + it) that syncs `docs/**` and the
  root community files, with a link validator and a generated environment-variable reference.
- ADR-0001 (stack), ADR-0002 (licensing: AGPL apps, MIT money/tax libraries, CC BY 4.0 docs),
  and, ahead of phase 2, ADR-0003 (money), ADR-0004 (tax engine) with
  `docs/design/tax-engine.md`, `docs/tax-packs/it.md` and `docs/tax-packs/generic.md`.

### Phase 2: core + tax engine (CORE-001 … CORE-009, TAX-001 … TAX-011)

- `@fairhour/money` (MIT): `bigint` minor units, exact `Decimal` and `Price`, ISO 4217
  currencies, explicit rounding modes, allocation, locale formatting (ADR-0003).
- `@fairhour/core`: DST-safe time math, rounding of durations, overlaps, rate resolution,
  budgets, effective rate, the natural-language quick-add parser (en, it), and invoice drafts
  built from time entries (CORE-009).
- `@fairhour/tax-core` (MIT): the `TaxPack` contract, the rule pipeline with versioned
  parameters, explanation trace, reconciliation identities, JSON snapshots and the shared
  conformance suite (ADR-0004).
- Packs (MIT): `tax-pack-it` (forfettario and ordinario: INPS/cassa contributions, VAT,
  withholding, stamp duty, split payment, golden fixtures), `tax-pack-generic` (configurable
  VAT/no-VAT for any country, EU reverse charge) and `tax-pack-template` with the contributor
  guide `docs/contributing/tax-packs.md`.
- Lint guards for purity and money safety in the MIT packages; the i18n check validates ICU
  syntax with FormatJS.
- Reviews: tax-pack-it and the money/generic follow-ups approved; the remaining findings (one
  major in `computationFromJson`, one in the i18n check) and the reviews still to do (template,
  CORE-009) are tracked as REV-002 … REV-013.

### Parallel work setup

- The backlog for phases 3–5 is split contract-first into small items, each with the files it
  owns; `ready`/`blocked` are derived from dependencies (`pnpm backlog:status`).
- `AGENTS.md` is the playbook for any agent (pick, claim, lanes, verify, deliver);
  `.github/copilot-instructions.md`, `/next-issue` and `/implement-issue` follow it.
- `claude.yml` (@claude, label `agent: claude`) and the opt-in `autopilot.yml`.

## Next

Merge this branch to `main` so `sync-backlog` creates the issues, then run agents in parallel
as described in `docs/maintainers/ai-agents.md`. `pnpm backlog:status` lists what can start
now; the first wave is:

- Phase 3 foundations: DATA-011 data model design and ADR-0006 (`architect`), DATA-012
  `packages/db` scaffold, DATA-017 `packages/api` scaffold.
- Phase 4 foundation: UI-001 `packages/ui`.
- Independent libraries: REP-004 PDF timesheet, REP-005 CSV.
- Phase 2 follow-ups REV-002 … REV-012 (REV-002 first: it is the one major finding); FPA-002
  FatturaPA (`architect`) follows REV-005 in `tax-pack-it`.

## Known issues

- The Italian tax research could not fetch statutes directly (network policy): points are graded
  [O]fficial / [S]econdary / [TBV] in `docs/tax-packs/it.md` §14. A maintainer should read the
  statutes on Normattiva and upgrade the grades before a release.
- `undici@8` (docs build only, via astro) declares Node ≥ 22.19 while the repo floor is 22.18;
  CI uses the latest 22.x. Revisit if someone builds the docs on 22.18.
- `license:check` checks direct dependencies of MIT packages, not transitive ones (ADR-0002 follow-up).
- Quick add (CORE-008): in `en`, a range with am/pm on one end only (`1-2pm`) reads the other end
  on the 24-hour clock (13 h); two bare numbers (`3-4`) are read as a time range, with an
  `assumed-time-range` warning, unless a duration is also given.

## How to resume

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm knip && pnpm license:check
pnpm backlog:validate && pnpm i18n:check && actionlint
```

Then run `/resume` (or read the "Next" section above) and follow the delegation policy in `CLAUDE.md`.
