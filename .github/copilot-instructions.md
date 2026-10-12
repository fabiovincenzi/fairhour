# Copilot instructions

Fairhour is an open-source, self-hostable time tracker that turns tracked time into the exact
amounts to put on an invoice through pluggable, country-specific tax packs.

Follow [AGENTS.md](../AGENTS.md) (how to pick, claim, build and deliver an issue without
colliding with other agents) and [CLAUDE.md](../CLAUDE.md) (repo map, commands, conventions,
definition of done, hard rules). The essentials:

- pnpm workspaces + Turborepo, TypeScript strict (`noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`), no `any`. Node ≥ 22.18.
- Money is never a float: use `@fairhour/money` (`bigint` minor units, explicit rounding).
- zod at every boundary. Timestamps stored in UTC.
- Every query is scoped by `workspaceId`; every new table or route gets a tenant-isolation test.
- UI copy goes through next-intl (`en` source, `it` required). No hard-coded strings.
- Anything under `packages/tax-*` follows `packages/tax-core/CLAUDE.md`: pure functions,
  versioned parameters, legal sources cited in code and in `docs/tax-packs/<country>.md`.
- Change only the files the issue lists under "Files:". Write tests with the code; never weaken
  a test.
- Before opening the PR: `pnpm lint && pnpm typecheck && pnpm test` (plus `test:integration`
  for db/api). Mark the backlog item `state: done`, add a changeset for package changes.
- Conventional Commits, every commit signed off (`git commit -s`), PR body with
  `Closes #<issue>` and the sections of `.github/pull_request_template.md`.
