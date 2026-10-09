import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { z } from "zod";
import {
  backlogFileSchema,
  labelsFileSchema,
  milestonesFileSchema,
  type Backlog,
  type BacklogItemDef,
  type LabelDef,
  type MilestoneDef,
  type ResolvedItem,
} from "./schema.ts";

export interface SourceFile {
  /** Path relative to the repository root, e.g. `.github/backlog/02-core-tax.yml`. */
  readonly path: string;
  readonly content: string;
}

export interface BacklogSources {
  readonly labels: SourceFile;
  readonly milestones: SourceFile;
  readonly backlog: readonly SourceFile[];
}

export type LoadResult =
  | { readonly ok: true; readonly backlog: Backlog }
  | { readonly ok: false; readonly errors: readonly string[] };

const GOOD_FIRST_ISSUE = "good first issue";

function formatZodError(file: string, error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const where = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `${file}: ${where}: ${issue.message}`;
  });
}

function parseFile<T>(
  file: SourceFile,
  schema: z.ZodType<T>,
  errors: string[],
): T | undefined {
  let raw: unknown;
  try {
    raw = parseYaml(file.content);
  } catch (error) {
    errors.push(`${file.path}: invalid YAML: ${(error as Error).message}`);
    return undefined;
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    errors.push(...formatZodError(file.path, result.error));
    return undefined;
  }
  return result.data;
}

/** Labels an item gets on GitHub, derived from its fields. */
export function resolveItemLabels(item: BacklogItemDef): string[] {
  const done = item.state === "done";
  const labels = [
    `type: ${item.type}`,
    ...item.areas.map((area) => `area: ${area}`),
    item.priority,
    `size: ${item.size}`,
    ...(done ? [] : [`status: ${item.status}`]),
    ...item.labels,
  ];
  return [...new Set(labels)];
}

function findCycle(
  items: ReadonlyMap<string, BacklogItemDef>,
): string[] | undefined {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  const visit = (id: string): string[] | undefined => {
    if (visited.has(id)) return undefined;
    if (visiting.has(id)) return [...stack.slice(stack.indexOf(id)), id];
    visiting.add(id);
    stack.push(id);
    for (const dep of items.get(id)?.depends_on ?? []) {
      const cycle = visit(dep);
      if (cycle) return cycle;
    }
    stack.pop();
    visiting.delete(id);
    visited.add(id);
    return undefined;
  };

  for (const id of items.keys()) {
    const cycle = visit(id);
    if (cycle) return cycle;
  }
  return undefined;
}

function checkUnique(
  values: readonly string[],
  what: string,
  file: string,
  errors: string[],
): void {
  const seen = new Set<string>();
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) errors.push(`${file}: duplicate ${what} "${value}"`);
    seen.add(key);
  }
}

/** Parses and cross-validates the backlog. Pure: does not touch the file system. */
export function parseBacklog(sources: BacklogSources): LoadResult {
  const errors: string[] = [];
  const labels: readonly LabelDef[] =
    parseFile(sources.labels, labelsFileSchema, errors) ?? [];
  const milestones: readonly MilestoneDef[] =
    parseFile(sources.milestones, milestonesFileSchema, errors) ?? [];

  checkUnique(
    labels.map((l) => l.name),
    "label",
    sources.labels.path,
    errors,
  );
  checkUnique(
    milestones.map((m) => m.title),
    "milestone",
    sources.milestones.path,
    errors,
  );

  const labelNames = new Set(labels.map((l) => l.name.toLowerCase()));
  const milestoneTitles = new Set(milestones.map((m) => m.title));
  const defs = new Map<string, BacklogItemDef>();
  const resolved: ResolvedItem[] = [];

  for (const file of sources.backlog) {
    const parsed = parseFile(file, backlogFileSchema, errors);
    if (!parsed) continue;
    for (const item of parsed.items) {
      const where = `${file.path}: ${item.id}`;
      if (defs.has(item.id)) {
        errors.push(`${where}: duplicate backlog ID`);
        continue;
      }
      defs.set(item.id, item);

      const itemLabels = resolveItemLabels(item);
      for (const label of itemLabels) {
        if (!labelNames.has(label.toLowerCase())) {
          errors.push(`${where}: unknown label "${label}" (add it to labels.yml)`);
        }
      }

      const milestone = item.milestone ?? parsed.milestone;
      if (milestone === undefined) {
        errors.push(`${where}: no milestone (set one on the item or the file)`);
      } else if (!milestoneTitles.has(milestone)) {
        errors.push(`${where}: unknown milestone "${milestone}"`);
      }

      if (item.type === "epic" && item.children.length === 0) {
        errors.push(`${where}: epics need at least one child`);
      }
      if (item.type !== "epic" && item.children.length > 0) {
        errors.push(`${where}: only epics can have children`);
      }
      if (
        itemLabels.includes(GOOD_FIRST_ISSUE) &&
        (item.size === "L" || item.size === "XL")
      ) {
        errors.push(`${where}: a good first issue must be size S or M`);
      }

      resolved.push({
        id: item.id,
        title: item.title,
        type: item.type,
        labels: itemLabels,
        milestone,
        done: item.state === "done",
        dependsOn: item.depends_on,
        children: item.children,
        body: item.body,
        acceptance: item.acceptance,
        sourceFile: file.path,
      });
    }
  }

  const parentOf = new Map<string, string>();
  for (const [id, item] of defs) {
    for (const ref of [...item.depends_on, ...item.children]) {
      if (ref === id) errors.push(`${id}: refers to itself`);
      else if (!defs.has(ref)) errors.push(`${id}: unknown reference ${ref}`);
    }
    for (const child of item.children) {
      const previous = parentOf.get(child);
      if (previous !== undefined) {
        errors.push(`${child}: listed under two epics (${previous}, ${id})`);
      }
      parentOf.set(child, id);
    }
  }

  const cycle = findCycle(defs);
  if (cycle) errors.push(`dependency cycle: ${cycle.join(" → ")}`);

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, backlog: { labels, milestones, items: resolved } };
}

/** Reads `.github/labels.yml`, `.github/milestones.yml` and `.github/backlog/*.yml`. */
export async function readBacklogSources(
  repoRoot: string,
): Promise<BacklogSources> {
  const read = async (relative: string): Promise<SourceFile> => ({
    path: relative,
    content: await readFile(path.join(repoRoot, relative), "utf8"),
  });
  const backlogDir = path.join(repoRoot, ".github", "backlog");
  const names = (await readdir(backlogDir))
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .sort();
  return {
    labels: await read(".github/labels.yml"),
    milestones: await read(".github/milestones.yml"),
    backlog: await Promise.all(
      names.map((name) => read(`.github/backlog/${name}`)),
    ),
  };
}
