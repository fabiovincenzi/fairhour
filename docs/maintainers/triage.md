# Triage guide

Goal: every new issue gets a first response within a few days and ends up either
`status: ready` (actionable), `status: blocked`, closed as duplicate/won't fix, or moved to
Discussions.

## New issues (`status: triage`)

1. **Security?** If it reports a vulnerability, hide/delete the details, thank the reporter and
   point them to private reporting (SECURITY.md). Never discuss exploits publicly.
2. **Is it a question?** Convert it to a Discussion.
3. **Duplicate?** Link the original, label `duplicate`, close.
4. **Reproducible / clear?** If not, ask for the missing information (version, steps, locale and
   time zone, tax configuration) and keep `status: triage`.
5. **Label it**: one `type: *`, one or more `area: *`, a priority `P0`–`P3`, a `size: *`.
6. **Decide**: `status: ready` when it is actionable and scoped; add `good first issue` if it is
   small, self-contained and documented, `help wanted` if maintainers will not get to it soon.
7. **Milestone**: put it in the milestone where it will be done, or leave it without one.

## Priorities

| Priority | Meaning                                                                  | Response          |
| -------- | ------------------------------------------------------------------------ | ----------------- |
| `P0`     | Data loss, security, broken `main`, wrong tax figures in a released pack | Drop everything   |
| `P1`     | Needed for the current milestone                                         | This milestone    |
| `P2`     | Important, not urgent                                                    | Next milestones   |
| `P3`     | Nice to have                                                             | Community welcome |

Wrong tax computations in a released pack are always `P0` or `P1`, with a regression golden
fixture in the fix.

## Pull requests

- Check the PR title (Conventional Commits), DCO, the template checklist, and labels (the
  labeler adds `area:*` automatically).
- First-time contributors get a warm welcome (automated) and extra patience.
- Large PRs without a prior issue: thank, and ask to discuss the approach in an issue first.
- Tax pack PRs need the pack steward's review (CODEOWNERS / MAINTAINERS.md).

## Backlog as code

Planned work lives in `.github/backlog/*.yml` and is synced to issues on merge. To change a
planned item, edit the YAML (the issue body says so). Ad-hoc issues from users stay as normal
issues; if one becomes roadmap work, add it to the backlog with a new ID and close the original
as a duplicate of the synced issue.

## Stale and lock policies

- Issues without activity for 90 days get `stale` and close after 30 more days; PRs after 60+30.
  `P0`, `P1`, `pinned`, security, ready/in-progress, milestone and assigned items are exempt.
- Threads closed for 180 days are locked.
