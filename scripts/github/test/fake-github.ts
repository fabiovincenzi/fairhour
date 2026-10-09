import type {
  CreateIssueInput,
  GitHubApi,
  GitHubIssue,
  GitHubLabel,
  GitHubMilestone,
  UpdateIssueInput,
} from "../src/github.ts";
import type { LabelDef, MilestoneDef } from "../src/schema.ts";

/** In-memory GitHub used to test the sync end to end. Counts every write. */
export class FakeGitHub implements GitHubApi {
  labels: GitHubLabel[] = [];
  milestones: GitHubMilestone[] = [];
  issues: GitHubIssue[] = [];
  writes = 0;
  private nextIssue = 1;
  private nextMilestone = 1;

  listLabels(): Promise<GitHubLabel[]> {
    return Promise.resolve(this.labels.map((label) => ({ ...label })));
  }

  createLabel(label: LabelDef): Promise<void> {
    this.writes++;
    this.labels.push({ ...label });
    return Promise.resolve();
  }

  updateLabel(currentName: string, label: LabelDef): Promise<void> {
    this.writes++;
    this.labels = this.labels.map((l) => (l.name === currentName ? { ...label } : l));
    return Promise.resolve();
  }

  listMilestones(): Promise<GitHubMilestone[]> {
    return Promise.resolve(this.milestones.map((m) => ({ ...m })));
  }

  createMilestone(milestone: MilestoneDef): Promise<GitHubMilestone> {
    this.writes++;
    const created: GitHubMilestone = {
      number: this.nextMilestone++,
      title: milestone.title,
      description: milestone.description,
      state: "open",
      due_on: milestone.due_on ? `${milestone.due_on}T23:59:59Z` : null,
    };
    this.milestones.push(created);
    return Promise.resolve({ ...created });
  }

  updateMilestone(number: number, milestone: MilestoneDef): Promise<void> {
    this.writes++;
    this.milestones = this.milestones.map((m) =>
      m.number === number
        ? {
            ...m,
            description: milestone.description,
            due_on: milestone.due_on ? `${milestone.due_on}T23:59:59Z` : m.due_on,
          }
        : m,
    );
    return Promise.resolve();
  }

  listIssues(): Promise<GitHubIssue[]> {
    return Promise.resolve(this.issues.map((issue) => ({ ...issue })));
  }

  private milestoneTitle(number: number | null | undefined): string | null {
    if (number === null || number === undefined) return null;
    const milestone = this.milestones.find((m) => m.number === number);
    if (!milestone) throw new Error(`unknown milestone ${String(number)}`);
    return milestone.title;
  }

  /** Mirrors GitHub: labels used on an issue are auto-created if missing. */
  private ensureLabels(names: readonly string[]): void {
    for (const name of names) {
      if (!this.labels.some((l) => l.name.toLowerCase() === name.toLowerCase())) {
        this.labels.push({ name, color: "ededed", description: null });
      }
    }
  }

  createIssue(input: CreateIssueInput): Promise<GitHubIssue> {
    this.writes++;
    this.ensureLabels(input.labels);
    const issue: GitHubIssue = {
      number: this.nextIssue++,
      title: input.title,
      body: input.body,
      state: "open",
      labels: [...input.labels],
      milestone: this.milestoneTitle(input.milestone),
    };
    this.issues.push(issue);
    return Promise.resolve({ ...issue });
  }

  updateIssue(number: number, input: UpdateIssueInput): Promise<GitHubIssue> {
    this.writes++;
    const index = this.issues.findIndex((issue) => issue.number === number);
    const current = this.issues[index];
    if (!current) throw new Error(`unknown issue ${String(number)}`);
    if (input.labels) this.ensureLabels(input.labels);
    const updated: GitHubIssue = {
      ...current,
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.body === undefined ? {} : { body: input.body }),
      ...(input.labels === undefined ? {} : { labels: [...input.labels] }),
      ...(input.milestone === undefined ? {} : { milestone: this.milestoneTitle(input.milestone) }),
      ...(input.state === undefined ? {} : { state: input.state }),
    };
    this.issues[index] = updated;
    return Promise.resolve({ ...updated });
  }

  /** Simulates someone adding a pull request or an unrelated issue. */
  addForeignIssue(issue: Omit<GitHubIssue, "number">): GitHubIssue {
    const created = { ...issue, number: this.nextIssue++ };
    this.issues.push(created);
    return created;
  }
}
