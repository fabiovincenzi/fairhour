/**
 * Turns one repository Markdown file into a page of the docs content collection: derives the
 * frontmatter, drops the H1 (Starlight renders the title itself), converts GitHub alerts and
 * rewrites links. Pure: text in, text out.
 */
import { rewriteLinks, type LinkContext } from "./links.ts";
import {
  convertAlerts,
  extractTitle,
  hasFrontmatterKey,
  normalizeNewlines,
  splitFrontmatter,
  titleFromFilename,
} from "./markdown.ts";

export interface DocumentOptions extends LinkContext {
  /** Sidebar position of the page; pages without one are sorted by their slug. */
  readonly order?: number;
  /** Derives a shorter sidebar label from the page title; `undefined` keeps the title. */
  readonly sidebarLabel?: (title: string) => string | undefined;
}

/**
 * The sidebar label for ADRs: `ADR-0002: Licensing: AGPL-3.0 …` becomes `ADR-0002: Licensing`,
 * and the template (`ADR-NNNN: …`) becomes `Template`.
 */
export function adrSidebarLabel(title: string): string | undefined {
  const match = /^ADR-(\d+|N+): ([^:]+)/.exec(title);
  if (match?.[1] === undefined || match[2] === undefined) return undefined;
  return match[1].startsWith("N") ? "Template" : `ADR-${match[1]}: ${match[2].trim()}`;
}

/** `Tax engine design: money, tax-core and more` becomes `Tax engine design`. */
export function labelBeforeColon(title: string): string | undefined {
  const label = (title.split(":")[0] ?? "").trim();
  return label === "" || label === title ? undefined : label;
}

/** `Italy tax pack (@fairhour/tax-pack-it)` becomes `Italy tax pack`. */
export function labelWithoutParentheses(title: string): string | undefined {
  const label = title.replace(/\s*\([^()]*\)\s*$/, "").trim();
  return label === "" || label === title ? undefined : label;
}

/** A YAML double-quoted scalar. JSON strings are valid YAML, so no YAML library is needed. */
function yamlString(value: string): string {
  return JSON.stringify(value);
}

/** The `editUrl` that sends the "Edit page" link to the original file on GitHub. */
export function editUrl(sourcePath: string, repo: LinkContext["repo"]): string {
  return `${repo.url}/edit/${repo.branch}/${sourcePath}`;
}

function sidebarLines(label: string | undefined, order: number | undefined): string[] {
  const entries: string[] = [];
  if (label !== undefined) entries.push(`  label: ${yamlString(label)}`);
  if (order !== undefined) entries.push(`  order: ${order}`);
  return entries.length === 0 ? [] : ["sidebar:", ...entries];
}

/**
 * Converts the text of `options.sourcePath` into the text of the generated page.
 *
 * Existing frontmatter is kept; `title`, `sidebar` and `editUrl` are only added when missing.
 * Without a `title` in the frontmatter, the page title comes from the first `# H1` (or from the
 * file name when there is none). The H1 is removed either way, because Starlight renders the
 * title itself.
 */
export function transformDocument(source: string, options: DocumentOptions): string {
  const { frontmatter, body: rawBody } = splitFrontmatter(normalizeNewlines(source));
  const { title: heading, body: withoutHeading } = extractTitle(rawBody);
  const body = rewriteLinks(convertAlerts(withoutHeading), options).replace(/^\n+/, "");

  const existing = frontmatter ?? "";
  const lines = [`# Generated from ${options.sourcePath} by scripts/sync-content.ts. Do not edit.`];
  if (existing.trim() !== "") lines.push(existing);

  let derivedTitle: string | undefined;
  if (!hasFrontmatterKey(existing, "title")) {
    derivedTitle = heading ?? titleFromFilename(options.sourcePath.split("/").pop() ?? "");
    lines.push(`title: ${yamlString(derivedTitle)}`);
  }
  if (!hasFrontmatterKey(existing, "sidebar")) {
    const label = derivedTitle === undefined ? undefined : options.sidebarLabel?.(derivedTitle);
    lines.push(...sidebarLines(label, options.order));
  }
  if (!hasFrontmatterKey(existing, "editUrl")) {
    lines.push(`editUrl: ${yamlString(editUrl(options.sourcePath, options.repo))}`);
  }
  return `---\n${lines.join("\n")}\n---\n\n${body.trimEnd()}\n`;
}
