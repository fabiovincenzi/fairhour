---
description: Implement a specific GitHub issue (or backlog ID) end to end and open a PR that closes it.
argument-hint: <issue-number | BACKLOG-ID>
---

Implement `$ARGUMENTS` end to end.

1. Load the issue (`gh issue view $ARGUMENTS` or the GitHub MCP tools). If the argument is a
   backlog ID (e.g. `CORE-012`), read it from `.github/backlog/*.yml` instead. Restate the
   acceptance criteria as a checklist.
2. If the issue is labeled `status: blocked` or its dependencies are open, stop and explain why.
3. Then follow steps 2–8 of `.claude/commands/next-issue.md` exactly: branch, delegate per the
   Delegation policy in `CLAUDE.md`, verify, get `reviewer` approval, bookkeeping, signed-off
   Conventional Commit with `Closes #N`, push, and open the PR.
4. Finish with a summary: what changed, checks run, PR URL, and any follow-up items you filed.
