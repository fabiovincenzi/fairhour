import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { backlogYaml, labelsYaml, milestonesYaml, sources } from "../test/fixtures.ts";
import { parseBacklog, readBacklogSources, resolveItemLabels } from "./load.ts";

function errorsOf(overrides: Parameters<typeof sources>[0]): readonly string[] {
  const result = parseBacklog(sources(overrides));
  if (result.ok) throw new Error("expected the backlog to be invalid");
  return result.errors;
}

describe("parseBacklog", () => {
  it("resolves labels, milestones and state for a valid backlog", () => {
    const result = parseBacklog(sources());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [epic, money, rounding] = result.backlog.items;
    expect(epic?.labels).toEqual(["type: epic", "area: core", "P1", "size: L", "status: ready"]);
    expect(epic?.milestone).toBe("v0.1 Foundation");
    expect(money?.done).toBe(true);
    expect(money?.labels).not.toContain("status: ready");
    expect(rounding?.milestone).toBe("v0.2 Core");
    expect(rounding?.labels).toContain("good first issue");
    expect(rounding?.sourceFile).toBe(".github/backlog/01-core.yml");
    expect(result.backlog.labels.find((l) => l.name === "type: epic")?.description).toBe("");
  });

  const replace = (from: string, to: string): string => backlogYaml.replace(from, to);

  it.each([
    ["invalid YAML", { backlog: "items: [" }, /invalid YAML/],
    ["schema violation", { backlog: replace("priority: P2", "priority: P9") }, /priority/],
    [
      "unknown field",
      { backlog: replace("    body: Rounding.", "    owner: me\n    body: Rounding.") },
      /owner|Unrecognized/i,
    ],
    [
      "unknown label",
      { backlog: replace('labels: ["good first issue"]', 'labels: ["nope"]') },
      /unknown label "nope"/,
    ],
    [
      "unknown milestone",
      { backlog: replace('milestone: "v0.2 Core"', 'milestone: "v9"') },
      /unknown milestone "v9"/,
    ],
    [
      "missing milestone",
      { backlog: replace('milestone: "v0.1 Foundation"\n', "") },
      /CORE-001: no milestone/,
    ],
    [
      "unknown reference",
      { backlog: replace("depends_on: [CORE-002]", "depends_on: [CORE-099]") },
      /unknown reference CORE-099/,
    ],
    [
      "self reference",
      { backlog: replace("depends_on: [CORE-002]", "depends_on: [CORE-003]") },
      /refers to itself/,
    ],
    [
      "epic without children",
      { backlog: replace("children: [CORE-002, CORE-003]", "children: []") },
      /epics need at least one child/,
    ],
    [
      "children on a non-epic",
      { backlog: replace("depends_on: [CORE-002]", "children: [CORE-002]") },
      /only epics can have children/,
    ],
    [
      "large good first issue",
      { backlog: replace("size: S", "size: L") },
      /good first issue must be size S or M/,
    ],
    [
      "bad label color",
      { labels: labelsYaml.replace('color: "a2eeef"', 'color: "#a2eeef"') },
      /color/,
    ],
    [
      "duplicate label",
      { labels: `${labelsYaml}\n- name: P1\n  color: ffffff\n` },
      /duplicate label "P1"/,
    ],
    [
      "duplicate milestone",
      { milestones: `${milestonesYaml}\n- title: "v0.2 Core"\n` },
      /duplicate milestone/,
    ],
  ])("reports %s", (_name, overrides, pattern) => {
    expect(errorsOf(overrides).join("\n")).toMatch(pattern);
  });

  it("reports duplicate IDs across files", () => {
    const base = sources();
    const result = parseBacklog({
      ...base,
      backlog: [...base.backlog, { path: ".github/backlog/02.yml", content: backlogYaml }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors.join("\n")).toMatch(/02\.yml: CORE-001: duplicate backlog ID/);
  });

  it("reports a child listed under two epics", () => {
    const second = `
milestone: "v0.1 Foundation"
items:
  - id: EPIC-001
    title: "Another epic"
    type: epic
    areas: [core]
    priority: P1
    size: L
    status: ready
    children: [CORE-002]
    body: x
    acceptance: [y]
`;
    const base = sources();
    const result = parseBacklog({
      ...base,
      backlog: [...base.backlog, { path: ".github/backlog/02.yml", content: second }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join("\n")).toMatch(/CORE-002: listed under two epics/);
  });

  it("detects dependency cycles", () => {
    const yaml = replace("    state: done\n", "    state: done\n    depends_on: [CORE-003]\n");
    expect(errorsOf({ backlog: yaml }).join("\n")).toMatch(
      /dependency cycle: CORE-00\d → CORE-00\d → CORE-00\d/,
    );
  });
});

describe("resolveItemLabels", () => {
  it("deduplicates and omits the status label of done items", () => {
    expect(
      resolveItemLabels({
        id: "X-001",
        title: "Title",
        type: "docs",
        areas: ["docs", "docs"],
        priority: "P3",
        size: "S",
        status: "ready",
        labels: ["P3"],
        state: "done",
        depends_on: [],
        children: [],
        body: "b",
        acceptance: ["a"],
      }),
    ).toEqual(["type: docs", "area: docs", "P3", "size: S"]);
  });
});

describe("readBacklogSources", () => {
  it("reads labels, milestones and only YAML backlog files in sorted order", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "backlog-"));
    await mkdir(path.join(root, ".github", "backlog"), { recursive: true });
    await writeFile(path.join(root, ".github", "labels.yml"), labelsYaml);
    await writeFile(path.join(root, ".github", "milestones.yml"), milestonesYaml);
    await writeFile(path.join(root, ".github", "backlog", "b.yml"), backlogYaml);
    await writeFile(path.join(root, ".github", "backlog", "a.yaml"), "items: []");
    await writeFile(path.join(root, ".github", "backlog", "README.md"), "# docs");
    const result = await readBacklogSources(root);
    expect(result.backlog.map((file) => file.path)).toEqual([
      ".github/backlog/a.yaml",
      ".github/backlog/b.yml",
    ]);
    expect(result.labels.content).toBe(labelsYaml);
  });
});
