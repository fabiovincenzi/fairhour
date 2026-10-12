import { appendFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import {
  AGENT_LABEL,
  IN_PROGRESS_LABEL,
  READY_LABEL,
  claimComment,
  pickNextIssue,
} from "../agent-queue.ts";
import { RestGitHubClient } from "../github.ts";

// Usage: pick-issue [--claim] [--max-in-flight 2] [--repo owner/name]
// Prints the next issue an AI agent should take (see AGENTS.md) and, with --claim, claims it:
// labels `agent: claude` + `status: in-progress` and a comment. Writes `issue=<n>` to
// $GITHUB_OUTPUT (empty when nothing is picked).
const { values } = parseArgs({
  options: {
    claim: { type: "boolean", default: false },
    "max-in-flight": { type: "string", default: "2" },
    repo: { type: "string" },
  },
});

const token = process.env.GITHUB_TOKEN;
const repository = values.repo ?? process.env.GITHUB_REPOSITORY;
const maxInFlight = Number(values["max-in-flight"]);
if (!token || !repository || !Number.isInteger(maxInFlight) || maxInFlight < 1) {
  console.error(
    "GITHUB_TOKEN and GITHUB_REPOSITORY (or --repo) are required; --max-in-flight is a positive integer.",
  );
  process.exit(1);
}

const api = new RestGitHubClient({
  token,
  repository,
  ...(process.env.GITHUB_API_URL ? { apiUrl: process.env.GITHUB_API_URL } : {}),
});
const result = pickNextIssue(await api.listOpenWork(), { maxInFlight });
const output = process.env.GITHUB_OUTPUT;

if (result.kind === "none") {
  console.log(`Nothing to pick: ${result.reason}.`);
  if (output) await appendFile(output, "issue=\n");
} else {
  const { number, title } = result.issue;
  console.log(`Next issue: #${String(number)} ${title}`);
  if (values.claim) {
    const server = process.env.GITHUB_SERVER_URL ?? "https://github.com";
    const runId = process.env.GITHUB_RUN_ID;
    await api.addLabels(number, [AGENT_LABEL, IN_PROGRESS_LABEL]);
    // From here the issue is claimed: publish it first, so the workflow's hand-off job can
    // release the claim even if a later call fails.
    if (output) await appendFile(output, `issue=${String(number)}\n`);
    await api.removeLabel(number, READY_LABEL);
    await api.addComment(
      number,
      claimComment(runId ? `${server}/${repository}/actions/runs/${runId}` : undefined),
    );
    console.log("Claimed.");
  } else if (output) {
    await appendFile(output, `issue=${String(number)}\n`);
  }
}
