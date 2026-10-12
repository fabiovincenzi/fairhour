import { writeFile } from "node:fs/promises";
import path from "node:path";
import { parseBacklog, readBacklogSources } from "../load.ts";
import { PRIORITIES } from "../schema.ts";
import { rewriteStatuses, type Status } from "../status.ts";

// Usage: backlog:status [--write]
// Lists the items that can be started now (every dependency done) and, with --write, updates
// the `status:` lines in .github/backlog/*.yml to the derived ready/blocked values.
const repoRoot = path.resolve(import.meta.dirname, "../../../..");
const write = process.argv.includes("--write");
const sources = await readBacklogSources(repoRoot);
const result = parseBacklog(sources);

if (!result.ok) {
  console.error(`Backlog is invalid (${String(result.errors.length)} error(s)):`);
  for (const error of result.errors) console.error(`  - ${error}`);
  process.exit(1);
}

const open = result.backlog.items.filter((item) => !item.done);
const statuses = new Map<string, Status>(open.map((item) => [item.id, item.status]));
const startable = open
  .filter((item) => item.status === "ready" && item.type !== "epic")
  .sort(
    (a, b) =>
      PRIORITIES.indexOf(a.labels.find((l) => /^P\d$/.test(l)) as (typeof PRIORITIES)[number]) -
        PRIORITIES.indexOf(b.labels.find((l) => /^P\d$/.test(l)) as (typeof PRIORITIES)[number]) ||
      a.id.localeCompare(b.id),
  );

console.log(`Ready to start (${String(startable.length)}):`);
for (const item of startable) {
  const priority = item.labels.find((l) => /^P\d$/.test(l)) ?? "";
  console.log(`  ${priority} ${item.id.padEnd(10)} ${item.title}  [${item.milestone ?? ""}]`);
}

let changed = 0;
for (const file of sources.backlog) {
  const rewritten = rewriteStatuses(file.content, statuses);
  if (rewritten.changed.length === 0) continue;
  changed += rewritten.changed.length;
  console.log(
    `${write ? "Updated" : "Out of date"} in ${file.path}: ${rewritten.changed.join(", ")}`,
  );
  if (write) await writeFile(path.join(repoRoot, file.path), rewritten.content);
}
if (changed > 0 && !write) {
  console.log(
    "Run `pnpm backlog:status --write` to update the YAML (GitHub labels are derived anyway).",
  );
}
