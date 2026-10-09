import { describe, expect, it } from "vitest";
import { FakeGitHub } from "../test/fake-github.ts";
import { sources } from "../test/fixtures.ts";
import type { GitHubIssue } from "./github.ts";
import { parseBacklog } from "./load.ts";
import { extractBacklogId, renderIssueBody } from "./render.ts";
import type { Backlog } from "./schema.ts";
import {
  formatReport,
  planIssuePatch,
  planLabels,
  planMilestones,
  syncBacklog,
  type SyncOptions,
} from "./sync.ts";

function loadBacklog(): Backlog {
  const result = parseBacklog(sources());
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.backlog;
}

const logs: string[] = [];
const options: SyncOptions = {
  repository: "acme/fairhour",
  branch: "main",
  dryRun: false,
  log: (message) => logs.push(message),
};

function issueFor(github: FakeGitHub, id: string): GitHubIssue {
  const issue = github.issues.find((i) => extractBacklogId(i.body) === id);
  if (!issue) throw new Error(`no issue for ${id}`);
  return issue;
}

describe("planLabels", () => {
  it("creates missing labels, updates changed ones case-insensitively and keeps the rest", () => {
    const plan = planLabels(
      [
        { name: "P1", color: "d93f0b", description: "High" },
        { name: "type: bug", color: "d73a4a", description: "Bug" },
        { name: "New", color: "000000", description: "" },
        { name: "Same", color: "ABCDEF", description: "" },
      ],
      [
        { name: "p1", color: "d93f0b", description: "High" },
        { name: "type: bug", color: "ffffff", description: "Bug" },
        { name: "same", color: "abcdef", description: null },
        { name: "manual", color: "123456", description: null },
      ],
    );
    expect(plan.create.map((l) => l.name)).toEqual(["New"]);
    expect(plan.update).toEqual([
      { currentName: "p1", label: { name: "P1", color: "d93f0b", description: "High" } },
      {
        currentName: "type: bug",
        label: { name: "type: bug", color: "d73a4a", description: "Bug" },
      },
      { currentName: "same", label: { name: "Same", color: "ABCDEF", description: "" } },
    ]);
  });
});

describe("planMilestones", () => {
  it("creates missing milestones and updates description or due date changes", () => {
    const plan = planMilestones(
      [
        { title: "A", description: "a" },
        { title: "B", description: "b2" },
        { title: "C", description: "c", due_on: "2026-12-31" },
        { title: "D", description: "d", due_on: "2026-12-31" },
        { title: "E", description: "" },
      ],
      [
        { number: 2, title: "B", description: "b", state: "open", due_on: null },
        { number: 3, title: "C", description: "c", state: "open", due_on: null },
        {
          number: 4,
          title: "D",
          description: "d",
          state: "closed",
          due_on: "2026-12-31T23:59:59Z",
        },
        { number: 5, title: "E", description: null, state: "open", due_on: null },
      ],
    );
    expect(plan.create.map((m) => m.title)).toEqual(["A"]);
    expect(plan.update.map((u) => u.number)).toEqual([2, 3]);
  });
});

describe("planIssuePatch", () => {
  const backlog = loadBacklog();
  const ctx = {
    repository: "acme/fairhour",
    branch: "main",
    issueNumbers: new Map<string, number>(),
    items: new Map(backlog.items.map((i) => [i.id, i])),
  };
  const rounding = backlog.items.find((i) => i.id === "CORE-003")!;
  const body = renderIssueBody(rounding, ctx);
  const synced: GitHubIssue = {
    number: 3,
    title: rounding.title,
    body,
    state: "open",
    labels: [...rounding.labels],
    milestone: "v0.2 Core",
  };

  it("returns no patch when the issue is in sync", () => {
    expect(planIssuePatch(rounding, synced, body, 2)).toEqual({
      patch: undefined,
      bodySkipped: false,
      closes: false,
    });
  });

  it("updates title, milestone and adds missing labels without removing manual ones", () => {
    const plan = planIssuePatch(
      rounding,
      { ...synced, title: "Old", milestone: null, labels: ["manual", "P2"] },
      body,
      2,
    );
    expect(plan.patch?.title).toBe(rounding.title);
    expect(plan.patch?.milestone).toBe(2);
    expect(plan.patch?.labels).toEqual([
      "manual",
      "P2",
      ...rounding.labels.filter((l) => l !== "P2"),
    ]);
  });

  it("overwrites a body untouched since the last sync", () => {
    const old = renderIssueBody({ ...rounding, body: "Old text." }, ctx);
    expect(planIssuePatch(rounding, { ...synced, body: old }, body, 2).patch?.body).toBe(body);
  });

  it("never overwrites a body edited on GitHub", () => {
    const plan = planIssuePatch(rounding, { ...synced, body: `${body}\n\nExtra notes` }, body, 2);
    expect(plan.bodySkipped).toBe(true);
    expect(plan.patch).toBeUndefined();
    expect(planIssuePatch(rounding, { ...synced, body: null }, body, 2).bodySkipped).toBe(true);
  });

  it("closes open issues of done items and drops their status labels", () => {
    const done = {
      ...rounding,
      done: true,
      labels: rounding.labels.filter((l) => !l.startsWith("status:")),
    };
    const plan = planIssuePatch(done, synced, body, 2);
    expect(plan.closes).toBe(true);
    expect(plan.patch?.state).toBe("closed");
    expect(plan.patch?.state_reason).toBe("completed");
    expect(plan.patch?.labels).not.toContain("status: blocked");
  });

  it("never reopens a closed issue", () => {
    const plan = planIssuePatch(rounding, { ...synced, state: "closed" }, body, 2);
    expect(plan.patch).toBeUndefined();
    expect(plan.closes).toBe(false);
  });
});

describe("syncBacklog", () => {
  it("creates labels, milestones and issues, closes done items, links epic children", async () => {
    const github = new FakeGitHub();
    const report = await syncBacklog(github, loadBacklog(), options);

    expect(report.labelsCreated).toHaveLength(13);
    expect(report.milestonesCreated).toEqual(["v0.1 Foundation", "v0.2 Core"]);
    expect(report.issuesCreated).toEqual(["CORE-001", "CORE-002", "CORE-003"]);
    expect(report.issuesClosed).toEqual(["CORE-002"]);
    expect(github.issues).toHaveLength(3);

    const epic = issueFor(github, "CORE-001");
    const money = issueFor(github, "CORE-002");
    const rounding = issueFor(github, "CORE-003");
    expect(epic.body).toContain(`- [x] #${String(money.number)} (\`CORE-002\`)`);
    expect(epic.body).toContain(`- [ ] #${String(rounding.number)} (\`CORE-003\`)`);
    expect(money.state).toBe("closed");
    expect(rounding.milestone).toBe("v0.2 Core");
    expect(rounding.labels).toContain("good first issue");
  });

  it("is idempotent: a second run changes nothing", async () => {
    const github = new FakeGitHub();
    await syncBacklog(github, loadBacklog(), options);
    const writes = github.writes;
    const snapshot = JSON.stringify(github.issues);

    const report = await syncBacklog(github, loadBacklog(), options);

    expect(github.writes).toBe(writes);
    expect(JSON.stringify(github.issues)).toBe(snapshot);
    expect(report.issuesCreated).toEqual([]);
    expect(report.issuesUpdated).toEqual([]);
    expect(report.issuesClosed).toEqual([]);
  });

  it("never duplicates, never reopens and respects manual edits", async () => {
    const github = new FakeGitHub();
    await syncBacklog(github, loadBacklog(), options);

    // A maintainer closes the epic as not planned and edits the rounding issue by hand.
    const epic = issueFor(github, "CORE-001");
    const rounding = issueFor(github, "CORE-003");
    await github.updateIssue(epic.number, { state: "closed" });
    await github.updateIssue(rounding.number, { body: `${rounding.body ?? ""}\nnotes` });
    // Someone copies the marker into another issue.
    github.addForeignIssue({
      title: "copy",
      body: "<!-- backlog-id: CORE-003 -->",
      state: "open",
      labels: [],
      milestone: null,
    });

    const changed = loadBacklog();
    const items = changed.items.map((i) =>
      i.id === "CORE-003" ? { ...i, title: "Rounding rules v2", body: "New text" } : i,
    );
    const report = await syncBacklog(github, { ...changed, items }, options);

    expect(github.issues).toHaveLength(4);
    expect(issueFor(github, "CORE-001").state).toBe("closed");
    expect(report.issuesUpdated).toEqual(["CORE-003"]);
    expect(report.bodiesSkipped).toEqual(["CORE-003"]);
    expect(issueFor(github, "CORE-003").title).toBe("Rounding rules v2");
    expect(issueFor(github, "CORE-003").body).toContain("notes");
    expect(report.duplicates).toHaveLength(1);
  });

  it("makes no writes in dry-run mode", async () => {
    const github = new FakeGitHub();
    const report = await syncBacklog(github, loadBacklog(), { ...options, dryRun: true });
    expect(github.writes).toBe(0);
    expect(report.issuesCreated).toHaveLength(3);
    expect(report.labelsCreated).toHaveLength(13);
    expect(logs.some((line) => line.startsWith("[dry-run] create issue CORE-001"))).toBe(true);
  });

  it("updates changed labels and milestones on later runs", async () => {
    const github = new FakeGitHub();
    await syncBacklog(github, loadBacklog(), options);
    const backlog = loadBacklog();
    const report = await syncBacklog(
      github,
      {
        ...backlog,
        labels: backlog.labels.map((l) => (l.name === "P1" ? { ...l, color: "000000" } : l)),
        milestones: backlog.milestones.map((m) => ({ ...m, description: `${m.description}!` })),
      },
      options,
    );
    expect(report.labelsUpdated).toEqual(["P1"]);
    expect(report.milestonesUpdated).toHaveLength(2);
  });

  it("formats a Markdown report", () => {
    const text = formatReport(
      {
        labelsCreated: Array.from({ length: 25 }, (_, i) => `L${String(i)}`),
        labelsUpdated: [],
        milestonesCreated: [],
        milestonesUpdated: [],
        issuesCreated: ["A-001"],
        issuesUpdated: [],
        issuesClosed: [],
        bodiesSkipped: [],
        duplicates: [12],
      },
      true,
    );
    expect(text).toContain("## Backlog sync (dry run)");
    expect(text).toContain("| Labels created | 25 | L0, L1");
    expect(text).toContain(", …");
    expect(text).toContain("| Duplicate issues ignored | 1 | 12 |");
    expect(formatReport({ ...emptyLike() }, false)).toContain("## Backlog sync\n");
  });
});

function emptyLike() {
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
