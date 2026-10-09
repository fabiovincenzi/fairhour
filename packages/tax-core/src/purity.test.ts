import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import packageJson from "../package.json" with { type: "json" };
import { ENGINE_VERSION } from "./version";

const SRC = fileURLToPath(new URL(".", import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

/** Everything the main entry point ships: all of src except the conformance entry. */
const mainFiles = sourceFiles(SRC).filter((path) => !relative(SRC, path).startsWith("conformance"));

describe("purity (design G5, section 1)", () => {
  it("ENGINE_VERSION equals the package.json version", () => {
    expect(ENGINE_VERSION).toBe(packageJson.version);
  });

  it("finds the source files", () => {
    expect(mainFiles.length).toBeGreaterThan(20);
    expect(mainFiles.some((path) => path.endsWith("index.ts"))).toBe(true);
  });

  it.each([
    ["vitest", /from\s+["']vitest/],
    ["fast-check", /from\s+["']fast-check/],
    ["node:* modules", /from\s+["']node:/],
    ["the conformance entry", /from\s+["'][./]*conformance/],
    ["Date.now()", /Date\.now\s*\(/],
    ["new Date() without an input", /new Date\(\s*\)/],
    ["Math.random()", /Math\.random/],
    ["process", /\bprocess\./],
    ["fetch", /\bfetch\s*\(/],
    ["require", /\brequire\s*\(/],
  ])("the main entry never uses %s", (_label, pattern) => {
    const offenders = mainFiles.filter((path) => pattern.test(readFileSync(path, "utf8")));
    expect(offenders.map((path) => relative(SRC, path))).toEqual([]);
  });

  it("only the conformance fixture loader reads files", () => {
    const conformance = sourceFiles(join(SRC, "conformance"));
    const readers = conformance.filter((path) =>
      /from\s+["']node:fs/.test(readFileSync(path, "utf8")),
    );
    expect(readers.map((path) => relative(SRC, path))).toEqual(["conformance/fixtures.ts"]);
  });
});
