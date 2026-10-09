# Backlog as code

Every planned piece of work is defined here as YAML and synced to GitHub issues by
`.github/workflows/sync-backlog.yml` (script: `scripts/github/src/sync-backlog.ts`).

```yaml
milestone: "v0.2 Core & Tax Engine"   # default milestone for the items in this file
items:
  - id: CORE-012                       # stable, unique, never renamed
    title: "Rate resolution: task > project > client > workspace"
    type: feature                      # bug | feature | docs | chore | refactor | security | epic
    areas: [core]                      # → "area: core" (see .github/labels.yml)
    priority: P1                       # P0..P3
    size: M                            # S | M | L | XL
    status: ready                      # triage | ready | blocked | in-progress
    labels: ["good first issue"]       # optional extra labels
    milestone: "v0.4 Web MVP"          # optional, overrides the file default
    state: done                        # optional: open (default) | done
    depends_on: [CORE-002]             # optional
    children: [CORE-013, CORE-014]     # epics only: rendered as a task list
    body: |
      Context, motivation, links.
    acceptance:
      - Testable acceptance criterion
```

## Sync rules

- Issues are matched by a hidden marker in the body: `<!-- backlog-id: CORE-012 -->`.
- Missing issues are created (items with `state: done` are created and closed as completed).
- Existing issues get their title, body, milestone and missing labels updated, **unless the
  body was edited on GitHub** (detected through `<!-- backlog-sync: <hash> -->`); then the body
  is left alone and the workflow logs a warning.
- Open issues whose item is `state: done` are closed as completed.
- Closed issues are **never reopened**; labels are never removed; nothing is deleted.

Validate locally with `pnpm --filter @fairhour/github-scripts backlog:validate`, and preview
the sync with `pnpm --filter @fairhour/github-scripts backlog:sync --dry-run` (needs `GITHUB_TOKEN`).
