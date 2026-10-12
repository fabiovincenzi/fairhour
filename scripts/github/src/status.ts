import type { BacklogItemDef } from "./schema.ts";

export type Status = BacklogItemDef["status"];

type StatusInput = Pick<BacklogItemDef, "status" | "state" | "depends_on">;

/**
 * The status an item really has. `ready` and `blocked` are derived from the dependencies (ready
 * when every dependency is done), so nobody has to flip them by hand when work lands and parallel
 * PRs never fight over them. `triage` and `in-progress` are set by people and kept as written.
 */
export function deriveStatus(item: StatusInput, isDone: (id: string) => boolean): Status {
  if (item.status === "triage" || item.status === "in-progress") return item.status;
  return item.depends_on.every(isDone) ? "ready" : "blocked";
}

/** Derived statuses for every open item, keyed by backlog ID. */
export function deriveStatuses(
  items: ReadonlyMap<string, BacklogItemDef>,
): ReadonlyMap<string, Status> {
  const isDone = (id: string): boolean => items.get(id)?.state === "done";
  const statuses = new Map<string, Status>();
  for (const [id, item] of items) {
    if (item.state !== "done") statuses.set(id, deriveStatus(item, isDone));
  }
  return statuses;
}

const ITEM_START = /^ {2}- id:\s*([A-Z]+-\d{3})\s*$/;
const STATUS_LINE = /^( {4}status:\s*)([a-z-]+)(\s*(?:#.*)?)$/;

/**
 * Rewrites the `status:` line of each item in a backlog file, leaving every other byte as is
 * (a YAML round trip would reformat comments and flow lists). Returns the new content and the
 * IDs whose status changed.
 */
export function rewriteStatuses(
  content: string,
  statuses: ReadonlyMap<string, Status>,
): { readonly content: string; readonly changed: readonly string[] } {
  const changed: string[] = [];
  let current: string | undefined;
  const lines = content.split("\n").map((line) => {
    const start = ITEM_START.exec(line);
    if (start) {
      current = start[1];
      return line;
    }
    const status = STATUS_LINE.exec(line);
    if (!status || current === undefined) return line;
    const wanted = statuses.get(current);
    const id = current;
    current = undefined;
    if (wanted === undefined || wanted === status[2]) return line;
    changed.push(id);
    return `${status[1] ?? ""}${wanted}${status[3] ?? ""}`;
  });
  return { content: lines.join("\n"), changed };
}
