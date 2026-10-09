import path from "node:path";
import { parseBacklog, readBacklogSources } from "../load.ts";

const repoRoot = path.resolve(import.meta.dirname, "../../../..");
const result = parseBacklog(await readBacklogSources(repoRoot));

if (!result.ok) {
  console.error(`Backlog is invalid (${String(result.errors.length)} error(s)):`);
  for (const error of result.errors) console.error(`  - ${error}`);
  process.exit(1);
}

const { items, labels, milestones } = result.backlog;
const count = (predicate: (labels: readonly string[]) => boolean): number =>
  items.filter((item) => predicate(item.labels)).length;
console.log(
  [
    `Backlog OK: ${String(items.length)} items, ${String(labels.length)} labels, ${String(milestones.length)} milestones`,
    `  epics: ${String(items.filter((item) => item.type === "epic").length)}`,
    `  good first issues: ${String(count((l) => l.includes("good first issue")))}`,
    `  done: ${String(items.filter((item) => item.done).length)}`,
    ...milestones.map(
      (m) =>
        `  ${m.title}: ${String(items.filter((item) => item.milestone === m.title).length)} items`,
    ),
  ].join("\n"),
);
