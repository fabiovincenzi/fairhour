---
description: Verify that the repository is releasable (green CI, changesets, docs, PROGRESS.md).
---

Check whether Fairhour can be released right now. Do not change anything; report.

1. **CI**: latest `main` run of `ci.yml` is green (`gh run list --workflow ci.yml --branch main -L 1`
   or the GitHub MCP tools). Locally: `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
2. **Changesets**: `pnpm changeset status --since=origin/main` lists the expected bumps; every
   changed package with user-facing changes has one.
3. **Docs**: the docs site builds (`pnpm --filter @fairhour/docs build`); `CHANGELOG.md` files,
   self-hosting guide and env var reference match the code (`.env.example`).
4. **Migrations**: `pnpm db:generate` produces no new migration (schema and migrations in sync).
5. **i18n**: `pnpm i18n:check` passes.
6. **Workflows**: `actionlint` is clean.
7. **Housekeeping**: `PROGRESS.md` is current, no open `P0` issues, `SECURITY.md` supported
   versions are up to date.
8. Output a checklist with ✅/❌ per item and the exact command to fix each ❌.
