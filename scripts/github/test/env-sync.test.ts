import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  missingFrom,
  parseEnvExample,
  readEnvExample,
  readPackageTurboConfigs,
  readTurboConfig,
  reachesTask,
  resolveTaskEnv,
  type PackageTurboConfig,
  type TurboConfig,
} from "./turbo-json.ts";

// Turborepo runs tasks in strict environment mode: a variable reaches a task only when
// turbo.json names it. A variable added to `.env.example` but not to turbo.json would be set on
// the developer's machine and silently missing inside `pnpm dev`, `pnpm build` and the test runs.
// Pass-through variables are kept out of the cache hash on purpose (secrets, URLs); move one to
// `env` if it changes the build output. A package-level turbo.json that sets `env` or
// `passThroughEnv` for one of these tasks REPLACES the root list (unless it starts with
// "$TURBO_EXTENDS$"), so it can silently drop variables: the checks below look at those too.

/** The tasks that run the app, and therefore need the whole environment. */
const APP_TASKS = ["dev", "build", "test:integration", "test:e2e"] as const;

describe("parseEnvExample", () => {
  it("separates assigned variables from commented-out optional ones", () => {
    const text = [
      "# A header mentioning cp .env.example .env",
      "APP_URL=http://localhost:3000",
      'SMTP_FROM="Fairhour <no-reply@fairhour.localhost>"',
      "EMPTY=",
      "# Callback URL: ${APP_URL}/api/auth/callback/google",
      "# TURBO_TELEMETRY_DISABLED=1",
      "lowercase=ignored",
    ].join("\n");
    expect(parseEnvExample(text)).toEqual({
      variables: ["APP_URL", "SMTP_FROM", "EMPTY"],
      optional: ["TURBO_TELEMETRY_DISABLED"],
    });
  });
});

describe("reachesTask", () => {
  const config: TurboConfig = {
    globalEnv: ["GLOBAL_*"],
    globalPassThroughEnv: ["PASS"],
    tasks: {
      build: { dependsOn: [], env: ["HASHED"], passThroughEnv: ["SECRET"] },
      lint: { dependsOn: [], env: [], passThroughEnv: [] },
    },
  };

  it.each([
    ["build", "HASHED", true],
    ["build", "SECRET", true],
    ["build", "PASS", true],
    ["build", "GLOBAL_ANYTHING", true],
    ["build", "OTHER", false],
    ["lint", "SECRET", false],
    ["lint", "PASS", true],
    ["lint", "GLOBALS", false],
  ])("%s receives %s: %s", (task, variable, expected) => {
    expect(reachesTask(config, task, variable)).toBe(expected);
  });

  it("fails loudly for a task turbo.json does not define", () => {
    expect(() => reachesTask(config, "missing", "X")).toThrow('defines no "missing" task');
  });
});

describe("reachesTask with package-level turbo.json files", () => {
  const root: TurboConfig = {
    globalEnv: ["GLOBAL"],
    globalPassThroughEnv: ["PASS"],
    tasks: {
      build: { dependsOn: [], env: ["HASHED"], passThroughEnv: ["A", "B"] },
      lint: { dependsOn: [], env: [], passThroughEnv: ["A"] },
    },
  };

  function withPackage(tasks: PackageTurboConfig["tasks"]): TurboConfig {
    return { ...root, packages: [{ name: "@x/app", dir: "apps/app", tasks }] };
  }

  function resolved(config: TurboConfig, task: string) {
    const [pkg] = config.packages ?? [];
    if (pkg === undefined) throw new Error("the config has no package");
    return resolveTaskEnv(config, pkg, task);
  }

  it("is the root's answer when no package overrides the task", () => {
    expect(missingFrom(root, "build", "A")).toEqual([]);
    expect(missingFrom(withPackage({}), "build", "A")).toEqual([]);
    expect(missingFrom(withPackage({ lint: { passThroughEnv: [] } }), "build", "A")).toEqual([]);
    // Overrides that do not touch the lists inherit them.
    expect(missingFrom(withPackage({ build: {} }), "build", "A")).toEqual([]);
    expect(missingFrom(withPackage({ build: { env: ["X"] } }), "build", "A")).toEqual([]);
  });

  it("is false when the root drops the variable, and says so", () => {
    expect(missingFrom(root, "build", "C")).toEqual(["turbo.json"]);
    expect(reachesTask(root, "build", "C")).toBe(false);
  });

  it("is false when a package's list replaces the root's and leaves the variable out", () => {
    const config = withPackage({ build: { passThroughEnv: ["A"] } });
    expect(missingFrom(config, "build", "A")).toEqual([]);
    expect(missingFrom(config, "build", "B")).toEqual(["apps/app/turbo.json"]);
    expect(reachesTask(config, "build", "B")).toBe(false);
    // The `env` list is inherited here, and what comes from the globals still reaches the task.
    expect(reachesTask(config, "build", "HASHED")).toBe(true);
    expect(reachesTask(config, "build", "GLOBAL")).toBe(true);
    expect(reachesTask(config, "build", "PASS")).toBe(true);
  });

  it("is false when a package empties a list", () => {
    expect(missingFrom(withPackage({ build: { passThroughEnv: [] } }), "build", "A")).toEqual([
      "apps/app/turbo.json",
    ]);
    expect(missingFrom(withPackage({ build: { env: [] } }), "build", "HASHED")).toEqual([
      "apps/app/turbo.json",
    ]);
  });

  it("keeps the root's variables when the package list starts with $TURBO_EXTENDS$", () => {
    const config = withPackage({ build: { passThroughEnv: ["$TURBO_EXTENDS$", "C"] } });
    for (const variable of ["A", "B", "HASHED", "GLOBAL", "PASS"]) {
      expect(missingFrom(config, "build", variable), variable).toEqual([]);
    }
    // `C` is the package's own addition: only the root definition lacks it.
    expect(missingFrom(config, "build", "C")).toEqual(["turbo.json"]);
    expect(missingFrom(config, "build", "D")).toEqual(["turbo.json", "apps/app/turbo.json"]);
  });

  it("names the root and every package that leaves the variable out", () => {
    const config: TurboConfig = {
      ...root,
      packages: [
        { name: "@x/one", dir: "apps/one", tasks: { build: { passThroughEnv: ["A"] } } },
        { name: "@x/two", dir: "packages/two", tasks: { build: { passThroughEnv: [] } } },
        { name: "@x/three", dir: "packages/three", tasks: { build: { passThroughEnv: ["B"] } } },
      ],
    };
    expect(missingFrom(config, "build", "B")).toEqual([
      "apps/one/turbo.json",
      "packages/two/turbo.json",
    ]);
    expect(missingFrom(config, "build", "C")).toEqual([
      "turbo.json",
      "apps/one/turbo.json",
      "packages/two/turbo.json",
      "packages/three/turbo.json",
    ]);
  });

  it("starts from nothing when the task is redefined with `extends: false`", () => {
    const fresh = withPackage({ build: { extends: false, passThroughEnv: ["A"] } });
    expect(missingFrom(fresh, "build", "A")).toEqual([]);
    expect(missingFrom(fresh, "build", "B")).toEqual(["apps/app/turbo.json"]);
    expect(missingFrom(fresh, "build", "HASHED")).toEqual(["apps/app/turbo.json"]);
    expect(missingFrom(fresh, "build", "GLOBAL")).toEqual([]);
  });

  it("ignores a package that removes the task with `extends: false`", () => {
    const removed = withPackage({ build: { extends: false } });
    expect(missingFrom(removed, "build", "A")).toEqual([]);
    expect(resolved(removed, "build")).toBeUndefined();
  });

  it("does not look at packages that define other tasks only", () => {
    expect(reachesTask(withPackage({ lint: { passThroughEnv: [] } }), "build", "B")).toBe(true);
    expect(reachesTask(withPackage({ lint: { passThroughEnv: [] } }), "lint", "A")).toBe(false);
  });

  it("resolves a task that only the package defines from its own lists", () => {
    const config = withPackage({ extra: { passThroughEnv: ["$TURBO_EXTENDS$", "A"] } });
    expect(resolved(config, "extra")).toEqual({
      env: [],
      passThroughEnv: ["A"],
    });
  });
});

describe("package-level turbo.json files of a workspace", () => {
  const roots: string[] = [];

  afterAll(() => {
    for (const dir of roots) rmSync(dir, { recursive: true, force: true });
  });

  function workspace(files: Record<string, string | object>): string {
    const dir = mkdtempSync(path.join(tmpdir(), "fairhour-turbo-"));
    roots.push(dir);
    const all = {
      "pnpm-workspace.yaml": 'packages:\n  - "apps/*"\n  - "scripts/*"\n',
      "package.json": { name: "root", private: true },
      "turbo.json": {
        tasks: { build: { passThroughEnv: ["A", "B"] }, lint: {} },
      },
      ...files,
    };
    for (const [file, content] of Object.entries(all)) {
      const target = path.join(dir, file);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, typeof content === "string" ? content : JSON.stringify(content));
    }
    return dir;
  }

  it("are read from every package that has one, but not from the root", async () => {
    const dir = workspace({
      "apps/web/package.json": { name: "@x/web" },
      "apps/web/turbo.json": {
        extends: ["//"],
        tasks: { build: { passThroughEnv: ["A"], inputs: ["$TURBO_DEFAULT$"] } },
      },
      "apps/plain/package.json": { name: "@x/plain" },
      "scripts/tool/package.json": { name: "@x/tool" },
      "scripts/tool/turbo.json": { extends: ["//"] },
    });
    expect(await readPackageTurboConfigs(dir)).toEqual([
      {
        name: "@x/web",
        dir: "apps/web",
        tasks: { build: { passThroughEnv: ["A"], inputs: ["$TURBO_DEFAULT$"] } },
      },
      { name: "@x/tool", dir: "scripts/tool", tasks: {} },
    ]);
  });

  it("make a variable that the package leaves out fail, through readTurboConfig", async () => {
    const dir = workspace({
      "apps/web/package.json": { name: "@x/web" },
      "apps/web/turbo.json": { extends: ["//"], tasks: { build: { passThroughEnv: ["A"] } } },
    });
    const config = await readTurboConfig(dir);
    expect(config.packages?.map((pkg) => pkg.dir)).toEqual(["apps/web"]);
    expect(reachesTask(config, "build", "A")).toBe(true);
    expect(missingFrom(config, "build", "B")).toEqual(["apps/web/turbo.json"]);
  });

  it("refuse an `extends` chain that the helper cannot resolve", async () => {
    for (const extendsList of [["//", "@x/other"], ["@x/other"], []]) {
      const dir = workspace({
        "apps/web/package.json": { name: "@x/web" },
        "apps/web/turbo.json": { extends: extendsList, tasks: {} },
      });
      await expect(readPackageTurboConfigs(dir)).rejects.toThrow(/only resolves \["\/\/"\]/);
    }
  });
});

describe(".env.example and turbo.json", async () => {
  const env = readEnvExample();
  const turbo = await readTurboConfig();

  it("declares variables (so the parser is not silently matching nothing)", () => {
    expect(env.variables).toEqual(expect.arrayContaining(["APP_URL", "DATABASE_URL"]));
    expect(new Set(env.variables).size).toBe(env.variables.length);
  });

  it("reads the package-level turbo.json files, so that their overrides are checked too", () => {
    const names = (turbo.packages ?? []).map((pkg) => pkg.name);
    expect(names).toEqual(expect.arrayContaining(["@fairhour/docs", "@fairhour/github-scripts"]));
  });

  it.each(APP_TASKS)("passes every variable of .env.example to %s", (task) => {
    const missing = env.variables.flatMap((variable) =>
      missingFrom(turbo, task, variable).map((where) => `${variable} (${where})`),
    );
    expect(
      missing,
      `add these to tasks.${task}.passThroughEnv of the file shown, or start the list of a ` +
        'package-level turbo.json with "$TURBO_EXTENDS$"',
    ).toEqual([]);
  });

  it("passes the optional tooling switches to every task", () => {
    expect(env.optional).toContain("NEXT_TELEMETRY_DISABLED");
    for (const task of Object.keys(turbo.tasks)) {
      const missing = env.optional.filter((variable) => !reachesTask(turbo, task, variable));
      expect(missing, `add these to turbo.json (globalPassThroughEnv), task ${task}`).toEqual([]);
    }
  });
});
