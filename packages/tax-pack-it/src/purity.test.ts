/**
 * The pack is a pure function of (pack, config, input): no I/O, no clock, no randomness, no
 * environment, no floats on amounts (packages/tax-core/CLAUDE.md). Checked on every source file
 * the package ships; the lint configuration (mitLibrary, moneySafety) enforces the same rules.
 */
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

/** Everything the package ships, plus the conformance data (plain data, no imports). */
const files = sourceFiles(SRC);

describe("purity (packages/tax-core/CLAUDE.md)", () => {
  it("finds the source files", () => {
    const names = files.map((path) => relative(SRC, path));
    expect(names).toContain("index.ts");
    expect(names).toContain(join("rules", "stamp-duty.ts"));
    expect(files.length).toBeGreaterThan(20);
  });

  it.each([
    ["vitest", /from\s+["']vitest/],
    ["fast-check", /from\s+["']fast-check/],
    ["node:* modules", /from\s+["']node:/],
    ["the conformance entry", /tax-core\/conformance/],
    ["Date", /\bDate\b/],
    ["Math.random()", /Math\.random/],
    ["performance", /\bperformance\./],
    ["crypto", /\bcrypto\./],
    ["process", /\bprocess\./],
    ["import.meta.env", /import\.meta\.env/],
    ["fetch", /\bfetch\s*\(/],
    ["require", /\brequire\s*\(/],
    ["floats on amounts", /\b(?:parseFloat|parseInt|toFixed|Number\s*\()/],
    ["Math rounding", /Math\.(?:round|floor|ceil|trunc)/],
  ])("the package never uses %s", (_label, pattern) => {
    const offenders = files.filter((path) => pattern.test(readFileSync(path, "utf8")));
    expect(offenders.map((path) => relative(SRC, path))).toEqual([]);
  });
});
