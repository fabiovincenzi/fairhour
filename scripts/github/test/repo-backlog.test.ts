import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseBacklog, readBacklogSources } from "../src/load.ts";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

describe("the repository backlog", async () => {
  const result = parseBacklog(await readBacklogSources(repoRoot));

  it("is valid", () => {
    expect(result.ok ? [] : result.errors).toEqual([]);
  });

  if (!result.ok) return;
  const { items, milestones, labels } = result.backlog;

  it("has at least 60 issues and 15 good first issues", () => {
    expect(items.length).toBeGreaterThanOrEqual(60);
    expect(items.filter((i) => i.labels.includes("good first issue")).length).toBeGreaterThanOrEqual(15);
  });

  it("has items in every milestone and epics with task lists", () => {
    for (const milestone of milestones) {
      expect(items.some((i) => i.milestone === milestone.title), milestone.title).toBe(true);
    }
    expect(items.filter((i) => i.type === "epic").length).toBeGreaterThanOrEqual(10);
  });

  it("defines every label the task requires", () => {
    const names = new Set(labels.map((l) => l.name));
    const required = [
      ...["bug", "feature", "docs", "chore", "refactor", "security"].map((t) => `type: ${t}`),
      ...["web", "desktop", "api", "db", "tax-core", "tax-pack-it", "i18n", "docs", "infra"].map((a) => `area: ${a}`),
      "P0", "P1", "P2", "P3",
      ...["triage", "ready", "blocked", "in-progress"].map((s) => `status: ${s}`),
      ...["S", "M", "L", "XL"].map((s) => `size: ${s}`),
      "good first issue", "help wanted", "tax-pack-request", "translation", "pinned",
    ];
    for (const label of required) expect(names.has(label), label).toBe(true);
  });
});
