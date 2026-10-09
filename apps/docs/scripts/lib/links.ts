/**
 * Link rewriting for synced Markdown. Documents in the repository link to each other and to code
 * with relative paths that work on GitHub. On the docs site, links between synced documents must
 * become site routes (under the base path) and links to everything else must point at GitHub.
 */
import { posix } from "node:path";
import { mapLinesOutsideFences } from "./markdown.ts";
import type { RepoInfo } from "./site.ts";

export interface LinkContext {
  /** Repository-relative POSIX path of the document being converted, e.g. `docs/adr/README.md`. */
  readonly sourcePath: string;
  /**
   * Repository-relative path of every synced Markdown file, mapped to its route on the site
   * (`adr/0001-technology-stack`, without leading or trailing slash).
   */
  readonly routes: ReadonlyMap<string, string>;
  /** Base path of the site without a trailing slash, for example `/fairhour`. */
  readonly base: string;
  readonly repo: RepoInfo;
}

interface Edit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const CODE_SPAN = /(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g;
/** The `](target` part of an inline link or image; group 2 is the target. */
const INLINE_LINK = /\]\(([ \t]*)(<[^<>\n]*>|(?:[^\s()<>]|\([^\s()]*\))+)/dg;
/** A link reference definition: `[label]: target`. */
const REFERENCE_DEFINITION = /^( {0,3}\[[^\]]+\]:[ \t]+)(<[^<>\n]*>|\S+)/d;
/** `href="..."` and `src="..."` in raw HTML; group 1 is the attribute, 2 or 3 the value. */
const HTML_ATTRIBUTE = /\b(href|src)=(?:"([^"]*)"|'([^']*)')/dg;

/** Resolves `pathPart` against the document's directory; `null` when it leaves the repository. */
function resolveRepoPath(sourcePath: string, pathPart: string): string | null {
  const joined = pathPart.startsWith("/")
    ? pathPart.slice(1)
    : posix.join(posix.dirname(sourcePath), pathPart);
  const normalized = posix.normalize(joined).replace(/\/$/, "");
  if (normalized === ".." || normalized.startsWith("../")) return null;
  return normalized === "." ? "" : normalized;
}

/**
 * Rewrites one link target found in a synced document.
 *
 * - External URLs, `mailto:` links, same-page anchors and links that already carry the base path
 *   are returned unchanged.
 * - A link to another synced document becomes `<base>/<route>/` (keeping the `#fragment`). A link
 *   to a directory that has a synced `README.md` becomes that section's index.
 * - Anything else that resolves inside the repository becomes a GitHub URL on the configured
 *   branch: `blob` for files, `tree` for directories (trailing slash), `raw` for images.
 */
export function rewriteTarget(target: string, context: LinkContext, isImage = false): string {
  if (target === "" || target.startsWith("#") || target.startsWith("//") || SCHEME.test(target)) {
    return target;
  }
  if (target.startsWith(`${context.base}/`)) return target;

  const hashAt = target.indexOf("#");
  const hash = hashAt === -1 ? "" : target.slice(hashAt);
  const withoutHash = hashAt === -1 ? target : target.slice(0, hashAt);
  const queryAt = withoutHash.indexOf("?");
  const query = queryAt === -1 ? "" : withoutHash.slice(queryAt);
  const pathPart = queryAt === -1 ? withoutHash : withoutHash.slice(0, queryAt);
  if (pathPart === "") return target;

  const resolved = resolveRepoPath(context.sourcePath, pathPart);
  if (resolved === null) return target;

  const route =
    context.routes.get(resolved) ?? context.routes.get(posix.join(resolved, "README.md"));
  if (route !== undefined) return `${context.base}/${route}/${hash}`;

  if (resolved === "") return `${context.repo.url}${hash}`;
  const kind = isImage ? "raw" : pathPart.endsWith("/") ? "tree" : "blob";
  return `${context.repo.url}/${kind}/${context.repo.branch}/${resolved}${query}${hash}`;
}

/** Replaces code spans by filler of the same length, so patterns cannot match inside them. */
function maskCodeSpans(line: string): string {
  return line.replace(CODE_SPAN, (span) => "\u0000".repeat(span.length));
}

/** True when the `]` at `closeIndex` closes the label of an image (`![label](...)`). */
function closesImageLabel(masked: string, closeIndex: number): boolean {
  let depth = 0;
  for (let index = closeIndex; index >= 0; index -= 1) {
    const char = masked.charAt(index);
    if (char === "]") depth += 1;
    if (char === "[") {
      depth -= 1;
      if (depth === 0) return masked.charAt(index - 1) === "!";
    }
  }
  return false;
}

/** Rewrites the target inside `<...>` (an inline link destination that may contain spaces). */
function rewriteDestination(destination: string, context: LinkContext, isImage: boolean): string {
  if (!destination.startsWith("<")) return rewriteTarget(destination, context, isImage);
  const rewritten = rewriteTarget(destination.slice(1, -1), context, isImage);
  return /\s/.test(rewritten) ? `<${rewritten}>` : rewritten;
}

function collectEdits(line: string, masked: string, context: LinkContext): Edit[] {
  const edits: Edit[] = [];
  const add = (range: readonly [number, number] | undefined, isImage: boolean): void => {
    if (range === undefined) return;
    const [start, end] = range;
    const original = line.slice(start, end);
    const text = rewriteDestination(original, context, isImage);
    if (text !== original) edits.push({ start, end, text });
  };

  for (const match of masked.matchAll(INLINE_LINK)) {
    add(match.indices?.[2], closesImageLabel(masked, match.index));
  }
  add(REFERENCE_DEFINITION.exec(masked)?.indices?.[2], false);
  for (const match of masked.matchAll(HTML_ATTRIBUTE)) {
    add(match.indices?.[2] ?? match.indices?.[3], match[1] === "src");
  }
  return edits;
}

/** Rewrites every link and image target of one line of Markdown. */
function rewriteLine(line: string, context: LinkContext): string {
  const edits = collectEdits(line, maskCodeSpans(line), context);
  return edits
    .sort((a, b) => b.start - a.start)
    .reduce(
      (result, edit) => result.slice(0, edit.start) + edit.text + result.slice(edit.end),
      line,
    );
}

/**
 * Rewrites the targets of inline links, images, link reference definitions and `href`/`src`
 * attributes of raw HTML in `body`, leaving fenced code blocks and inline code untouched.
 */
export function rewriteLinks(body: string, context: LinkContext): string {
  return mapLinesOutsideFences(body, (line) => [rewriteLine(line, context)]);
}
