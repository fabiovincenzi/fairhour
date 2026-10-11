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
/** Every non-test source file, the conformance entry included (it must be deterministic too). */
const allFiles = sourceFiles(SRC);

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
    ["fetch", /\bfetch\s*\(/],
    ["require", /\brequire\s*\(/],
  ])("the main entry never uses %s", (_label, pattern) => {
    const offenders = mainFiles.filter((path) => pattern.test(readFileSync(path, "utf8")));
    expect(offenders.map((path) => relative(SRC, path))).toEqual([]);
  });

  /** Clocks, randomness and the environment: forbidden everywhere, conformance entry included. */
  const IMPURE: readonly [string, RegExp][] = [
    ["Date.now()", /\bDate\s*\.\s*now\b/],
    ["new Date() without an input", /\bnew\s+Date\s*\(\s*\)/],
    // `Date(...)` called without `new` returns the current time as a string, whatever its arguments.
    ["Date() without new", /(?<![\w$.]|\bnew\s+)Date\s*\(/],
    ["Math.random()", /\bMath\s*\.\s*random\b/],
    ["performance.now()", /\bperformance\s*\.\s*now\b/],
    ["crypto.getRandomValues()", /\bgetRandomValues\b/],
    ["crypto.randomUUID()", /\brandomUUID\b/],
    ["process", /\bprocess\s*\./],
    ["globalThis.process", /\bglobalThis\s*(?:\.\s*|\[\s*["'`])process\b/],
    ["import.meta.env", /\bimport\s*\.\s*meta\s*\.\s*env\b/],
    [
      "the host time zone (Intl.DateTimeFormat().resolvedOptions().timeZone)",
      /\bresolvedOptions\s*\(\s*\)\s*\.\s*timeZone\b/,
    ],
  ];

  it.each(IMPURE)("no source file uses %s", (_label, pattern) => {
    const offenders = allFiles.filter((path) => pattern.test(readFileSync(path, "utf8")));
    expect(offenders.map((path) => relative(SRC, path))).toEqual([]);
  });

  it.each<[string, string]>([
    ["Date.now()", "const t = Date.now();"],
    ["new Date() without an input", "const d = new Date();"],
    ["Date() without new", "const text = Date();"],
    ["Date() without new", "const text = Date(2024, 1, 1);"],
    ["Math.random()", "const r = Math.random();"],
    ["performance.now()", "const t = performance.now();"],
    ["crypto.getRandomValues()", "crypto.getRandomValues(buffer);"],
    ["crypto.randomUUID()", "const id = globalThis.crypto.randomUUID();"],
    ["process", "const env = process.env.TZ;"],
    ["globalThis.process", "const p = globalThis.process;"],
    ["globalThis.process", 'const p = globalThis["process"];'],
    ["import.meta.env", "const mode = import.meta.env.MODE;"],
    [
      "the host time zone (Intl.DateTimeFormat().resolvedOptions().timeZone)",
      "const zone = new Intl.DateTimeFormat().resolvedOptions().timeZone;",
    ],
  ])("the %s pattern catches %j", (label, code) => {
    const pattern = IMPURE.find(([name]) => name === label)?.[1];
    expect(pattern?.test(code)).toBe(true);
  });

  it.each([
    "const utc = Date.UTC(year, month - 1, day);",
    "const date = new Date(Date.UTC(year, month - 1, day));",
    "const result = new Date((dayNumber(date) + days) * MS_PER_DAY);",
    "export function isIsoDate(value: string): value is IsoDate {}",
    "return formatDate(param.value, locale, key);",
    'new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" })',
  ])("the patterns allow %j", (code) => {
    expect(IMPURE.filter(([, pattern]) => pattern.test(code)).map(([label]) => label)).toEqual([]);
  });

  it("only the conformance fixture loader reads files", () => {
    const conformance = sourceFiles(join(SRC, "conformance"));
    const readers = conformance.filter((path) =>
      /from\s+["']node:fs/.test(readFileSync(path, "utf8")),
    );
    expect(readers.map((path) => relative(SRC, path))).toEqual(["conformance/fixtures.ts"]);
  });
});
