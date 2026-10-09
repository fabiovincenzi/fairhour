/**
 * What the content sync copies from the repository into the docs site, and where it goes.
 *
 * The repository's Markdown is the single source of truth: everything listed here is generated
 * into gitignored folders of `src/content/docs` and must never be edited there. Add a folder to
 * the root `.gitignore` whenever a new `target` appears below (a test checks it); Prettier 3 reads
 * `.gitignore` too, so the generated pages are not formatted or checked.
 */
import { renderEnvReference } from "./env.ts";
import type { DirectorySource, FileSource } from "./sync.ts";
import { adrSidebarLabel, labelBeforeColon, labelWithoutParentheses } from "./transform.ts";

/** ADRs by number, with the template last (`order` defaults to 0 for the index page). */
function adrOrder(name: string): number | undefined {
  const number = /^(\d{4})-/.exec(name)?.[1];
  if (number === undefined) return undefined;
  return number === "0000" ? 10_000 : Number(number);
}

/** Contributing guides in a fixed order after the index and CONTRIBUTING.md (see `FILES`). */
const CONTRIBUTING_ORDER: Readonly<Record<string, number>> = {
  "tax-packs": 2,
  translations: 3,
};

export const DIRECTORIES: readonly DirectorySource[] = [
  { dir: "docs/adr", target: "adr", sidebarLabel: adrSidebarLabel, order: adrOrder },
  { dir: "docs/design", target: "design", sidebarLabel: labelBeforeColon },
  { dir: "docs/maintainers", target: "maintainers" },
  {
    dir: "docs/contributing",
    target: "contributing",
    order: (name) => CONTRIBUTING_ORDER[name],
  },
  {
    dir: "docs/tax-packs",
    target: "tax-packs",
    // The section's landing page is hand-written (`src/content/docs/tax-packs/index.md`).
    readmeName: "overview",
    sidebarLabel: labelWithoutParentheses,
  },
];

export const FILES: readonly FileSource[] = [
  { file: "CONTRIBUTING.md", route: "contributing/guide", order: 1 },
  { file: "GOVERNANCE.md", route: "contributing/governance", order: 90 },
  { file: "SECURITY.md", route: "contributing/security", order: 91 },
  // The environment reference is generated from the example file: it cannot drift.
  {
    file: ".env.example",
    route: "self-hosting/environment-variables",
    order: 10,
    render: renderEnvReference,
  },
];

/** Hand-written pages that sit next to generated ones, in folders the sync empties. */
export const HANDWRITTEN: readonly string[] = ["tax-packs/index.md", "self-hosting/index.md"];
