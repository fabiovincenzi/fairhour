---
description: Implement a specific GitHub issue (or backlog ID) end to end and open a PR that closes it.
argument-hint: <issue-number | BACKLOG-ID>
---

Implement `$ARGUMENTS` end to end, following `AGENTS.md`.

1. Load the issue (the GitHub MCP tools or `gh issue view $ARGUMENTS`). If the argument is a
   backlog ID (e.g. `DATA-013`), read it from `.github/backlog/*.yml` instead. Restate the
   acceptance criteria and the `Files:` list as a checklist.
2. Stop and explain why if a dependency is still open (`pnpm backlog:status` shows whether the
   item is ready), if the issue is labeled `agent: human`, or if someone else has claimed it
   (assignee, `status: in-progress`, `agent: claude`, or an open PR that references it).
3. Claim it (AGENTS.md §3), then follow steps 3–9 of `.claude/commands/next-issue.md` exactly:
   branch, delegate per the Delegation policy in `CLAUDE.md`, verify, get `reviewer` approval,
   bookkeeping, signed-off Conventional Commit with `Closes #N`, push, and open the PR.
4. Finish with a summary: what changed, checks run, PR URL, and any follow-up items you filed.
