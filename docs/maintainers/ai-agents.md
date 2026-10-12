# Running AI agents in parallel

Fairhour is built so that several AI agents (and people) can work at the same time and work goes
on when one session hits its usage limits. This page is for maintainers: how the pieces fit, how
to set them up, and how to run a wave of agents. The rules every agent follows are in
[AGENTS.md](../../AGENTS.md).

## How it fits together

1. **Backlog as code.** `.github/backlog/*.yml` holds every item with acceptance criteria,
   dependencies (`depends_on`) and the files it owns (`Files:`). Merging to `main` runs
   `sync-backlog.yml`, which creates or updates the GitHub issues, labels and milestones.
2. **Derived status.** An open item is `status: ready` when all its dependencies are
   `state: done`, otherwise `status: blocked`. The sync recomputes this on every run, so when a
   PR marks its item done, the items waiting on it become ready on GitHub by themselves.
   `status: in-progress` set on GitHub (a claim) is never overwritten.
3. **Claims.** An agent claims an issue before starting (`status: in-progress`, `agent: claude`
   or an assignee, plus a comment) and opens one PR that closes it. Agents skip claimed issues,
   epics, issues labeled `agent: human` and issues an open PR already references.
4. **Lanes.** Each item lists the files it owns. Parallel PRs touch different files; the few
   shared files (lockfile, router index, message catalogs, backlog YAML) have append-only rules
   in AGENTS.md §4.
5. **Review.** Every PR runs CI and needs a maintainer's approval. Agents never merge.

## Ways to run agents

| Agent                       | How to start it                                                                                    | Good for                         |
| --------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------- |
| Claude Code (CLI, web, app) | Open a session on the repo and run `/next-issue`, or `/implement-issue 42`. One session per issue. | Most items; design work          |
| Claude on GitHub            | Comment `@claude …` on an issue or PR, or add the `agent: claude` label to an issue.               | Hands-off items, PR review fixes |
| Autopilot                   | Scheduled workflow: claims the next ready issue every 3 hours and lets Claude open a PR.           | Keeping a steady flow unattended |
| Copilot coding agent        | Assign the issue to Copilot. It reads `.github/copilot-instructions.md` and AGENTS.md.             | Small, well-specified items      |
| Codex, Cursor, others       | Point them at an issue; they read AGENTS.md.                                                       | Anything with a clear `Files:`   |

Claude Code sessions in the cloud each get their own container and branch, so you can start
several from claude.ai/code at once: give each one `/implement-issue <n>` with a different issue.
Locally, use one git worktree per session (`git worktree add ../fairhour-<id> -b <branch>`).

## One-time setup

1. **Merge the planning branch to `main`.** The sync only runs on `main`; it then creates every
   label, milestone and issue (about 150). Check the run of "Sync backlog" in the Actions tab.
2. **Claude GitHub App**: install it on the repository (in Claude Code: `/install-github-app`,
   or from github.com/apps/claude). PRs it pushes trigger CI normally.
3. **Credentials** (repository secrets, one of):
   - `CLAUDE_CODE_OAUTH_TOKEN`: run `claude setup-token` with your Claude subscription;
   - `ANTHROPIC_API_KEY`: an API key (billed per use).
     Without one, `claude.yml` and `autopilot.yml` do nothing.
4. **Autopilot** (optional; it never takes epics, good first issues or `agent: human` issues),
   as repository variables:
   - `AUTOPILOT_ENABLED=true` turns it on (delete the variable to turn it off);
   - `AUTOPILOT_MAX_IN_FLIGHT` (default `2`): how many agent tasks may be open at once (a claimed issue and its PR count once).
     Raise it only as fast as you can review.
5. **Branch protection** on `main` (see [repo-settings.md](repo-settings.md)): required checks,
   one approving review, no direct pushes. Agents then cannot land anything without you.

## Running a wave

`pnpm backlog:status` prints every item that can start now, by priority. A good wave is 3 to 5
items that do not share files. Today's starting set, grouped so each line can run in parallel
with the others:

- **Phase 3 foundations**: DATA-011 data model design (`architect`), DATA-012 `packages/db`
  scaffold, DATA-017 `packages/api` scaffold.
- **Phase 4 foundation**: UI-001 `packages/ui` design system.
- **Independent libraries**: REP-004 PDF timesheet (`packages/pdf`), REP-005 CSV serializer.
- **Phase 2 follow-ups**: REV-002, REV-003, REV-004 (`tax-core`, disjoint files), REV-005
  (`tax-pack-it`; REV-006, FPA-002 and REV-013 wait for it), REV-007, REV-008, REV-009, REV-010,
  REV-011, REV-012.
- **Docs and small libraries**: GFI-015, GFI-018…020, LAUNCH-004. Good first issues are left for
  newcomers by the autopilot; a supervised session may take them.
- **For people** (`agent: human`): country tax packs GFI-007…012 need someone who can read the
  local law; REV-013 needs the Italian statutes read on Normattiva.

What unlocks what next:

```text
DATA-011 + DATA-012 → DATA-002 schema (incl. auth tables) → DATA-004 tenancy kit → DATA-013/014/015/016 repositories (parallel) → DATA-009 audit
DATA-017 + DATA-002 → DATA-006 auth → DATA-008 roles → WEB-014/015/016/017 routers (parallel, one per repository)
REV-005 → REV-006, FPA-002 (FatturaPA), REV-013
UI-001 → WEB-002 web scaffold → WEB-012 tRPC wiring → WEB-013 sign-in → pages (one per router)
```

## Keeping it healthy

- **Review queue first.** Merging ready PRs unlocks the next wave; agents waiting on a blocked
  dependency are wasted runs.
- **Conflicts.** Ask the agent (or `@claude` on the PR) to merge the base branch; lockfile and
  migration conflicts are resolved by regenerating, never by hand.
- **Stuck issues.** Autopilot labels an issue `agent: human` when a run ends without a PR. Read
  the run log, clarify the issue, then remove the label to retry.
- **Closing an agent PR without merging** leaves its issue claimed: remove `agent: claude` and
  `status: in-progress` from the issue too, or it counts against `AUTOPILOT_MAX_IN_FLIGHT` and is
  never picked again.
- **Pull requests from forks.** `claude.yml` never runs on them: their code would run next to the
  credentials. Ask the contributor to make the change, or push it to a branch of this repository
  first. Only comments by `CLAUDE_TRUSTED_ACTORS` (a repository variable, comma-separated
  logins; default: the repository owner) reach Claude's prompt; add co-maintainers there.
- **Scope creep.** A PR that edits files outside its issue's `Files:` list needs a reason in the
  PR body; otherwise ask for a follow-up issue instead.
- **Tax and legal content** always gets a human review against the cited sources.
- **PROGRESS.md** is updated when a phase closes (by the maintainer or the session that merges
  the last item), not in every PR.
