# Changesets

Fairhour uses [Changesets](https://github.com/changesets/changesets) for versioning, changelogs and
release tags. The full process is in [`docs/maintainers/release-process.md`](../docs/maintainers/release-process.md).

## Adding a changeset

Every PR with a user-facing change to a package or app needs one:

```bash
pnpm changeset            # pick the packages, the bump type and write a short summary
```

- Pre-1.0: `minor` for new features and breaking changes, `patch` for fixes.
- Docs-only, test-only and CI-only changes do not need a changeset (`pnpm changeset --empty` if a
  check asks for one).
- Write the summary for the people who read the changelog, not for reviewers.

## What is not released

The tooling packages and the documentation site are listed under `ignore` in
[`config.json`](./config.json): `@fairhour/config`, `@fairhour/docs`, `@fairhour/github-scripts` and
`@fairhour/i18n-scripts`. They are never versioned or tagged, so they stay out of changelogs and
GitHub Releases. Add every new internal-only package to that list.

Because of that, **a changeset must not mix ignored and released packages**: Changesets rejects it
("Mixed changesets..."). Write two changesets, or leave the ignored package out.

## Releasing

`pnpm release:version` (run by the release workflow, which opens the "Version packages" PR)
needs a `GITHUB_TOKEN`, because `@changesets/changelog-github` looks up PR and author links. To try
it locally, do it on a throwaway branch: `GITHUB_TOKEN=$(gh auth token) pnpm release:version`.

`pnpm release:publish` runs `changeset publish` when `NPM_PUBLISH_ENABLED=true` (the workflow sets
it when the `NPM_TOKEN` secret exists) and `changeset git-tag` otherwise, which only creates the git
tags. Preview what it would run with `pnpm release:publish --dry-run`.
