# Agent playbook

How any AI coding agent (Claude Code, Codex, Copilot, Cursor, …) or person picks up and delivers
a piece of Fairhour so that **several agents can work at the same time without colliding**.

Read first: [CLAUDE.md](CLAUDE.md) (repo map, commands, conventions, definition of done, hard
rules), [PROGRESS.md](PROGRESS.md) (where the project is), and for anything under
`packages/tax-*` also [packages/tax-core/CLAUDE.md](packages/tax-core/CLAUDE.md).

Tooling versions in this repo may be newer than your training data. Before changing
configuration, read the docs bundled with the installed package (for example
`node_modules/turbo/docs/`, `node_modules/next/dist/docs/` when present) and the package's type
definitions, and prefer them over memory.

## 1. One issue, one branch, one pull request

The work is planned in [`.github/backlog/*.yml`](.github/backlog) and synced to GitHub issues.
Each item is small, has acceptance criteria and a **`Files:`** line naming the files it owns.
An item is **ready** when every item in its `depends_on` is done; the status labels on GitHub
are derived from that automatically.

## 2. Pick

Take the highest-priority (`P0` > `P1` > `P2` > `P3`), then oldest, issue that is:

- open and labeled `status: ready`;
- not an epic (`type: epic`), not assigned, not labeled `status: in-progress`, `agent: claude`
  or `agent: human`;
- not referenced by an open pull request.

GitHub search:
`is:issue is:open label:"status: ready" no:assignee -label:"type: epic" -label:"agent: claude" -label:"agent: human" -label:"status: in-progress"`.
Without GitHub access, `pnpm backlog:status` lists the ready items from the YAML.

If a person told you which issue to take, take that one, but still stop if a dependency is open.

## 3. Claim

Before writing code, make the claim visible so nobody else starts the same issue:

- add the `status: in-progress` label (remove `status: ready`), assign yourself or add
  `agent: claude` when you are an AI agent;
- comment: `Claimed by <agent or name>, branch <branch>`.

If you cannot write to GitHub, tell the person you work for which issue you are taking so they
can claim it. To release a claim, undo the labels and comment why.

## 4. Build

- Branch from the latest default branch: `<type>/<backlog-id-lowercase>-<short-slug>`, e.g.
  `feat/data-013-clients-repository`.
- **Stay in your lane**: change the files the issue lists under `Files:`. Need something
  elsewhere? Prefer a small, separate follow-up (comment on the issue or file a backlog item)
  over editing another item's files.
- **Shared hotspots** (several PRs touch them; keep your change minimal and append-only):

  | File                                           | Rule                                                                         |
  | ---------------------------------------------- | ---------------------------------------------------------------------------- |
  | `pnpm-lock.yaml`                               | Never edit by hand. On conflict: merge the base branch, run `pnpm install`.  |
  | `.github/backlog/*.yml`                        | Only your item's `state: done` line, plus new follow-up items you file.      |
  | `packages/api/src/routers/index.ts`            | Add one line for your router; do not reorder.                                |
  | `apps/web/messages/{en,it}.json`               | Add keys under your feature's namespace only; both locales.                  |
  | `docs/tax-packs/*.md`                          | Add or edit only the sections your item covers; never reorder sections.      |
  | `docs/adr/README.md`                           | One line per ADR. Take the next free number; renumber if someone merged it.  |
  | `packages/db/migrations/**`                    | Generated only (`pnpm db:generate`). On conflict: merge, delete, regenerate. |
  | `turbo.json`, `knip.json`, root `package.json` | Only scaffold items change them.                                             |
  | `PROGRESS.md`                                  | Not in feature PRs; updated when a phase closes.                             |

- Follow the conventions of CLAUDE.md: TypeScript strict, zod at every boundary, money only
  through `@fairhour/money`, tenant-scoped queries with a tenant-isolation test for every new
  table or route, no hard-coded UI strings, no PII in logs, tax rules cite their source.
- Write the tests with the code. Never skip, weaken or delete a test to get green.

## 5. Verify

```bash
pnpm lint && pnpm typecheck && pnpm test
pnpm test:integration   # when packages/db or packages/api change (needs DATABASE_URL)
pnpm test:e2e           # when a user flow changes
pnpm i18n:check && pnpm knip && pnpm backlog:validate && actionlint   # when relevant
```

Then review your own diff against the issue's acceptance criteria (Claude Code: run the
`reviewer` subagent and address every blocker and major finding).

## 6. Deliver

- In the same PR: mark the backlog item `state: done`, add a changeset (`pnpm changeset`) when a
  package's behavior changed, update docs (and write an ADR when you made a decision).
- Commit with Conventional Commits (`feat(db): …`) and **sign off every commit**
  (`git commit -s`, DCO).
- Open a pull request with a Conventional Commit title, the sections of
  `.github/pull_request_template.md`, and `Closes #<issue>`. AI agents add the `agent: claude`
  label to the PR.
- Stuck (unclear requirement, a decision for a human, a check you cannot fix)? Open the PR as a
  **draft** that says what is left, or comment on the issue. Do not guess on tax or legal
  questions: ask, and leave sources marked `to-be-verified`.

## 7. Never

Merge your own PR, push to the default branch, force-push or rewrite shared history, commit
secrets, disable a check, touch another claimed issue's files, or work on an issue labeled
`agent: human`.

## 8. Agents in this repo

- **Claude Code** (CLI, desktop, web): `/next-issue` picks, claims and delivers the next issue;
  `/implement-issue <n>` does it for a given one. The subagents in `.claude/agents/` follow the
  delegation policy in CLAUDE.md.
- **Claude on GitHub**: mention `@claude` in an issue or PR, or label an issue `agent: claude`
  (`.github/workflows/claude.yml`). The action names its branch `claude/issue-<n>-<time>`
  instead of the convention of §4; that is fine.
- **Autopilot** (opt-in): `.github/workflows/autopilot.yml` claims the next ready issue on a
  schedule and opens a PR for it.
- **Copilot coding agent, Codex and others**: read this file; Copilot also reads
  `.github/copilot-instructions.md`.

Maintainers: see [docs/maintainers/ai-agents.md](docs/maintainers/ai-agents.md) for setup and
how to run many agents in parallel.
