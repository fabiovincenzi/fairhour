import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL(".", import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__snapshots__" ? [] : sourceFiles(path);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

/** Everything the package ships. */
const files = sourceFiles(SRC);

describe("purity (packages/tax-core/CLAUDE.md)", () => {
  it("finds the source files", () => {
    expect(files.map((path) => relative(SRC, path))).toContain("index.ts");
    expect(files.length).toBeGreaterThan(10);
  });

  it.each([
    ["vitest", /from\s+["']vitest/],
    ["fast-check", /from\s+["']fast-check/],
    ["node:* modules", /from\s+["']node:/],
    ["the conformance entry", /tax-core\/conformance/],
    ["Date", /\bDate\b/],
    ["Math.random()", /Math\.random/],
    ["process", /\bprocess\./],
    ["fetch", /\bfetch\s*\(/],
    ["require", /\brequire\s*\(/],
    ["floats on amounts", /\b(?:parseFloat|parseInt|toFixed|Number\s*\()/],
  ])("the package never uses %s", (_label, pattern) => {
    const offenders = files.filter((path) => pattern.test(readFileSync(path, "utf8")));
    expect(offenders.map((path) => relative(SRC, path))).toEqual([]);
  });
});
