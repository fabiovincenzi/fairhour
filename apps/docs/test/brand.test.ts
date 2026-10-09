import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string): string =>
  readFileSync(path.resolve(import.meta.dirname, file), "utf8");

/** `--<prefix>-<step>: #hex;` declarations, keyed by step. */
function scale(css: string, prefix: string): Map<string, string> {
  const steps = new Map<string, string>();
  for (const match of css.matchAll(
    new RegExp(`--${prefix}-(\\d+):\\s*(#[0-9a-f]{6})\\s*;`, "gi"),
  )) {
    const [, step = "", value = ""] = match;
    steps.set(step, value.toLowerCase());
  }
  return steps;
}

describe("docs brand colours", () => {
  const docs = read("../src/styles/brand.css");
  const tokens = read("../../../packages/config/tailwind/theme.css");

  it("copy the brand teal tokens of the shared Tailwind theme", () => {
    const docsScale = scale(docs, "fh-brand");
    const themeScale = scale(tokens, "color-brand");
    expect(docsScale.size).toBeGreaterThan(0);
    for (const [step, value] of docsScale) {
      expect(themeScale.get(step), `--color-brand-${step}`).toBe(value);
    }
  });

  it("map Starlight's accent colours in light and dark mode", () => {
    for (const name of ["accent-low", "accent", "accent-high"]) {
      expect(docs.match(new RegExp(`--sl-color-${name}:`, "g"))).toHaveLength(2);
    }
  });
});
