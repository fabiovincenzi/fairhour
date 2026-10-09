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
- Toolchain pins: Node 22 (`.nvmrc`), pnpm 10.28.0, TypeScript 6.0.x (typescript-eslint does not
  support TypeScript 7 yet; see ADR-0001).

## Phase status

| Phase                      | Status  |
| -------------------------- | ------- |
| 0. Project bootstrap       | ✅ done |
| 1. Foundation              | ⏳ next |
| 2. Core + tax engine       | ⬜      |
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

## Next

Phase 1 (Foundation, FND-001 … FND-008): Turborepo, `@fairhour/config` (tsconfig, eslint flat
config strict-type-checked, prettier, tailwind preset), lefthook + commitlint, knip, changesets,
`docker-compose.yml` (Postgres + Mailpit) and `.env.example`, Starlight docs site with base
`/fairhour/`, ADR-0001 (stack) and ADR-0002 (licensing). Switch root scripts to turbo.

## Known issues

- Root scripts use `pnpm -r --if-present` until Turborepo lands in phase 1.
- `docs/contributing/tax-packs.md` and `docs/contributing/translations.md` are linked from
  CONTRIBUTING.md and are written in phases 2 and 4.

## How to resume

```bash
pnpm install
pnpm typecheck && pnpm test && pnpm backlog:validate
actionlint
```

Then run `/resume` (or read the "Next" section above) and follow the delegation policy in `CLAUDE.md`.
