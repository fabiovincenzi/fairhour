# Repository settings to configure by hand

Some settings cannot be expressed as code. Configure them once in the GitHub UI (or with `gh`).

## General

- **Features**: enable Issues and Discussions (categories: Announcements, Q&A, Ideas, Show and
  tell, Tax packs). Disable Wikis (docs live in the repo).
- **Pull requests**: allow **squash merging** only, default message "Pull request title and
  description"; enable "Always suggest updating pull request branches", "Allow auto-merge" (used
  by Renovate) and "Automatically delete head branches".

## Branch protection / ruleset for `main`

Create a ruleset targeting the default branch:

- Require a pull request before merging, **1 approval**, dismiss stale approvals, require review
  from Code Owners, require conversation resolution.
- Require status checks to pass, with the branch up to date:
  - `CI OK` (from `ci.yml`, aggregates lint, typecheck, unit, integration, e2e, build)
  - `DCO sign-off` (`dco.yml`)
  - `Conventional Commit title` (`pr-title.yml`)
  - `Review dependency changes` (`dependency-review.yml`)
  - `Analyze (javascript-typescript)` (`codeql.yml`)
- Require linear history; block force pushes and deletions.
- Optionally enable the merge queue (all workflows above also run on `merge_group`).

## GitHub Pages

Settings → Pages → Build and deployment → Source: **GitHub Actions**. The `docs.yml` workflow
deploys `apps/docs` to `https://fabiovincenzi.github.io/fairhour/`. For a custom domain later,
set it here and change `site`/`base` in `apps/docs/astro.config.mjs`.

## Code security

- Enable **Private vulnerability reporting** (required by SECURITY.md).
- Enable **Dependency graph**, **Dependabot alerts** (Renovate opens the update PRs; do not
  enable Dependabot version updates), **Secret scanning** and **Push protection**.
- Code scanning is configured by `codeql.yml` (use "Advanced" setup, not default setup).

## Actions

- Settings → Actions → General: "Allow GitHub Actions to create and approve pull requests"
  must be **enabled** for the Changesets version PR.
- Workflow permissions: **Read repository contents** (workflows request more per job).
- Install the [Renovate GitHub App](https://github.com/apps/renovate) for this repository.

## Secrets and variables (all optional)

| Name | Kind | Used by | Purpose |
|---|---|---|---|
| `CODECOV_TOKEN` | secret | `ci.yml` | Upload coverage; skipped when absent |
| `NPM_TOKEN` | secret | `release.yml` | Publish non-private `@fairhour/*` libraries; skipped when absent |
| `PROJECT_TOKEN` | secret | `add-to-project.yml` | PAT with `project` scope for the roadmap board |
| `PROJECT_URL` | variable | `add-to-project.yml` | URL of the Projects v2 board |
| `APPLE_*`, `WINDOWS_*`, `TAURI_SIGNING_*` | secrets | `desktop-release.yml` | Desktop code signing (see release-process.md) |

`GITHUB_TOKEN` covers everything else (backlog sync, labels, releases, GHCR images).

## Environments

- `github-pages`: created automatically by the docs deployment. Restrict deployments to `main`.
