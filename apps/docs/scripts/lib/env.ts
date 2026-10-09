/**
 * Turns the repository's `.env.example` into the environment variable reference of the
 * self-hosting section, so that the documentation cannot drift from the file that defines the
 * variables. Pure: text in, Markdown out.
 *
 * The expected format is the one of `.env.example`: `# --- Section ---` banners, blocks of `#`
 * comment lines (the last one is `# Used from: DATA-006 (authentication).`) followed by one or
 * more `NAME=value` lines, and blank lines between blocks. Commented-out assignments
 * (`# NAME=value`) are not variables of the reference.
 */

export interface EnvVariable {
  readonly name: string;
  /** The default exactly as written in the file (quotes included); empty for unset variables. */
  readonly value: string;
}

export interface EnvEntry {
  readonly variables: readonly EnvVariable[];
  /** The comment above the variables, as one paragraph and without the `Used from:` line. */
  readonly description: string;
  /** Backlog items named by the `Used from:` line (`DATA-006`). */
  readonly usedFrom: readonly string[];
}

export interface EnvSection {
  readonly title: string;
  readonly entries: readonly EnvEntry[];
}

/** The release milestone that starts reading variables of each backlog area (see `.github/backlog`). */
export const MILESTONE_BY_AREA: Readonly<Record<string, string>> = {
  DATA: "v0.3",
  WEB: "v0.4",
  REP: "v0.5",
  HARD: "v0.6",
  API: "v0.7",
  HOST: "v0.8",
  DESK: "v0.9",
  FPA: "v0.10",
  LAUNCH: "v1.0",
};

const SECTION_BANNER = /^#\s*---+\s*(.+?)\s*-{3,}\s*$/;
const ASSIGNMENT = /^([A-Z][A-Z0-9_]*)=(.*)$/;
const BACKLOG_ID = /\b([A-Z]+)-\d+\b/g;

interface Block {
  comments: string[];
  variables: EnvVariable[];
}

function toEntry(block: Block): EnvEntry {
  const usedAt = block.comments.findIndex((line) => line.startsWith("Used from:"));
  const description = (usedAt === -1 ? block.comments : block.comments.slice(0, usedAt)).join(" ");
  const used = usedAt === -1 ? "" : block.comments.slice(usedAt).join(" ");
  return {
    variables: block.variables,
    description,
    usedFrom: [...used.matchAll(BACKLOG_ID)].map((match) => match[0]),
  };
}

/** Parses the text of `.env.example`; sections without variables are dropped. */
export function parseEnvExample(text: string): EnvSection[] {
  const sections: { title: string; blocks: Block[] }[] = [{ title: "General", blocks: [] }];
  let block: Block = { comments: [], variables: [] };
  const endBlock = (): void => {
    const current = sections.at(-1);
    if (block.variables.length > 0 && current !== undefined) current.blocks.push(block);
    block = { comments: [], variables: [] };
  };

  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const banner = SECTION_BANNER.exec(line)?.[1];
    const assignment = ASSIGNMENT.exec(line);
    if (banner !== undefined) {
      endBlock();
      sections.push({ title: banner, blocks: [] });
    } else if (assignment?.[1] !== undefined) {
      block.variables.push({ name: assignment[1], value: assignment[2] ?? "" });
    } else if (line.startsWith("#")) {
      if (block.variables.length > 0) endBlock();
      block.comments.push(line.replace(/^#\s?/, "").trim());
    } else if (line.trim() === "") {
      endBlock();
    }
  }
  endBlock();

  return sections
    .filter((section) => section.blocks.length > 0)
    .map((section) => ({ title: section.title, entries: section.blocks.map(toEntry) }));
}

/** `v0.3` and `v0.10` compared as numbers. */
function compareMilestones(a: string, b: string): number {
  const [aMajor = 0, aMinor = 0] = a.slice(1).split(".").map(Number);
  const [bMajor = 0, bMinor = 0] = b.slice(1).split(".").map(Number);
  return aMajor - bMajor || aMinor - bMinor;
}

/** The first release that reads the variable: the earliest milestone of its `Used from:` items. */
export function availableFrom(usedFrom: readonly string[]): string {
  const milestones = usedFrom
    .map((id) => MILESTONE_BY_AREA[id.split("-")[0] ?? ""])
    .filter((milestone) => milestone !== undefined)
    .sort(compareMilestones);
  return milestones[0] ?? "";
}

/** Escapes table cell text and keeps localhost URLs from becoming (invalid) links. */
function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/(?<!`)(https?:\/\/localhost[\w:/.-]*[\w/])/g, "`$1`");
}

function code(text: string): string {
  return text === "" ? "_empty_" : `\`${text.replace(/\|/g, "\\|")}\``;
}

function row(entry: EnvEntry): string {
  const names = entry.variables.map((variable) => code(variable.name)).join("<br>");
  const values = entry.variables.map((variable) => code(variable.value)).join("<br>");
  return `| ${names} | ${values} | ${cell(entry.description)} | ${availableFrom(entry.usedFrom)} |`;
}

/** Renders the reference page (with its `# H1`, which the sync turns into the page title). */
export function renderEnvReference(text: string): string {
  const lines = [
    "# Environment variables",
    "",
    ":::caution[In development]",
    "Fairhour reads a variable only once the release in the last column ships. Until then the",
    "table is the planned configuration surface.",
    ":::",
    "",
    "Every setting of a Fairhour instance is an environment variable. This page is generated from",
    "[`.env.example`](.env.example), which is the single source of truth: copy it to `.env` and set",
    "what you need. A variable that is empty or unset leaves its feature off. Values in the",
    "_Default_ column are the development defaults of `.env.example`; placeholders such as",
    "`replace-me-…` must be replaced before you run Fairhour anywhere but on your own machine.",
  ];
  for (const section of parseEnvExample(text)) {
    lines.push(
      "",
      `## ${section.title}`,
      "",
      "| Variable | Default | Description | Available from |",
      "| --- | --- | --- | --- |",
      ...section.entries.map(row),
    );
  }
  return `${lines.join("\n")}\n`;
}
