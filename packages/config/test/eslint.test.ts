import path from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
import { CODE_FILES, DEFAULT_IGNORES, createConfig, type CreateConfigOptions } from "../eslint.js";

const fixtureDir = path.join(import.meta.dirname, "fixtures/lint");

/**
 * Type-aware linting builds a TypeScript program for the fixture project on first use, which
 * takes a few seconds when turbo runs the test suites of every package in parallel (one run took
 * 6.3 s against vitest's 5 s default). The assertions are unchanged; only the time they may take.
 */
const TYPE_AWARE_TIMEOUT = 60_000;

type Options = Omit<CreateConfigOptions, "tsconfigRootDir">;

async function lint(code: string, file = "sample.ts", options: Options = {}) {
  const eslint = new ESLint({
    cwd: fixtureDir,
    overrideConfigFile: true,
    overrideConfig: createConfig({ tsconfigRootDir: fixtureDir, ...options }),
  });
  const [result] = await eslint.lintText(code, { filePath: path.join(fixtureDir, file) });
  return (result?.messages ?? []).map((m) => ({
    rule: m.ruleId,
    severity: m.severity,
    message: m.message,
  }));
}

async function rules(code: string, file?: string, options?: Options) {
  return (await lint(code, file, options)).map((m) => m.rule);
}

describe("createConfig", () => {
  it("ends with eslint-config-prettier so formatting rules never conflict", () => {
    const config = createConfig({ tsconfigRootDir: fixtureDir });
    expect(config.at(-1)?.name).toBe("config-prettier");
  });

  it("puts extra configs before prettier and appends extra ignores", () => {
    const config = createConfig({
      tsconfigRootDir: fixtureDir,
      ignores: ["generated/**"],
      extraConfigs: [{ name: "test/extra", rules: { "no-debugger": "error" } }],
    });
    const names = config.map((c) => c.name);
    expect(names.indexOf("test/extra")).toBeGreaterThan(-1);
    expect(names.indexOf("test/extra")).toBeLessThan(names.indexOf("config-prettier"));
    const ignores = config.find((c) => c.name === "fairhour/ignores")?.ignores;
    expect(ignores).toEqual([...DEFAULT_IGNORES, "generated/**"]);
  });

  it("ignores build output", () => {
    expect(DEFAULT_IGNORES).toEqual(
      expect.arrayContaining([
        "**/dist/**",
        "**/.next/**",
        "**/coverage/**",
        "**/.turbo/**",
        "**/.astro/**",
        "**/node_modules/**",
      ]),
    );
  });

  it(
    "lets a package allow console output everywhere",
    { timeout: TYPE_AWARE_TIMEOUT },
    async () => {
      const eslint = new ESLint({
        cwd: fixtureDir,
        overrideConfigFile: true,
        overrideConfig: createConfig({ tsconfigRootDir: fixtureDir, allowConsoleIn: CODE_FILES }),
      });
      const [result] = await eslint.lintText("console.log(1);\nexport {};\n", {
        filePath: path.join(fixtureDir, "sample.ts"),
      });
      expect(result?.messages).toEqual([]);
    },
  );
});

describe("shared rules (type-checked)", { timeout: TYPE_AWARE_TIMEOUT }, () => {
  it("accepts clean code", async () => {
    expect(await lint("export const answer = 42;\n")).toEqual([]);
  });

  it("forbids any", async () => {
    expect(await rules("export const x: any = 1;\n")).toContain(
      "@typescript-eslint/no-explicit-any",
    );
  });

  it("forbids floating promises", async () => {
    expect(await rules("Promise.resolve(1);\nexport {};\n")).toContain(
      "@typescript-eslint/no-floating-promises",
    );
  });

  it("requires type-only imports to be marked as such", async () => {
    const unmarked =
      'import { Thing, value } from "./other";\nexport const t: Thing = { a: value };\n';
    expect(await rules(unmarked)).toContain("@typescript-eslint/consistent-type-imports");
    const loneInline = 'import { type Thing } from "./other";\nexport type T = Thing;\n';
    expect(await rules(loneInline)).toContain("@typescript-eslint/no-import-type-side-effects");
    const clean = 'import type { Thing } from "./other";\nexport type T = Thing;\n';
    expect(await rules(clean)).toEqual([]);
  });

  it("reports unused variables unless they start with an underscore", async () => {
    expect(await rules("const unused = 1;\nexport {};\n")).toContain(
      "@typescript-eslint/no-unused-vars",
    );
    expect(await rules("const _unused = 1;\nexport {};\n")).toEqual([]);
  });

  it("allows numbers but not booleans in template literals", async () => {
    expect(await rules("export const a = (n: number) => `n=${n}`;\n")).toEqual([]);
    expect(await rules("export const b = (flag: boolean) => `flag=${flag}`;\n")).toContain(
      "@typescript-eslint/restrict-template-expressions",
    );
  });

  it("forbids non-null assertions outside tests", async () => {
    const code = "export function first(a: string[]) {\n  return a[0]!;\n}\n";
    expect(await rules(code)).toContain("@typescript-eslint/no-non-null-assertion");
    expect(await rules(code, "sample.test.ts")).not.toContain(
      "@typescript-eslint/no-non-null-assertion",
    );
  });

  it("warns on console output except in CLI folders", async () => {
    const code = "console.log(1);\nexport {};\n";
    expect(await lint(code)).toEqual([
      expect.objectContaining({ rule: "no-console", severity: 1 }),
    ]);
    expect(await lint(code, "cli/tool.ts")).toEqual([]);
  });

  it("reports eslint-disable comments that disable nothing", async () => {
    const messages = await lint("// eslint-disable-next-line no-console\nexport const a = 1;\n");
    expect(messages).toEqual([
      expect.objectContaining({
        severity: 2,
        message: expect.stringContaining("Unused") as string,
      }),
    ]);
  });
});

describe("switch exhaustiveness", { timeout: TYPE_AWARE_TIMEOUT }, () => {
  const regime = 'type Regime = "forfettario" | "ordinario" | "new";\n';

  it("is not satisfied by a default case: a new union member must get its own case", async () => {
    const withDefault =
      regime +
      "export function rate(r: Regime): number {\n" +
      "  switch (r) {\n" +
      '    case "forfettario":\n      return 1;\n' +
      '    case "ordinario":\n      return 2;\n' +
      "    default:\n      return 0;\n" +
      "  }\n}\n";
    expect(await rules(withDefault)).toContain("@typescript-eslint/switch-exhaustiveness-check");
  });

  it("accepts a switch that names every member", async () => {
    const complete =
      regime +
      "export function rate(r: Regime): number {\n" +
      "  switch (r) {\n" +
      '    case "forfettario":\n      return 1;\n' +
      '    case "ordinario":\n      return 2;\n' +
      '    case "new":\n      return 3;\n' +
      "  }\n}\n";
    expect(await rules(complete)).toEqual([]);
  });

  it("still requires a default case when the switch is not over a union", async () => {
    const code =
      "export function label(n: number): string {\n" +
      "  switch (n) {\n    case 1:\n      return 'one';\n  }\n  return 'many';\n}\n";
    expect(await rules(code)).toContain("@typescript-eslint/switch-exhaustiveness-check");
  });
});

describe("mitLibrary option", { timeout: TYPE_AWARE_TIMEOUT }, () => {
  const mit = { mitLibrary: true };
  const importing = (source: string) => `import "${source}";\n`;

  it("is off by default", async () => {
    expect(await rules(importing("@fairhour/core"))).not.toContain("no-restricted-imports");
  });

  it.each([
    "@fairhour/money",
    "@fairhour/money/rounding",
    "@fairhour/tax-core",
    "@fairhour/tax-core/testing",
    "@fairhour/tax-pack-it",
    "@fairhour/tax-pack-generic/rules",
    "@fairhour/tax-pack-template",
    "zod",
    "node:path",
    "./local",
  ])("allows importing %s", async (source) => {
    expect(await rules(importing(source), "sample.ts", mit)).not.toContain("no-restricted-imports");
  });

  it.each([
    "@fairhour/core",
    "@fairhour/core/time",
    "@fairhour/db",
    "@fairhour/api",
    "@fairhour/ui",
    "@fairhour/pdf",
    "@fairhour/config",
    "@fairhour/web",
    // Lookalikes of the allowed names are different packages.
    "@fairhour/moneyx",
    "@fairhour/money-extras",
    "@fairhour/tax-corex",
    "@fairhour/tax-pack",
    "@fairhour/tax-core-extras",
  ])("forbids importing %s", async (source) => {
    expect(await rules(importing(source), "sample.ts", mit)).toContain("no-restricted-imports");
  });

  it.each([
    ['import { a } from "@fairhour/core";\nexport const b = a;\n', "no-restricted-imports"],
    ['import type { A } from "@fairhour/core";\nexport type B = A;\n', "no-restricted-imports"],
    ['export { a } from "@fairhour/db";\n', "no-restricted-imports"],
    ['export * from "@fairhour/db";\n', "no-restricted-imports"],
    // `no-restricted-imports` ignores dynamic imports; a selector covers them.
    ['export const load = () => import("@fairhour/api");\n', "no-restricted-syntax"],
  ])("forbids every form of import, type imports included: %s", async (code, rule) => {
    expect(await rules(code, "sample.ts", mit)).toContain(rule);
  });

  it("allows dynamic imports of the allowed packages", async () => {
    const code = 'export const load = () => import("@fairhour/tax-pack-it/rules");\n';
    expect(await rules(code, "sample.ts", mit)).not.toContain("no-restricted-syntax");
  });

  it("forbids the same imports in test files", async () => {
    expect(await rules(importing("@fairhour/core"), "sample.test.ts", mit)).toContain(
      "no-restricted-imports",
    );
  });

  it("cites ADR-0002 and says what is allowed", async () => {
    const messages = await lint(importing("@fairhour/core"), "sample.ts", mit);
    const message = messages.find((m) => m.rule === "no-restricted-imports")?.message;
    expect(message).toContain("ADR-0002");
    expect(message).toContain("@fairhour/money");
    expect(message).toContain("@fairhour/tax-pack-*");
  });

  it("lets tool config files import the shared presets, and nothing else", async () => {
    const preset = importing("@fairhour/config/eslint");
    expect(await rules(preset, "vitest.config.ts", mit)).not.toContain("no-restricted-imports");
    expect(await rules(preset, "eslint.config.js", mit)).not.toContain("no-restricted-imports");
    expect(await rules(preset, "sample.ts", mit)).toContain("no-restricted-imports");
    expect(await rules(importing("@fairhour/core"), "vitest.config.ts", mit)).toContain(
      "no-restricted-imports",
    );
    expect(await rules(importing("@fairhour/config-extras"), "vitest.config.ts", mit)).toContain(
      "no-restricted-imports",
    );
  });
});

describe("moneySafety option", { timeout: TYPE_AWARE_TIMEOUT }, () => {
  const money = { moneySafety: true };
  const restricted = new Set([
    "no-restricted-globals",
    "no-restricted-properties",
    "no-restricted-syntax",
  ]);
  const restrictedRules = async (code: string, file?: string, options: Options = money) =>
    (await rules(code, file, options)).filter((rule) => restricted.has(rule ?? ""));

  it("is off by default", async () => {
    const code = 'export const a = parseFloat("1.5");\nexport const b = Math.round(a);\n';
    expect(await restrictedRules(code, "sample.ts", {})).toEqual([]);
  });

  it.each([
    ['parseFloat("1.5")', "no-restricted-globals"],
    ['Number.parseFloat("1.5")', "no-restricted-properties"],
    ['Number("1.5")', "no-restricted-syntax"],
    ['new Number("1.5")', "no-restricted-syntax"],
    ["(1.5).toFixed(2)", "no-restricted-properties"],
    ["(1.5)['toFixed'](2)", "no-restricted-properties"],
    ["Math.round(1.5)", "no-restricted-properties"],
    ["Math.floor(1.5)", "no-restricted-properties"],
    ["Math.ceil(1.5)", "no-restricted-properties"],
    ["Math.trunc(1.5)", "no-restricted-properties"],
  ])("forbids %s", async (expression, rule) => {
    expect(await restrictedRules(`export const x = ${expression};\n`)).toEqual([rule]);
  });

  it.each([
    "BigInt(1)",
    "Number.isInteger(1)",
    "Number.isSafeInteger(1)",
    "Number.MAX_SAFE_INTEGER",
    "Math.max(1, 2)",
    "Math.abs(-1)",
    "String(1)",
    "(1.5).toString()",
  ])("allows %s", async (expression) => {
    expect(await rules(`export const x = ${expression};\n`, "sample.ts", money)).toEqual([]);
  });

  it("points to @fairhour/money", async () => {
    const messages = await lint("export const x = Math.round(1.5);\n", "sample.ts", money);
    const message = messages.find((m) => m.rule === "no-restricted-properties")?.message;
    expect(message).toContain("@fairhour/money");
  });

  it("allows Number(...) in test files, and only that", async () => {
    expect(await restrictedRules("export const x = Number(1n);\n", "sample.test.ts")).toEqual([]);
    const forbidden = [
      "parseFloat('1')",
      "Number.parseFloat('1')",
      "(1.5).toFixed(2)",
      "Math.round(1.5)",
    ];
    for (const expression of forbidden) {
      expect(
        await restrictedRules(`export const x = ${expression};\n`, "sample.test.ts"),
        expression,
      ).toHaveLength(1);
    }
  });

  it("keeps both syntax restrictions when combined with mitLibrary", async () => {
    const both = { moneySafety: true, mitLibrary: true };
    const code =
      'export const a = Number("1");\nexport const b = () => import("@fairhour/core");\n';
    const syntax = (file: string) =>
      lint(code, file, both).then((messages) =>
        messages.filter((m) => m.rule === "no-restricted-syntax"),
      );
    expect(await syntax("sample.ts")).toHaveLength(2);
    // Test files may call Number(...), but the license boundary still applies to them.
    expect(await syntax("sample.test.ts")).toHaveLength(1);
  });

  it("combines with mitLibrary", async () => {
    const both = { moneySafety: true, mitLibrary: true };
    const code = 'import "@fairhour/core";\nexport const x = Math.round(1.5);\n';
    expect(await rules(code, "sample.ts", both)).toEqual(
      expect.arrayContaining(["no-restricted-imports", "no-restricted-properties"]),
    );
  });
});
