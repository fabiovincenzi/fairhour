import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { releaseCommand } from "../release.ts";

const { values } = parseArgs({ options: { "dry-run": { type: "boolean", default: false } } });

const { args, description } = releaseCommand(process.env);
console.log(description);
console.log(`$ pnpm ${args.join(" ")}`);
if (values["dry-run"]) process.exit(0);

// stdio and the environment (CHANGESETS_OUTPUT, NPM_CONFIG_PROVENANCE, ...) are inherited.
const result = spawnSync("pnpm", args, {
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (result.error) {
  console.error(`Could not run pnpm: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
