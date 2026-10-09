import path from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";
import { CODE_FILES, DEFAULT_IGNORES, createConfig } from "../eslint.js";

const fixtureDir = path.join(import.meta.dirname, "fixtures/lint");

async function lint(code: string, file = "sample.ts") {
  const eslint = new ESLint({
    cwd: fixtureDir,
    overrideConfigFile: true,
    overrideConfig: createConfig({ tsconfigRootDir: fixtureDir }),
  });
  const [result] = await eslint.lintText(code, { filePath: path.join(fixtureDir, file) });
  return (result?.messages ?? []).map((m) => ({
    rule: m.ruleId,
    severity: m.severity,
    message: m.message,
  }));
}

async function rules(code: string, file?: string) {
  return (await lint(code, file)).map((m) => m.rule);
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

  it("lets a package allow console output everywhere", async () => {
    const eslint = new ESLint({
      cwd: fixtureDir,
      overrideConfigFile: true,
      overrideConfig: createConfig({ tsconfigRootDir: fixtureDir, allowConsoleIn: CODE_FILES }),
    });
    const [result] = await eslint.lintText("console.log(1);\nexport {};\n", {
      filePath: path.join(fixtureDir, "sample.ts"),
    });
    expect(result?.messages).toEqual([]);
  });
});

describe("shared rules (type-checked)", () => {
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
