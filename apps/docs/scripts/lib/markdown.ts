/**
 * Pure Markdown helpers for the content sync: frontmatter, the first `# H1`, and GitHub alerts.
 * No file system access, no dependencies, so everything here is unit-testable.
 */

/** A Markdown document split into its YAML frontmatter (without the `---` fences) and its body. */
export interface ParsedMarkdown {
  /** The raw YAML between the fences, or `null` when the document has none. */
  readonly frontmatter: string | null;
  readonly body: string;
}

/** The first level-1 heading of a document, and the body without it. */
export interface ExtractedTitle {
  /** Plain text of the heading, or `null` when the body has no `# H1`. */
  readonly title: string | null;
  readonly body: string;
}

const FRONTMATTER = /^---[ \t]*\n(?:([\s\S]*?)\n)?---[ \t]*(?:\n|$)/;
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
const ATX_H1 = /^ {0,3}#[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
const ALERT_MARKER = /^ {0,3}>[ \t]*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*$/i;

/** Starlight aside type (and optional title) for each GitHub alert type. */
const ALERT_ASIDES: Readonly<Record<string, string>> = {
  NOTE: "note",
  TIP: "tip",
  IMPORTANT: "note[Important]",
  WARNING: "caution[Warning]",
  CAUTION: "danger[Caution]",
};

/** Converts Windows and old Mac line endings to `\n`. */
export function normalizeNewlines(source: string): string {
  return source.replace(/\r\n?/g, "\n");
}

/** Splits a document (with `\n` line endings) into frontmatter and body. */
export function splitFrontmatter(source: string): ParsedMarkdown {
  const match = FRONTMATTER.exec(source);
  if (!match) return { frontmatter: null, body: source };
  return { frontmatter: match[1] ?? "", body: source.slice(match[0].length) };
}

/** True when the YAML has a top-level `key:` entry (indented keys do not count). */
export function hasFrontmatterKey(frontmatter: string, key: string): boolean {
  return frontmatter.split("\n").some((line) => line.startsWith(`${key}:`));
}

/**
 * Runs `visit` for every line of `body` that is not inside a fenced code block, and keeps the
 * other lines as they are. `visit` returns the replacement lines.
 */
export function mapLinesOutsideFences(
  body: string,
  visit: (line: string, index: number, lines: readonly string[]) => readonly string[],
): string {
  const lines = body.split("\n");
  const output: string[] = [];
  let fence: { readonly char: string; readonly length: number } | null = null;
  for (const [index, line] of lines.entries()) {
    if (fence === null) {
      const marker = FENCE_OPEN.exec(line)?.[1];
      if (marker === undefined) {
        output.push(...visit(line, index, lines));
      } else {
        fence = { char: marker.charAt(0), length: marker.length };
        output.push(line);
      }
      continue;
    }
    output.push(line);
    const marker = FENCE_CLOSE.exec(line)?.[1];
    if (marker?.startsWith(fence.char) === true && marker.length >= fence.length) fence = null;
  }
  return output.join("\n");
}

/** Reduces the inline Markdown of a heading to plain text (links, code, emphasis, HTML). */
export function plainText(markdown: string): string {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, "$1")
    .replace(/`+([^`]*)`+/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/\*\*(\S(?:.*?\S)?)\*\*/g, "$1")
    .replace(/\*(\S(?:.*?\S)?)\*/g, "$1")
    .replace(/(?<![A-Za-z0-9])__(\S(?:.*?\S)?)__(?![A-Za-z0-9])/g, "$1")
    .replace(/(?<![A-Za-z0-9])_(\S(?:.*?\S)?)_(?![A-Za-z0-9])/g, "$1")
    .replace(/\\([\\`*_{}[\]()#+\-.!<>])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Finds the first ATX `# H1` outside code fences, returns its plain text and removes the line
 * (and the blank line that would otherwise be left doubled). Setext headings are not handled.
 */
export function extractTitle(body: string): ExtractedTitle {
  const found: { title: string | null; line: number } = { title: null, line: -1 };
  const withoutTitle = mapLinesOutsideFences(body, (line, index) => {
    const heading = found.title === null ? ATX_H1.exec(line)?.[1] : undefined;
    if (heading === undefined) return [line];
    found.title = plainText(heading);
    found.line = index;
    return [];
  });
  if (found.title === null) return { title: null, body };
  const lines = withoutTitle.split("\n");
  // A blank line that followed the heading would now sit next to another blank line (or at the
  // very top of the document): drop it.
  const previous = found.line === 0 ? "" : lines[found.line - 1];
  if (lines[found.line]?.trim() === "" && previous?.trim() === "") lines.splice(found.line, 1);
  return { title: found.title, body: lines.join("\n") };
}

/** Humanizes a file name: `release-process` becomes `Release process`. */
export function titleFromFilename(name: string): string {
  const words = name
    .replace(/\.[^./]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim();
  return words === "" ? name : words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Turns GitHub alerts (`> [!NOTE]` followed by a blockquote) into Starlight asides
 * (`:::note ... :::`), which GitHub-flavoured Markdown renders as plain blockquotes otherwise.
 */
export function convertAlerts(body: string): string {
  let skipUntil = -1;
  return mapLinesOutsideFences(body, (line, index, lines) => {
    if (index < skipUntil) return [];
    const type = ALERT_MARKER.exec(line)?.[1]?.toUpperCase();
    const aside = type === undefined ? undefined : ALERT_ASIDES[type];
    if (aside === undefined) return [line];
    const content: string[] = [];
    let end = index + 1;
    while (end < lines.length && /^ {0,3}>/.test(lines[end] ?? "")) {
      content.push((lines[end] ?? "").replace(/^ {0,3}>[ \t]?/, ""));
      end += 1;
    }
    skipUntil = end;
    return [`:::${aside}`, ...content, ":::"];
  });
}
