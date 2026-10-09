import { execFileSync } from "node:child_process";
import { appendFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { GIT_LOG_FORMAT, checkDco, formatDcoResult, parseGitLog } from "../dco.ts";

const { values } = parseArgs({
  options: {
    base: { type: "string" },
    head: { type: "string", default: "HEAD" },
  },
});

const base = values.base ?? process.env["DCO_BASE_SHA"];
const head = process.env["DCO_HEAD_SHA"] ?? values.head;
if (!base) {
  console.error("Pass --base <sha> or set DCO_BASE_SHA.");
  process.exit(1);
}

const output = execFileSync(
  "git",
  ["log", `--format=${GIT_LOG_FORMAT}`, `${base}..${head}`],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
);
const result = checkDco(parseGitLog(output));
const message = formatDcoResult(result);
console.log(message);
const summaryFile = process.env["GITHUB_STEP_SUMMARY"];
if (summaryFile) await appendFile(summaryFile, `${message}\n`);
if (!result.ok) process.exit(1);
