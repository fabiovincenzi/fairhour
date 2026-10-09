import { createHash } from "node:crypto";
import type { ResolvedItem } from "./schema.ts";

export interface RenderContext {
  /** `owner/repo`, used for absolute links. */
  readonly repository: string;
  /** Default branch used for links to files. */
  readonly branch: string;
  /** Issue number for each backlog ID that already has an issue. */
  readonly issueNumbers: ReadonlyMap<string, number>;
  readonly items: ReadonlyMap<string, ResolvedItem>;
}

const ID_MARKER = /<!--\s*backlog-id:\s*([A-Z]+-\d{3})\s*-->/;
const SYNC_MARKER = /\n?<!--\s*backlog-sync:\s*([0-9a-f]+)\s*-->\s*$/;

/** Normalizes line endings and trailing whitespace so hashes are stable. */
function normalize(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

export function contentHash(text: string): string {
  return createHash("sha256").update(normalize(text)).digest("hex").slice(0, 16);
}

/** Returns the backlog ID embedded in an issue body, if any. */
export function extractBacklogId(body: string | null | undefined): string | undefined {
  return body?.match(ID_MARKER)?.[1];
}

/**
 * True when the body still matches the hash recorded at the last sync, i.e. nobody edited it
 * on GitHub. Bodies without a hash are treated as edited (never overwrite unknown content).
 */
export function isUntouchedSinceSync(body: string): boolean {
  const match = SYNC_MARKER.exec(body);
  if (!match?.[1]) return false;
  const content = body.slice(0, match.index);
  return contentHash(content) === match[1];
}

/** Rewrites repo-relative links (`../../docs/x.md`) to absolute GitHub URLs. */
function absolutizeLinks(markdown: string, ctx: RenderContext): string {
  const base = `https://github.com/${ctx.repository}/blob/${ctx.branch}/`;
  return markdown.replace(/\]\((?:\.\.\/)+/g, `](${base}`);
}

function reference(id: string, ctx: RenderContext): string {
  const number = ctx.issueNumbers.get(id);
  const title = ctx.items.get(id)?.title ?? id;
  return number === undefined ? `\`${id}\` ${title}` : `#${String(number)} (\`${id}\`)`;
}

/** Renders the full issue body, including the ID marker and the sync hash. */
export function renderIssueBody(item: ResolvedItem, ctx: RenderContext): string {
  const check = item.done ? "x" : " ";
  const sections: string[] = [absolutizeLinks(item.body.trim(), ctx)];

  sections.push(
    [
      "### Acceptance criteria",
      "",
      ...item.acceptance.map((criterion) => `- [${check}] ${criterion}`),
    ].join("\n"),
  );

  if (item.children.length > 0) {
    sections.push(
      [
        "### Sub-issues",
        "",
        ...item.children.map((child) => {
          const childDone = ctx.items.get(child)?.done === true ? "x" : " ";
          return `- [${childDone}] ${reference(child, ctx)}`;
        }),
      ].join("\n"),
    );
  }

  if (item.dependsOn.length > 0) {
    sections.push(
      ["### Depends on", "", ...item.dependsOn.map((dep) => `- ${reference(dep, ctx)}`)].join("\n"),
    );
  }

  const fileUrl = `https://github.com/${ctx.repository}/blob/${ctx.branch}/${item.sourceFile}`;
  sections.push(
    [
      "---",
      `<sub>Managed as code in [\`${item.sourceFile}\`](${fileUrl}) (backlog ID \`${item.id}\`). ` +
        "Edit the YAML to change this description; manual edits here stop the automatic sync of the body.</sub>",
      "",
      `<!-- backlog-id: ${item.id} -->`,
    ].join("\n"),
  );

  const content = sections.join("\n\n");
  return `${content}\n<!-- backlog-sync: ${contentHash(content)} -->`;
}
