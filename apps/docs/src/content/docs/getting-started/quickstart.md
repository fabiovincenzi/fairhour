---
title: Quickstart
description: Set up a development environment and run Fairhour's tooling locally.
sidebar:
  order: 2
---

This page gets a development environment running. To run Fairhour for real, see
[self-hosting](/fairhour/self-hosting/) (coming in v0.8).

## Requirements

- **Node.js 22.18 or newer.** The repository's scripts rely on Node's built-in TypeScript support.
  The exact version is in `.nvmrc`.
- **pnpm 10**, through corepack (it ships with Node): `corepack enable`.
- **Docker**, for PostgreSQL and Mailpit.
- Optionally **Rust** (stable), only for the desktop app (coming in v0.9).

## Set up

```bash
git clone https://github.com/fabiovincenzi/fairhour.git
cd fairhour
corepack enable
pnpm install            # also installs the git hooks (lefthook)
cp .env.example .env    # the defaults work with the compose file below
docker compose up -d    # PostgreSQL on :5432 and Mailpit on :8025
pnpm db:migrate && pnpm db:seed
pnpm dev
```

:::note[What works today]
The web app arrives in v0.4 and the database in v0.3. Until then `pnpm db:migrate` and
`pnpm db:seed` do nothing, and `pnpm dev` starts the documentation site you are reading, at
`http://localhost:4321/fairhour/`.
:::

`docker compose up -d` starts the local services from `docker-compose.yml`: PostgreSQL 16 (user,
password and database are all `fairhour`; `fairhour_test` and `fairhour_e2e` are created for the
tests) and [Mailpit](https://mailpit.axllent.org/), which catches every outgoing email, such as
sign-in links, at `http://localhost:8025`. These credentials are for local development only.

## The `.env` file

`.env.example` documents every variable and is safe to copy as it is for development. For a real
instance you must at least replace the placeholder secrets (`BETTER_AUTH_SECRET`,
`SHARE_LINK_SECRET`) and set `APP_URL`. The
[environment variable reference](/fairhour/self-hosting/environment-variables/) is generated from the
same file.

## Everyday commands

Run them from the repository root.

| Command                     | What it does                                                  |
| --------------------------- | ------------------------------------------------------------- |
| `pnpm dev`                  | Starts every app in development mode                          |
| `pnpm build`                | Builds everything (Turborepo)                                 |
| `pnpm lint` / `pnpm format` | ESLint (strict type-checked) with Prettier: check and fix     |
| `pnpm typecheck`            | `tsc --noEmit` in every package                               |
| `pnpm test`                 | Unit tests (Vitest) with coverage thresholds                  |
| `pnpm test:integration`     | Integration tests against PostgreSQL (`DATABASE_URL`)         |
| `pnpm test:e2e`             | Playwright end-to-end tests on desktop and mobile, with axe   |
| `pnpm i18n:check`           | Every locale has every English key                            |
| `pnpm knip`                 | Finds unused files, exports and dependencies                  |
| `pnpm license:check`        | MIT packages depend only on MIT or permissive code (ADR-0002) |
| `pnpm --filter <pkg> <cmd>` | Runs one script in one package, for example `@fairhour/docs`  |

## Work on this documentation

The site you are reading is the package `@fairhour/docs` (Starlight on Astro).

```bash
pnpm --filter @fairhour/docs dev      # http://localhost:4321/fairhour/
pnpm --filter @fairhour/docs build    # static site in apps/docs/dist
pnpm --filter @fairhour/docs preview  # serve the build
```

Pages you write by hand live in `apps/docs/src/content/docs/`. Pages such as the ADRs, the design
documents, the tax pack documentation, the maintainer handbook, `CONTRIBUTING.md`, `GOVERNANCE.md`
and `SECURITY.md` are **copied from the repository** (`docs/`, and the root files) before every
build, and the environment variable reference is generated from `.env.example`. Edit them at their
source: every page has an "Edit page" link that points there.

When you link from one hand-written page to another, use the absolute path with the site's base,
for example `/fairhour/guides/time-tracking/`. The build checks every internal link, anchor
included, and fails on a broken or relative one.

## Next steps

- Read the [contributing guide](/fairhour/contributing/guide/) for the workflow, commit
  conventions and the DCO sign-off.
- Add your country with a [tax pack](/fairhour/tax-packs/) or your language with the
  [translation guide](/fairhour/contributing/translations/).
