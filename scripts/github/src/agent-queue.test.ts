import { describe, expect, it } from "vitest";
import { claimComment, countInFlight, pickNextIssue, referencedIssues } from "./agent-queue.ts";
import type { OpenWorkItem } from "./github.ts";

function issue(number: number, labels: string[], overrides: Partial<OpenWorkItem> = {}) {
  return {
    number,
    title: `Issue ${String(number)}`,
    body: `Text.\n<!-- backlog-id: TEST-${String(number).padStart(3, "0")} -->`,
    labels,
    assignees: [],
    isPullRequest: false,
    ...overrides,
  } satisfies OpenWorkItem;
}

const pr = (number: number, body: string, labels: string[] = []): OpenWorkItem =>
  issue(number, labels, { isPullRequest: true, body, title: `PR ${String(number)}` });

const options = { maxInFlight: 2 };

describe("pickNextIssue", () => {
  it("picks the most urgent ready issue, then the oldest", () => {
    const result = pickNextIssue(
      [
        issue(5, ["status: ready", "P2"]),
        issue(9, ["status: ready", "P1"]),
        issue(7, ["Status: Ready", "P1"]),
        issue(1, ["status: ready"]),
      ],
      options,
    );
    expect(result).toMatchObject({ kind: "picked", issue: { number: 7 } });
  });

  it.each([
    ["blocked", issue(1, ["status: blocked", "P0"])],
    ["claimed", issue(1, ["status: ready", "agent: claude"])],
    ["in progress", issue(1, ["status: ready", "status: in-progress"])],
    ["for humans", issue(1, ["status: ready", "agent: human"])],
    ["an epic", issue(1, ["status: ready", "type: epic"])],
    ["assigned", issue(1, ["status: ready"], { assignees: ["someone"] })],
    ["a good first issue", issue(1, ["status: ready", "good first issue"])],
    ["not from the backlog", issue(1, ["status: ready"], { body: "Please do this" })],
    ["empty", issue(1, ["status: ready"], { body: null })],
  ])("skips an issue that is %s", (_name, skipped) => {
    expect(pickNextIssue([skipped], options)).toEqual({
      kind: "none",
      reason: "no ready, unclaimed issue",
    });
  });

  it("skips issues an open pull request already references", () => {
    const result = pickNextIssue(
      [issue(3, ["status: ready", "P0"]), issue(4, ["status: ready"]), pr(10, "Closes #3")],
      options,
    );
    expect(result).toMatchObject({ kind: "picked", issue: { number: 4 } });
  });

  it("stops when the agent work in flight reaches the limit", () => {
    const result = pickNextIssue(
      [
        issue(1, ["status: ready"]),
        issue(2, ["agent: claude"]),
        pr(11, "Closes #9", ["agent: claude"]),
      ],
      options,
    );
    expect(result).toEqual({ kind: "none", reason: "2 agent task(s) in flight (limit 2)" });
  });
});

describe("countInFlight", () => {
  it("counts a claimed issue and its pull request once", () => {
    expect(
      countInFlight([
        issue(3, ["agent: claude"]),
        pr(10, "Closes #3", ["agent: claude"]),
        pr(11, "Closes #8", ["agent: claude"]),
        pr(12, "Closes #9"),
        issue(4, ["status: ready"]),
      ]),
    ).toBe(2);
  });
});

describe("referencedIssues", () => {
  it("collects #N references but not URLs fragments or other repositories", () => {
    expect([
      ...referencedIssues({
        title: "fix(core): thing (#12)",
        body: "Closes #3, refs #45.\nSee acme/other#7 and https://x.test/page#8",
      }),
    ]).toEqual([12, 3, 45]);
    expect(referencedIssues({ title: "x", body: null }).size).toBe(0);
  });
});

describe("claimComment", () => {
  it("links the run when there is one", () => {
    expect(claimComment("https://run")).toContain("Run: https://run");
    expect(claimComment(undefined)).not.toContain("Run:");
  });
});
