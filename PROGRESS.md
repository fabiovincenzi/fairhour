# Progress

This file is the hand-off between Claude Code sessions (and humans). Keep it current at the end
of every phase. Resume with `/resume`.

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

## Phase status

| Phase                      | Status  |
| -------------------------- | ------- |
| 0. Project bootstrap       | ✅ done |
| 1. Foundation              | ✅ done |
| 2. Core + tax engine       | ⏳ next |
| 3. Data & auth             | ⬜      |
| 4. Web MVP                 | ⬜      |
| 5. Reports                 | ⬜      |
| 6. Hardening               | ⬜      |
| 7. Public API & webhooks   | ⬜      |
| 8. Self-hosting & releases | ⬜      |
| 9. Desktop companion       | ⬜      |
| 10. FatturaPA XML          | ⬜      |
| 11. Launch polish          | ⬜      |

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

## Next

Phase 2 (Core + tax engine), following the waves in `docs/design/tax-engine.md` §9:

- Wave A: `@fairhour/money` (CORE-002) and `tax-core` types/schemas (TAX-002) — `architect`;
  `@fairhour/core` time math, overlaps, quick-add (CORE-003, CORE-004, CORE-008) — `implementer`.
- Wave B: `tax-core` engine, formatting, JSON, conformance suite (TAX-002, TAX-003, TAX-011);
  rates, budgets, effective rate (CORE-005..007).
- Wave C: `tax-pack-it` (TAX-004..007), `tax-pack-generic` (TAX-008), `tax-pack-template` and
  `docs/contributing/tax-packs.md` (TAX-009), the core → engine bridge (CORE-009), tax docs
  review (TAX-010).

## Known issues

- `docs/contributing/tax-packs.md` is linked from CONTRIBUTING.md and is written in phase 2 (TAX-009).
- The Italian tax research could not fetch statutes directly (network policy): points are graded
  [O]fficial / [S]econdary / [TBV] in `docs/tax-packs/it.md` §14. A maintainer should read the
  statutes on Normattiva and upgrade the grades before a release.
- `undici@8` (docs build only, via astro) declares Node ≥ 22.19 while the repo floor is 22.18;
  CI uses the latest 22.x. Revisit if someone builds the docs on 22.18.
- `license:check` checks direct dependencies of MIT packages, not transitive ones (ADR-0002 follow-up).

## How to resume

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm knip && pnpm license:check
pnpm backlog:validate && pnpm i18n:check && actionlint
```

Then run `/resume` (or read the "Next" section above) and follow the delegation policy in `CLAUDE.md`.
