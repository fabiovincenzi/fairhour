---
description: Run the reviewer subagent on a pull request and post its findings.
argument-hint: <pr-number>
---

Review pull request `#$ARGUMENTS`.

1. Fetch the PR metadata and diff (`gh pr view $ARGUMENTS`, `gh pr diff $ARGUMENTS`, or the
   GitHub MCP tools) and check it out locally (`gh pr checkout $ARGUMENTS` or
   `git fetch origin pull/$ARGUMENTS/head:pr-$ARGUMENTS && git switch pr-$ARGUMENTS`).
2. Run the `reviewer` subagent with the diff against the PR base. It runs the checks itself.
3. Post the result as a single PR review: `APPROVE` → comment review with the summary;
   `CHANGES REQUESTED` → request changes with one inline comment per finding (`file:line`).
   End every comment with the Claude Code attribution footer.
4. Check that the PR title is a Conventional Commit, every commit is signed off (DCO), the
   template checklist is filled, and labels match the changed areas. Mention gaps in the review.
5. Report the verdict and a link to the review.
