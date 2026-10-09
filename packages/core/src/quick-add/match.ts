import { foldName } from "./fold";
import type { QuickAddProject, QuickAddProjectMatch } from "./types";

/** How well a query matches a name: inside it, at its start, or the whole name. */
type MatchKind = QuickAddProjectMatch["kind"];

const WEIGHT: Readonly<Record<MatchKind, number>> = { substring: 1, prefix: 2, exact: 3 };

/** Shortest query accepted in free text, where nothing marks the words as a project (`a`, `I`). */
const MIN_FREE_TEXT_LENGTH = 2;

/**
 * How `query` matches `name` (both folded by `foldName`), if at all.
 *
 * - `mention` (the user wrote `@query`): exact, then any prefix (`acm` finds `acme`), then
 *   substring.
 * - `text` (loose words of the sentence): exact, then a prefix made of whole leading words
 *   (`design` finds `design system`, `call` does not find `callum`). No substring: ordinary words
 *   such as `design` must not hijack `website redesign`.
 */
function kindOf(
  query: string,
  name: string,
  source: QuickAddProjectMatch["source"],
): MatchKind | undefined {
  if (query === "" || name === "") return undefined;
  if (source === "text" && query.length < MIN_FREE_TEXT_LENGTH) return undefined;
  if (query === name) return "exact";
  if (source === "mention") {
    if (name.startsWith(query)) return "prefix";
    return name.includes(query) ? "substring" : undefined;
  }
  return name.startsWith(`${query} `) ? "prefix" : undefined;
}

export interface ProjectCandidate {
  readonly project: QuickAddProject;
  readonly name: string;
  readonly clientName: string;
}

export function prepareProjects(projects: readonly QuickAddProject[]): ProjectCandidate[] {
  return projects.map((project) => ({
    project,
    name: foldName(project.name),
    clientName: foldName(project.clientName),
  }));
}

export type ProjectResolution =
  | {
      readonly type: "matched";
      readonly rank: number;
      readonly project: QuickAddProject;
      readonly match: QuickAddProjectMatch;
    }
  | {
      readonly type: "ambiguous";
      readonly rank: number;
      readonly candidates: readonly QuickAddProject[];
    };

interface Scored {
  readonly candidate: ProjectCandidate;
  readonly rank: number;
  readonly kind: MatchKind;
  readonly via: QuickAddProjectMatch["via"];
}

/**
 * Finds the project a folded `query` points at. A project is scored by its best match on its own
 * name or on its client's name; at the same kind the project name beats the client name
 * (`rank = weight * 2 + 1` for a project name, `weight * 2` for a client name). The best score
 * wins; when several projects share it (two projects of one client, two projects with the same
 * name) the answer is `ambiguous` and lists them in input order.
 */
export function resolveProject(
  query: string,
  candidates: readonly ProjectCandidate[],
  source: QuickAddProjectMatch["source"],
): ProjectResolution | undefined {
  let best: Scored[] = [];
  for (const candidate of candidates) {
    const byName = kindOf(query, candidate.name, source);
    const byClient = kindOf(query, candidate.clientName, source);
    const nameRank = byName === undefined ? 0 : WEIGHT[byName] * 2 + 1;
    const clientRank = byClient === undefined ? 0 : WEIGHT[byClient] * 2;
    let scored: Scored | undefined;
    if (byName !== undefined && nameRank >= clientRank) {
      scored = { candidate, rank: nameRank, kind: byName, via: "project" };
    } else if (byClient !== undefined) {
      scored = { candidate, rank: clientRank, kind: byClient, via: "client" };
    }
    if (scored === undefined) continue;
    const top = best[0]?.rank ?? 0;
    if (scored.rank > top) best = [scored];
    else if (scored.rank === top) best.push(scored);
  }
  const [first, ...others] = best;
  if (first === undefined) return undefined;
  if (others.length > 0) {
    return {
      type: "ambiguous",
      rank: first.rank,
      candidates: best.map((entry) => entry.candidate.project),
    };
  }
  return {
    type: "matched",
    rank: first.rank,
    project: first.candidate.project,
    match: { kind: first.kind, via: first.via, source },
  };
}

/**
 * Canonical spelling of a typed `#tag`: an existing tag it equals (ignoring case and diacritics),
 * or the only existing tag it is the start of; otherwise the tag as typed (a new tag).
 */
export function resolveTag(typed: string, known: readonly string[]): string {
  const query = foldName(typed);
  const tags = known.map((tag) => ({ tag, folded: foldName(tag) }));
  const exact = tags.find((entry) => entry.folded === query);
  if (exact !== undefined) return exact.tag;
  const [only, ...others] = tags.filter((entry) => entry.folded.startsWith(query));
  return only !== undefined && others.length === 0 ? only.tag : typed;
}
