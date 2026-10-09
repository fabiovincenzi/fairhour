import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const tsconfigDir = path.join(import.meta.dirname, "../tsconfig");

function load(name: string): { options: ts.CompilerOptions; errors: ts.Diagnostic[] } {
  const file = path.join(tsconfigDir, name);
  const read = ts.readConfigFile(file, (f) => ts.sys.readFile(f));
  expect(read.error).toBeUndefined();
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, tsconfigDir, undefined, file);
  // TS18003: "No inputs were found": presets intentionally have no `include`.
  return { options: parsed.options, errors: parsed.errors.filter((e) => e.code !== 18003) };
}

const presets = ["base.json", "library.json", "react-library.json", "nextjs.json", "node.json"];

describe.each(presets)("tsconfig/%s", (name) => {
  it("parses without errors", () => {
    expect(load(name).errors).toEqual([]);
  });

  it("keeps every strictness flag from the base config", () => {
    expect(load(name).options).toMatchObject({
      strict: true,
      noUncheckedIndexedAccess: true,
      exactOptionalPropertyTypes: true,
      noImplicitOverride: true,
      noFallthroughCasesInSwitch: true,
      verbatimModuleSyntax: true,
      isolatedModules: true,
      skipLibCheck: true,
      noEmit: true,
      target: ts.ScriptTarget.ES2023,
    });
  });
});

describe("tsconfig/base.json", () => {
  it("uses bundler resolution", () => {
    expect(load("base.json").options).toMatchObject({
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      resolveJsonModule: true,
    });
  });
});

describe("tsconfig/library.json", () => {
  it("is DOM-free, declares no ambient types and emits declarations", () => {
    const { options } = load("library.json");
    expect(options.types).toEqual([]);
    expect(options.jsx).toBeUndefined();
    expect(options.lib).toEqual(["lib.es2023.d.ts"]);
    expect(options.declaration).toBe(true);
  });
});

describe("tsconfig/react-library.json", () => {
  it("adds the automatic JSX runtime and DOM libs", () => {
    const { options } = load("react-library.json");
    expect(options.jsx).toBe(ts.JsxEmit.ReactJSX);
    expect(options.lib).toEqual(["lib.es2023.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"]);
  });
});

describe("tsconfig/nextjs.json", () => {
  it("uses the Next.js app settings", () => {
    const { options } = load("nextjs.json");
    expect(options.jsx).toBe(ts.JsxEmit.Preserve);
    expect(options.incremental).toBe(true);
    expect(options.allowJs).toBe(true);
    expect(options.plugins).toEqual([{ name: "next" }]);
    expect(options.lib).toContain("lib.dom.d.ts");
  });
});

describe("tsconfig/node.json", () => {
  it("supports Node's native TypeScript type stripping", () => {
    expect(load("node.json").options).toMatchObject({
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      allowImportingTsExtensions: true,
      erasableSyntaxOnly: true,
      types: ["node"],
    });
  });
});
