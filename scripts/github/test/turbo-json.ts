import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

/** The repository root, where `turbo.json` and `.env.example` live. */
export const repoRoot = path.resolve(import.meta.dirname, "../../..");

const names = z.array(z.string()).default([]);

const turboSchema = z.object({
  globalEnv: names,
  globalPassThroughEnv: names,
  tasks: z.record(
    z.string(),
    z.object({
      dependsOn: names,
      env: names,
      passThroughEnv: names,
    }),
  ),
});

export type TurboConfig = z.infer<typeof turboSchema>;

export function readTurboConfig(): TurboConfig {
  const raw: unknown = JSON.parse(readFileSync(path.join(repoRoot, "turbo.json"), "utf8"));
  return turboSchema.parse(raw);
}

/** Matches an environment variable name against a `turbo.json` entry (`*` is a wildcard). */
function matches(entry: string, variable: string): boolean {
  const pattern = entry
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${pattern}$`).test(variable);
}

/**
 * Whether Turborepo's strict environment mode lets `variable` reach `task`: it must be named in
 * `globalEnv`, `globalPassThroughEnv`, or the task's own `env` or `passThroughEnv`.
 */
export function reachesTask(config: TurboConfig, task: string, variable: string): boolean {
  const definition = config.tasks[task];
  if (definition === undefined) throw new Error(`turbo.json defines no "${task}" task`);
  return [
    ...config.globalEnv,
    ...config.globalPassThroughEnv,
    ...definition.env,
    ...definition.passThroughEnv,
  ].some((entry) => matches(entry, variable));
}

export interface EnvExample {
  /** Variables assigned in the file (`NAME=value`). */
  readonly variables: readonly string[];
  /** Variables shown commented out (`# NAME=value`): optional switches such as telemetry opt-outs. */
  readonly optional: readonly string[];
}

/** Parses the variable names out of `.env.example` text. */
export function parseEnvExample(text: string): EnvExample {
  const variables: string[] = [];
  const optional: string[] = [];
  for (const line of text.split("\n")) {
    const match = /^(#\s*)?([A-Z][A-Z0-9_]*)=/.exec(line);
    if (match?.[2] === undefined) continue;
    (match[1] === undefined ? variables : optional).push(match[2]);
  }
  return { variables, optional };
}

export function readEnvExample(): EnvExample {
  return parseEnvExample(readFileSync(path.join(repoRoot, ".env.example"), "utf8"));
}
