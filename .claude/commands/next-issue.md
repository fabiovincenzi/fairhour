---
description: Pick the highest-priority ready issue (or next backlog item), implement it via subagents, get reviewer approval, and open a PR that closes it.
---

Work on the next most important piece of Fairhour work, end to end.

1. **Pick the work.**
   - If GitHub is reachable (`gh auth status`, or the GitHub MCP tools), list open issues labeled
     `status: ready` and choose the highest priority (`P0` > `P1` > `P2` > `P3`), then the oldest.
     Skip issues that are assigned or labeled `status: blocked`.
   - Otherwise read `.github/backlog/*.yml` and pick the first item with no `state: done`,
     the lowest milestone, then the highest priority, whose dependencies are done.
   - Say which item you picked and why, in one line.
2. **Branch** from an up-to-date `main`: `git switch -c <type>/<id>-<slug>` (e.g. `feat/core-012-rounding`).
3. **Plan and delegate** following the Delegation policy in `CLAUDE.md`:
   `explorer` to map the area if needed → `architect` for design/ADR/tax work →
   `implementer` for code → `test-writer` for missing tests → `i18n` for locale keys.
   Run independent subtasks in parallel. Give each subagent a self-contained brief.
4. **Verify**: `pnpm lint && pnpm typecheck && pnpm test` (+ `test:integration`, `test:e2e`,
   `i18n:check`, `actionlint` when relevant). Fix failures; never weaken tests.
5. **Review**: run the `reviewer` subagent on `git diff main...HEAD`. Address every blocker/major
   finding and re-run the reviewer until it returns `APPROVE`.
6. **Bookkeeping** (`triage`): mark the backlog item `state: done`, add a changeset if a
   package changed user-facing behaviour, update `PROGRESS.md` if a phase advanced.
7. **Commit** with Conventional Commits and DCO (`git commit -s`), referencing
   `Closes #N` (or `Refs <BACKLOG-ID>` if the issue does not exist yet).
8. **Push and open a PR** with a Conventional Commit title and the filled
   `.github/pull_request_template.md`. Report the PR URL.
