---
description: Pick the highest-priority ready, unclaimed issue, claim it, implement it via subagents, get reviewer approval, and open a PR that closes it.
---

Work on the next most important piece of Fairhour work, end to end, following `AGENTS.md` (the
agent playbook shared by every AI and person working in parallel).

1. **Pick the work** (AGENTS.md §2).
   - If GitHub is reachable (the GitHub MCP tools or an authenticated `gh`), list open issues
     labeled `status: ready` and skip epics, assigned issues, issues labeled
     `status: in-progress`, `agent: claude` or `agent: human`, and issues an open PR references.
     Choose the highest priority (`P0` > `P1` > `P2` > `P3`), then the oldest.
   - Otherwise run `pnpm backlog:status` and take the first item it lists (it only lists items
     whose dependencies are done), and tell the user which one so they can claim it.
   - Say which item you picked and why, in one line.
2. **Claim it** (AGENTS.md §3): label `status: in-progress` + `agent: claude` (remove
   `status: ready`) and comment `Claimed by Claude Code, branch <branch>`.
3. **Branch** from an up-to-date default branch: `<type>/<backlog-id-lowercase>-<slug>`
   (e.g. `feat/data-013-clients-repository`). In a cloud session with a fixed branch, use that.
4. **Plan and delegate** following the Delegation policy in `CLAUDE.md`:
   `explorer` to map the area if needed → `architect` for design/ADR/tax work →
   `implementer` for code → `test-writer` for missing tests → `i18n` for locale keys.
   Run independent subtasks in parallel. Give each subagent a self-contained brief that includes
   the issue's `Files:` list: changes stay inside it plus the shared hotspots of AGENTS.md §4.
5. **Verify**: `pnpm lint && pnpm typecheck && pnpm test` (+ `test:integration`, `test:e2e`,
   `i18n:check`, `knip`, `actionlint` when relevant). Fix failures; never weaken tests.
6. **Review**: run the `reviewer` subagent on `git diff <base>...HEAD`. Address every
   blocker/major finding and re-run the reviewer until it returns `APPROVE`.
7. **Bookkeeping** (`triage`): mark the backlog item `state: done` (only that line), add a
   changeset if a package changed user-facing behavior. Do not edit `PROGRESS.md` unless this
   item closes a phase.
8. **Commit** with Conventional Commits and DCO (`git commit -s`), referencing
   `Closes #N` (or `Refs <BACKLOG-ID>` if the issue does not exist yet).
9. **Push and open a PR** with a Conventional Commit title, the label `agent: claude` and the
   filled `.github/pull_request_template.md`. Report the PR URL. If something is left for a
   human, open it as a draft and say what.
