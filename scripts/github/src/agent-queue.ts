import type { OpenWorkItem } from "./github.ts";
import { extractBacklogId } from "./render.ts";
import { PRIORITIES } from "./schema.ts";

/** Labels of the agent protocol (AGENTS.md). */
export const AGENT_LABEL = "agent: claude";
export const HUMAN_LABEL = "agent: human";
export const READY_LABEL = "status: ready";
export const IN_PROGRESS_LABEL = "status: in-progress";

/**
 * Issues an unattended agent never takes. Good first issues are kept for newcomers; an agent a
 * person is supervising may still take one.
 */
const SKIP_LABELS = [AGENT_LABEL, HUMAN_LABEL, IN_PROGRESS_LABEL, "type: epic", "good first issue"];

export interface PickOptions {
  /** Agent work in flight (claimed issues and open agent PRs) above which nothing is picked. */
  readonly maxInFlight: number;
}

export type PickResult =
  | { readonly kind: "picked"; readonly issue: OpenWorkItem }
  | { readonly kind: "none"; readonly reason: string };

const has = (item: OpenWorkItem, label: string): boolean =>
  item.labels.some((name) => name.toLowerCase() === label);

function priorityRank(item: OpenWorkItem): number {
  const index = PRIORITIES.findIndex((priority) => has(item, priority.toLowerCase()));
  return index === -1 ? PRIORITIES.length : index;
}

/** Issue numbers a pull request mentions as `#123` in its title or body. */
export function referencedIssues(pr: Pick<OpenWorkItem, "title" | "body">): ReadonlySet<number> {
  const numbers = new Set<number>();
  for (const match of `${pr.title}\n${pr.body ?? ""}`.matchAll(/(?<![\w/])#(\d{1,7})\b/g)) {
    numbers.add(Number(match[1]));
  }
  return numbers;
}

/**
 * Agent tasks in flight: issues claimed by an agent, plus agent pull requests that do not belong
 * to one of those issues (a claimed issue and its PR are one task).
 */
export function countInFlight(work: readonly OpenWorkItem[]): number {
  const claimed = new Set(
    work.filter((item) => !item.isPullRequest && has(item, AGENT_LABEL)).map((item) => item.number),
  );
  const orphanPulls = work.filter(
    (item) =>
      item.isPullRequest &&
      has(item, AGENT_LABEL) &&
      ![...referencedIssues(item)].some((number) => claimed.has(number)),
  );
  return claimed.size + orphanPulls.length;
}

/**
 * Picks the next issue for an unattended agent: a backlog issue (synced from
 * `.github/backlog`, so its text was reviewed in a PR) that is open, `status: ready`, unassigned,
 * not claimed, not marked for humans, not an epic or a good first issue, and not already
 * referenced by an open pull request. The most urgent priority wins, then the oldest issue.
 * Nothing is picked while `maxInFlight` agent tasks are open, so reviewers are never flooded.
 */
export function pickNextIssue(work: readonly OpenWorkItem[], options: PickOptions): PickResult {
  const pulls = work.filter((item) => item.isPullRequest);
  const issues = work.filter((item) => !item.isPullRequest);
  const inFlight = countInFlight(work);
  if (inFlight >= options.maxInFlight) {
    return {
      kind: "none",
      reason: `${String(inFlight)} agent task(s) in flight (limit ${String(options.maxInFlight)})`,
    };
  }
  const taken = new Set(pulls.flatMap((pr) => [...referencedIssues(pr)]));
  const candidates = issues
    .filter(
      (issue) =>
        has(issue, READY_LABEL) &&
        extractBacklogId(issue.body) !== undefined &&
        issue.assignees.length === 0 &&
        !taken.has(issue.number) &&
        !SKIP_LABELS.some((label) => has(issue, label)),
    )
    .sort((a, b) => priorityRank(a) - priorityRank(b) || a.number - b.number);
  const [first] = candidates;
  return first
    ? { kind: "picked", issue: first }
    : { kind: "none", reason: "no ready, unclaimed issue" };
}

/** The comment an agent leaves when it claims an issue. */
export function claimComment(runUrl: string | undefined): string {
  return [
    "🤖 Claimed by an AI agent (autopilot). It will open a pull request that closes this issue;",
    "a maintainer reviews it before merge. Remove the `agent: claude` label to release the claim.",
    ...(runUrl ? ["", `Run: ${runUrl}`] : []),
  ].join("\n");
}
