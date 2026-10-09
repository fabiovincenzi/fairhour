import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.join(import.meta.dirname, "../tailwind/theme.css"), "utf8");

/** Declarations (`--name: value`) of the first top-level block that starts with `selector`. */
function declarations(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  expect(start, `block "${selector}" exists`).toBeGreaterThanOrEqual(0);
  const end = css.indexOf("\n}", start);
  const block = css.slice(start, end);
  const result = new Map<string, string>();
  for (const match of block.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)) {
    result.set(match[1] ?? "", (match[2] ?? "").replace(/\s+/g, " ").trim());
  }
  return result;
}

const palette = declarations("@theme static");

function resolver(mode: Map<string, string>) {
  const resolve = (name: string): string => {
    const value = mode.get(`--${name}`) ?? palette.get(`--${name}`);
    if (value === undefined) throw new Error(`Undefined variable --${name}`);
    const reference = /^var\(--([\w-]+)\)$/.exec(value);
    return reference?.[1] ? resolve(reference[1]) : value;
  };
  return resolve;
}

function luminance(hex: string): number {
  expect(hex).toMatch(/^#[0-9a-f]{6}$/);
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light = 0, dark = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const statuses = ["success", "warning", "danger", "info"] as const;

/** [foreground, background, minimum contrast ratio]. 4.5 = WCAG 1.4.3 text, 3 = 1.4.11 UI. */
const pairs: [string, string, number][] = [
  ["foreground", "background", 4.5],
  ["card-foreground", "card", 4.5],
  ["popover-foreground", "popover", 4.5],
  ["primary-foreground", "primary", 4.5],
  ["secondary-foreground", "secondary", 4.5],
  ["muted-foreground", "muted", 4.5],
  ["muted-foreground", "background", 4.5],
  ["accent-foreground", "accent", 4.5],
  ["destructive-foreground", "destructive", 4.5],
  ["primary", "background", 4.5],
  ["primary", "card", 4.5],
  ["input", "background", 3],
  ["input", "card", 3],
  ["ring", "background", 3],
  ["ring", "card", 3],
  ...statuses.flatMap((status): [string, string, number][] => [
    [`${status}-foreground`, status, 4.5],
    [`${status}-subtle-foreground`, `${status}-subtle`, 4.5],
    [status, "background", 4.5],
    [status, "card", 4.5],
  ]),
];

describe.each([
  ["light", ":root"],
  ["dark", ".dark"],
])("theme.css (%s)", (_mode, selector) => {
  const resolve = resolver(declarations(selector));

  it.each(pairs)("%s on %s meets %s:1 contrast", (foreground, background, minimum) => {
    expect(contrast(resolve(foreground), resolve(background))).toBeGreaterThanOrEqual(minimum);
  });
});

describe("theme.css tokens", () => {
  it("defines the brand teal", () => {
    expect(palette.get("--color-brand-700")).toBe("#0f766e");
  });

  it("defines every shade of every palette", () => {
    const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
    for (const name of ["brand", "neutral", ...statuses]) {
      for (const shade of shades) {
        expect(palette.has(`--color-${name}-${shade}`), `--color-${name}-${shade}`).toBe(true);
      }
    }
  });

  it("defines the same semantic variables in light and dark", () => {
    const light = [...declarations(":root").keys()].filter((name) => name !== "--radius").sort();
    const dark = [...declarations(".dark").keys()].sort();
    expect(dark).toEqual(light);
  });

  it("declares font stacks and a radius", () => {
    expect(palette.get("--font-sans")).toContain("system-ui");
    expect(palette.get("--font-mono")).toContain("monospace");
    expect(declarations(":root").get("--radius")).toBe("0.5rem");
  });
});
