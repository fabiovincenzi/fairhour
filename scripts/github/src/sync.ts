import type {
  GitHubApi,
  GitHubIssue,
  GitHubLabel,
  GitHubMilestone,
  UpdateIssueInput,
} from "./github.ts";
import {
  extractBacklogId,
  isUntouchedSinceSync,
  renderIssueBody,
  type RenderContext,
} from "./render.ts";
import type { Backlog, LabelDef, MilestoneDef, ResolvedItem } from "./schema.ts";

// ---------------------------------------------------------------------------
// Pure planning functions
// ---------------------------------------------------------------------------

export interface LabelPlan {
  readonly create: readonly LabelDef[];
  readonly update: readonly { readonly currentName: string; readonly label: LabelDef }[];
}

/** Labels are matched case-insensitively; existing labels not in the file are kept. */
export function planLabels(
  desired: readonly LabelDef[],
  existing: readonly GitHubLabel[],
): LabelPlan {
  const byName = new Map(existing.map((label) => [label.name.toLowerCase(), label]));
  const create: LabelDef[] = [];
  const update: { currentName: string; label: LabelDef }[] = [];
  for (const label of desired) {
    const current = byName.get(label.name.toLowerCase());
    if (!current) {
      create.push(label);
    } else if (
      current.name !== label.name ||
      current.color.toLowerCase() !== label.color.toLowerCase() ||
      (current.description ?? "") !== label.description
    ) {
      update.push({ currentName: current.name, label });
    }
  }
  return { create, update };
}

export interface MilestonePlan {
  readonly create: readonly MilestoneDef[];
  readonly update: readonly { readonly number: number; readonly milestone: MilestoneDef }[];
}

/** Milestones are matched by exact title; existing milestones are never deleted or closed. */
export function planMilestones(
  desired: readonly MilestoneDef[],
  existing: readonly GitHubMilestone[],
): MilestonePlan {
  const byTitle = new Map(existing.map((milestone) => [milestone.title, milestone]));
  const create: MilestoneDef[] = [];
  const update: { number: number; milestone: MilestoneDef }[] = [];
  for (const milestone of desired) {
    const current = byTitle.get(milestone.title);
    if (!current) {
      create.push(milestone);
      continue;
    }
    const dueChanged =
      milestone.due_on !== undefined && !current.due_on?.startsWith(milestone.due_on);
    if ((current.description ?? "") !== milestone.description || dueChanged) {
      update.push({ number: current.number, milestone });
    }
  }
  return { create, update };
}

export interface IssuePatch {
  readonly patch: UpdateIssueInput | undefined;
  /** The body differs but was edited on GitHub, so it was left alone. */
  readonly bodySkipped: boolean;
  readonly closes: boolean;
}

const STATUS_PREFIX = "status: ";

/**
 * Computes the update for an existing issue. Never reopens, never removes labels except the
 * `status: *` labels of an issue it closes as done.
 */
export function planIssuePatch(
  item: ResolvedItem,
  issue: GitHubIssue,
  desiredBody: string,
  milestoneNumber: number | undefined,
): IssuePatch {
  const patch: {
    title?: string;
    body?: string;
    labels?: string[];
    milestone?: number;
    state?: "closed";
    state_reason?: "completed";
  } = {};
  let bodySkipped = false;

  if (issue.title !== item.title) patch.title = item.title;

  if ((issue.body ?? "") !== desiredBody) {
    if (isUntouchedSinceSync(issue.body ?? "")) patch.body = desiredBody;
    else bodySkipped = true;
  }

  if (
    item.milestone !== undefined &&
    milestoneNumber !== undefined &&
    issue.milestone !== item.milestone
  ) {
    patch.milestone = milestoneNumber;
  }

  const closes = item.done && issue.state === "open";
  const current = new Set(issue.labels.map((label) => label.toLowerCase()));
  const missing = item.labels.filter((label) => !current.has(label.toLowerCase()));
  const kept = closes
    ? issue.labels.filter((label) => !label.toLowerCase().startsWith(STATUS_PREFIX))
    : [...issue.labels];
  if (missing.length > 0 || kept.length !== issue.labels.length) {
    patch.labels = [...kept, ...missing];
  }

  if (closes) {
    patch.state = "closed";
    patch.state_reason = "completed";
  }

  return {
    patch: Object.keys(patch).length > 0 ? patch : undefined,
    bodySkipped,
    closes,
  };
}

// ---------------------------------------------------------------------------
// Sync orchestration
// ---------------------------------------------------------------------------

export interface SyncOptions {
  readonly repository: string;
  readonly branch: string;
  readonly dryRun: boolean;
  readonly log: (message: string) => void;
}

export interface SyncReport {
  labelsCreated: string[];
  labelsUpdated: string[];
  milestonesCreated: string[];
  milestonesUpdated: string[];
  issuesCreated: string[];
  issuesUpdated: string[];
  issuesClosed: string[];
  /** Backlog IDs whose body was edited on GitHub and therefore not overwritten. */
  bodiesSkipped: string[];
  /** Issues sharing a backlog ID with an earlier issue (left untouched). */
  duplicates: number[];
}

function emptyReport(): SyncReport {
  return {
    labelsCreated: [],
    labelsUpdated: [],
    milestonesCreated: [],
    milestonesUpdated: [],
    issuesCreated: [],
    issuesUpdated: [],
    issuesClosed: [],
    bodiesSkipped: [],
    duplicates: [],
  };
}

/** Idempotently syncs labels, milestones and backlog issues. */
export async function syncBacklog(
  api: GitHubApi,
  backlog: Backlog,
  options: SyncOptions,
): Promise<SyncReport> {
  const report = emptyReport();
  const { dryRun, log } = options;
  const prefix = dryRun ? "[dry-run] " : "";

  // 1. Labels
  const labelPlan = planLabels(backlog.labels, await api.listLabels());
  for (const label of labelPlan.create) {
    log(`${prefix}create label "${label.name}"`);
    if (!dryRun) await api.createLabel(label);
    report.labelsCreated.push(label.name);
  }
  for (const { currentName, label } of labelPlan.update) {
    log(`${prefix}update label "${currentName}"`);
    if (!dryRun) await api.updateLabel(currentName, label);
    report.labelsUpdated.push(label.name);
  }

  // 2. Milestones
  const existingMilestones = await api.listMilestones();
  const milestoneNumbers = new Map(existingMilestones.map((m) => [m.title, m.number]));
  const milestonePlan = planMilestones(backlog.milestones, existingMilestones);
  for (const milestone of milestonePlan.create) {
    log(`${prefix}create milestone "${milestone.title}"`);
    if (!dryRun) {
      const created = await api.createMilestone(milestone);
      milestoneNumbers.set(created.title, created.number);
    }
    report.milestonesCreated.push(milestone.title);
  }
  for (const { number, milestone } of milestonePlan.update) {
    log(`${prefix}update milestone "${milestone.title}"`);
    if (!dryRun) await api.updateMilestone(number, milestone);
    report.milestonesUpdated.push(milestone.title);
  }

  // 3. Index existing issues by backlog ID (oldest issue wins on duplicates).
  const issues = new Map<string, GitHubIssue>();
  const existing = [...(await api.listIssues())].sort((a, b) => a.number - b.number);
  for (const issue of existing) {
    const id = extractBacklogId(issue.body);
    if (id === undefined) continue;
    if (issues.has(id)) {
      report.duplicates.push(issue.number);
      log(`warning: issue #${String(issue.number)} duplicates backlog ID ${id}; ignored`);
      continue;
    }
    issues.set(id, issue);
  }

  const itemsById = new Map(backlog.items.map((item) => [item.id, item]));
  const issueNumbers = new Map([...issues].map(([id, issue]) => [id, issue.number]));
  const context = (): RenderContext => ({
    repository: options.repository,
    branch: options.branch,
    issueNumbers,
    items: itemsById,
  });

  // 4. Create missing issues. Bodies are refined in step 5 once every number is known.
  for (const item of backlog.items) {
    if (issues.has(item.id)) continue;
    const milestone =
      item.milestone === undefined ? undefined : milestoneNumbers.get(item.milestone);
    log(`${prefix}create issue ${item.id}: ${item.title}`);
    report.issuesCreated.push(item.id);
    if (dryRun) continue;
    const created = await api.createIssue({
      title: item.title,
      body: renderIssueBody(item, context()),
      labels: item.labels,
      ...(milestone === undefined ? {} : { milestone }),
    });
    issues.set(item.id, created);
    issueNumbers.set(item.id, created.number);
  }

  // 5. Update existing (and just-created) issues.
  for (const item of backlog.items) {
    const issue = issues.get(item.id);
    if (!issue) continue;
    const milestone =
      item.milestone === undefined ? undefined : milestoneNumbers.get(item.milestone);
    const plan = planIssuePatch(item, issue, renderIssueBody(item, context()), milestone);
    if (plan.bodySkipped) {
      report.bodiesSkipped.push(item.id);
      log(
        `warning: body of #${String(issue.number)} (${item.id}) was edited on GitHub; not overwritten`,
      );
    }
    if (!plan.patch) continue;
    const created = report.issuesCreated.includes(item.id);
    const contentChanges = Object.keys(plan.patch).filter(
      (key) => key !== "state" && key !== "state_reason",
    );
    if (plan.closes) report.issuesClosed.push(item.id);
    if (!created && contentChanges.length > 0) report.issuesUpdated.push(item.id);
    log(
      `${prefix}${plan.closes ? "close" : "update"} issue #${String(issue.number)} (${item.id}): ${Object.keys(plan.patch).join(", ")}`,
    );
    if (!dryRun) issues.set(item.id, await api.updateIssue(issue.number, plan.patch));
  }

  return report;
}

/** A Markdown summary for `$GITHUB_STEP_SUMMARY`. */
export function formatReport(report: SyncReport, dryRun: boolean): string {
  const row = (label: string, values: readonly (string | number)[]): string =>
    `| ${label} | ${String(values.length)} | ${values.slice(0, 20).join(", ")}${values.length > 20 ? ", …" : ""} |`;
  return [
    `## Backlog sync${dryRun ? " (dry run)" : ""}`,
    "",
    "| Change | Count | Items |",
    "|---|---|---|",
    row("Labels created", report.labelsCreated),
    row("Labels updated", report.labelsUpdated),
    row("Milestones created", report.milestonesCreated),
    row("Milestones updated", report.milestonesUpdated),
    row("Issues created", report.issuesCreated),
    row("Issues updated", report.issuesUpdated),
    row("Issues closed", report.issuesClosed),
    row("Bodies edited on GitHub (skipped)", report.bodiesSkipped),
    row("Duplicate issues ignored", report.duplicates),
    "",
  ].join("\n");
}
