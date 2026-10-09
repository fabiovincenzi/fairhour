import { appendFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { RestGitHubClient } from "../github.ts";
import { parseBacklog, readBacklogSources } from "../load.ts";
import { formatReport, syncBacklog } from "../sync.ts";

const { values } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    repo: { type: "string" },
    branch: { type: "string", default: "main" },
  },
});

const token = process.env["GITHUB_TOKEN"];
const repository = values.repo ?? process.env["GITHUB_REPOSITORY"];
if (!token || !repository) {
  console.error("GITHUB_TOKEN and GITHUB_REPOSITORY (or --repo owner/name) are required.");
  process.exit(1);
}

const repoRoot = path.resolve(import.meta.dirname, "../../../..");
const result = parseBacklog(await readBacklogSources(repoRoot));
if (!result.ok) {
  console.error("Backlog is invalid; run `pnpm backlog:validate` for details.");
  for (const error of result.errors) console.error(`  - ${error}`);
  process.exit(1);
}

const dryRun = values["dry-run"];
const api = new RestGitHubClient({
  token,
  repository,
  ...(process.env["GITHUB_API_URL"] ? { apiUrl: process.env["GITHUB_API_URL"] } : {}),
});
const report = await syncBacklog(api, result.backlog, {
  repository,
  branch: values.branch,
  dryRun,
  log: (message) => {
    console.log(message);
  },
});

const summary = formatReport(report, dryRun);
console.log(`\n${summary}`);
const summaryFile = process.env["GITHUB_STEP_SUMMARY"];
if (summaryFile) await appendFile(summaryFile, summary);
