/**
 * The `TEMPLATE:` markers. In `@fairhour/tax-pack-template`, this test pins the files that carry
 * one, so that no marker is lost or added unnoticed. In a pack copied from the template (any other
 * package name), it fails until every marker and every mention of the fictional Exampleland is
 * gone: the copy is not finished before that. Keep it in your pack until the first release, then
 * delete it.
 */
import { readdirSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import packageJson from "../package.json" with { type: "json" };

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SELF = basename(fileURLToPath(import.meta.url));

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "__snapshots__" ? [] : files(path);
    return entry.name.endsWith(".ts") && entry.name !== SELF ? [path] : [];
  });
}

const code = [...files(join(ROOT, "src")), ...files(join(ROOT, "test"))];
const matching = (pattern: RegExp): string[] =>
  code
    .filter((path) => pattern.test(readFileSync(path, "utf8")))
    .map((path) => relative(ROOT, path).split("\\").join("/"))
    .sort();

const MARKER = /\bTEMPLATE:/;

describe("TEMPLATE markers", () => {
  if (packageJson.name === "@fairhour/tax-pack-template") {
    it("mark every file a new pack changes", () => {
      expect(matching(MARKER)).toEqual([
        "src/config.test.ts",
        "src/config.ts",
        "src/conformance.test.ts",
        "src/groups.ts",
        "src/index.test.ts",
        "src/index.ts",
        "src/messages/en.ts",
        "src/messages/eo.ts",
        "src/messages/index.ts",
        "src/options.ts",
        "src/parameters.test.ts",
        "src/parameters.ts",
        "src/property.test.ts",
        "src/readme.test.ts",
        "src/rounding.ts",
        "src/rules/classify-lines.test.ts",
        "src/rules/classify-lines.ts",
        "src/rules/small-business.test.ts",
        "src/rules/small-business.ts",
        "src/rules/vat.test.ts",
        "src/rules/vat.ts",
        "src/rules/withholding.test.ts",
        "src/rules/withholding.ts",
        "src/sources.ts",
        "src/types.ts",
        "src/validate-input.test.ts",
        "src/validate-input.ts",
        "test/conformance-data.ts",
        "test/helpers.ts",
      ]);
    });
  } else {
    it("has no TEMPLATE marker left", () => {
      expect(matching(MARKER)).toEqual([]);
    });

    it("no longer mentions the fictional Exampleland", () => {
      expect(matching(/Exampleland/)).toEqual([]);
    });
  }
});
