# Release process

Fairhour uses [Changesets](https://github.com/changesets/changesets) for versioning and
changelogs. Every package and app is versioned independently; the web app version is the
version of the Docker image.

## 1. While developing

Every PR with a user-facing change to a package or app adds a changeset:

```bash
pnpm changeset          # pick packages, bump type, write a short user-facing summary
```

Docs-only, test-only and CI-only changes do not need one.

## 2. The "Version packages" PR

On every push to `main`, `.github/workflows/release.yml` runs `changesets/action`:

- if there are pending changesets, it opens or updates a PR titled
  `chore(release): version packages` that bumps versions and writes `CHANGELOG.md` files;
- when that PR is merged, it runs `pnpm release:publish`, which creates git tags
  (`@fairhour/web@0.8.0`, …) and GitHub Releases with the changelog.

Review the version PR like any other: check bump types (pre-1.0, breaking changes are `minor`)
and the changelog wording.

## 3. Artifacts built from a release

| Released package | Artifact | Workflow |
|---|---|---|
| `@fairhour/web` | `ghcr.io/fabiovincenzi/fairhour:<version>`, `:<major>.<minor>`, `:latest` for linux/amd64 + linux/arm64, SPDX SBOM attached to the release, build provenance | `docker.yml` (called by `release.yml`) |
| `@fairhour/desktop` | macOS (arm64, x64), Windows, Linux bundles attached to the release | `desktop-release.yml` (called by `release.yml`) |
| `@fairhour/money`, `@fairhour/tax-core`, `@fairhour/tax-pack-*` | npm packages (**disabled by default**) | `release.yml` |

A manual run of `docker.yml` publishes an `edge` image from the selected branch.

## 4. npm publishing (disabled by default)

All packages are `"private": true`. To publish a library:

1. Remove `"private": true` from its `package.json` (the exports map, types and README are ready).
2. Add the `NPM_TOKEN` repository secret (an npm automation token for the `@fairhour` scope).
3. The next release publishes it with npm provenance. Without `NPM_TOKEN`, releases only create
   tags and GitHub Releases.

## 5. Dry run

Before the first real release, or after changing the pipeline:

```bash
pnpm changeset status --verbose          # what would be released
pnpm release:version                     # apply versions locally (do not commit)
git diff --stat && git checkout -- .     # inspect, then discard
docker build -t fairhour:dry-run .       # the production image builds
```

## Desktop signing

Desktop bundles are unsigned unless these secrets exist (see `desktop-release.yml`):

- macOS: `APPLE_CERTIFICATE` (base64 .p12), `APPLE_CERTIFICATE_PASSWORD`,
  `APPLE_SIGNING_IDENTITY`, and for notarization `APPLE_ID`, `APPLE_PASSWORD` (app-specific
  password), `APPLE_TEAM_ID`.
- Windows: Authenticode certificate configured in `tauri.conf.json` plus `WINDOWS_CERTIFICATE`,
  `WINDOWS_CERTIFICATE_PASSWORD`.
- Updater: `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
  (`pnpm tauri signer generate`).

## Versioning policy

- Pre-1.0: `minor` for new features and breaking changes, `patch` for fixes.
- After 1.0: semantic versioning. Database migrations are always forward-only and run on boot
  when `MIGRATE_ON_BOOT=true`.
- Tax pack parameter updates (new rates, thresholds) are `minor` releases of the pack.
