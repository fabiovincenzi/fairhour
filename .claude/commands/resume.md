---
description: Read PROGRESS.md and continue from the next unfinished phase.
---

Resume the Fairhour build where the last session stopped.

1. Read `PROGRESS.md` (done / next / known issues / how to resume) and `CLAUDE.md`.
2. Check the repo state: `git status`, `git log --oneline -15`, and run
   `pnpm install && pnpm lint && pnpm typecheck && pnpm test`. If anything is red, fixing it
   is the first task.
3. Take the "Next" section of `PROGRESS.md` and the open backlog items of the current phase
   (`.github/backlog/*.yml`, items without `state: done`). Plan the phase as a list of tasks.
4. Execute the plan following the Delegation policy in `CLAUDE.md` (parallel subagents for
   independent tasks, `reviewer` approval before each commit).
5. At the end of each phase: everything builds, all tests pass, workflows pass `actionlint`,
   backlog items are marked done, `PROGRESS.md` is updated, and the work is committed with
   Conventional Commits and `git commit -s`.
