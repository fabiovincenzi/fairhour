import { describe, expect, it } from "vitest";
import {
  parseEnvExample,
  readEnvExample,
  readTurboConfig,
  reachesTask,
  type TurboConfig,
} from "./turbo-json.ts";

// Turborepo runs tasks in strict environment mode: a variable reaches a task only when
// turbo.json names it. A variable added to `.env.example` but not to turbo.json would be set on
// the developer's machine and silently missing inside `pnpm dev`, `pnpm build` and the test runs.
// Pass-through variables are kept out of the cache hash on purpose (secrets, URLs); move one to
// `env` if it changes the build output.

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

describe(".env.example and turbo.json", () => {
  const env = readEnvExample();
  const turbo = readTurboConfig();

  it("declares variables (so the parser is not silently matching nothing)", () => {
    expect(env.variables).toEqual(expect.arrayContaining(["APP_URL", "DATABASE_URL"]));
    expect(new Set(env.variables).size).toBe(env.variables.length);
  });

  it.each(APP_TASKS)("passes every variable of .env.example to %s", (task) => {
    const missing = env.variables.filter((variable) => !reachesTask(turbo, task, variable));
    expect(missing, `add these to turbo.json (tasks.${task}.passThroughEnv)`).toEqual([]);
  });

  it("passes the optional tooling switches to every task", () => {
    expect(env.optional).toContain("NEXT_TELEMETRY_DISABLED");
    for (const task of Object.keys(turbo.tasks)) {
      const missing = env.optional.filter((variable) => !reachesTask(turbo, task, variable));
      expect(missing, `add these to turbo.json (globalPassThroughEnv), task ${task}`).toEqual([]);
    }
  });
});
