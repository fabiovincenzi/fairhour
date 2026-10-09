import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { loadWorkspacePackages } from "../src/license-boundary.ts";

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

/**
 * A package-level `turbo.json`. Unlike the root, a missing array is not an empty one: an array
 * that is present *replaces* the inherited list, one that is missing inherits it (see
 * `resolveTaskEnv`).
 */
const packageTurboSchema = z.object({
  extends: z.array(z.string()),
  tasks: z
    .record(
      z.string(),
      z.looseObject({
        extends: z.boolean().optional(),
        env: z.array(z.string()).optional(),
        passThroughEnv: z.array(z.string()).optional(),
      }),
    )
    .default({}),
});

type RootTurboConfig = z.infer<typeof turboSchema>;
type TaskOverride = z.infer<typeof packageTurboSchema>["tasks"][string];

/** The `turbo.json` of one workspace package. */
export interface PackageTurboConfig {
  /** The package name (`@fairhour/docs`). */
  readonly name: string;
  /** The package directory, relative to the repository root (`apps/docs`). */
  readonly dir: string;
  readonly tasks: Readonly<Record<string, TaskOverride>>;
}

export interface TurboConfig extends RootTurboConfig {
  /** The package-level `turbo.json` files, which may override a task of the root one. */
  readonly packages?: readonly PackageTurboConfig[];
}

/** Prefix of the entry that makes a package-level array extend, rather than replace, the root's. */
const EXTENDS_MARKER = "$TURBO_EXTENDS$";

/** Reads the package-level `turbo.json` of every workspace package that has one. */
export async function readPackageTurboConfigs(root = repoRoot): Promise<PackageTurboConfig[]> {
  const found: PackageTurboConfig[] = [];
  for (const pkg of await loadWorkspacePackages(root)) {
    const file = path.join(root, pkg.dir, "turbo.json");
    if (pkg.dir === "." || !existsSync(file)) continue;
    const parsed = packageTurboSchema.parse(JSON.parse(readFileSync(file, "utf8")));
    // Resolving a chain of packages is not implemented: fail loudly rather than guess.
    if (parsed.extends.length !== 1 || parsed.extends[0] !== "//") {
      throw new Error(
        `${pkg.dir}/turbo.json extends ${JSON.stringify(parsed.extends)}: ` +
          'test/turbo-json.ts only resolves ["//"]; teach resolveTaskEnv about the chain first',
      );
    }
    found.push({ name: pkg.name, dir: pkg.dir, tasks: parsed.tasks });
  }
  return found;
}

/** The root `turbo.json` together with the package-level ones. */
export async function readTurboConfig(root = repoRoot): Promise<TurboConfig> {
  const raw: unknown = JSON.parse(readFileSync(path.join(root, "turbo.json"), "utf8"));
  return { ...turboSchema.parse(raw), packages: await readPackageTurboConfigs(root) };
}

/** Matches an environment variable name against a `turbo.json` entry (`*` is a wildcard). */
function matches(entry: string, variable: string): boolean {
  const pattern = entry
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${pattern}$`).test(variable);
}

/** Applies a package-level array to the inherited one: it replaces it, unless it starts with `$TURBO_EXTENDS$`. */
function applyOverride(inherited: readonly string[], override: readonly string[] | undefined) {
  if (override === undefined) return inherited;
  return override[0] === EXTENDS_MARKER ? [...inherited, ...override.slice(1)] : override;
}

/**
 * The `env` and `passThroughEnv` a package's `turbo.json` leaves a task with, following the rules
 * of Turborepo's "Package Configurations": a list that the package sets replaces the root's list
 * (unless it starts with `$TURBO_EXTENDS$`, which appends to it), a list it does not set is
 * inherited, and `extends: false` on the task either removes the task from the package (`undefined`)
 * or, with more configuration, starts a fresh definition that inherits nothing.
 */
export function resolveTaskEnv(
  config: TurboConfig,
  pkg: PackageTurboConfig,
  task: string,
): { env: readonly string[]; passThroughEnv: readonly string[] } | undefined {
  const override = pkg.tasks[task];
  const root = config.tasks[task];
  if (override === undefined) return root;
  if (override.extends === false) {
    const configured = Object.keys(override).some((key) => key !== "extends");
    if (!configured) return undefined;
    return {
      env: applyOverride([], override.env),
      passThroughEnv: applyOverride([], override.passThroughEnv),
    };
  }
  return {
    env: applyOverride(root?.env ?? [], override.env),
    passThroughEnv: applyOverride(root?.passThroughEnv ?? [], override.passThroughEnv),
  };
}

/**
 * Where Turborepo's strict environment mode does NOT let `variable` reach `task`: `turbo.json` for
 * the root definition, and `<dir>/turbo.json` for every package whose own `turbo.json` overrides
 * the task and leaves the variable out. A variable gets through when it is named in `globalEnv`,
 * `globalPassThroughEnv` (which a package cannot override), or the task's own `env` or
 * `passThroughEnv`. Empty when it reaches the task everywhere.
 */
export function missingFrom(config: TurboConfig, task: string, variable: string): string[] {
  const definition = config.tasks[task];
  if (definition === undefined) throw new Error(`turbo.json defines no "${task}" task`);
  const global = [...config.globalEnv, ...config.globalPassThroughEnv];
  const reaches = (...entries: (readonly string[])[]) =>
    [...global, ...entries.flat()].some((entry) => matches(entry, variable));

  const places: string[] = [];
  if (!reaches(definition.env, definition.passThroughEnv)) places.push("turbo.json");
  for (const pkg of config.packages ?? []) {
    if (!(task in pkg.tasks)) continue;
    const resolved = resolveTaskEnv(config, pkg, task);
    if (resolved !== undefined && !reaches(resolved.env, resolved.passThroughEnv)) {
      places.push(`${pkg.dir}/turbo.json`);
    }
  }
  return places;
}

/**
 * Whether the variable reaches `task` in the root definition and in every package-level
 * `turbo.json` that overrides it (see {@link missingFrom}).
 */
export function reachesTask(config: TurboConfig, task: string, variable: string): boolean {
  return missingFrom(config, task, variable).length === 0;
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
