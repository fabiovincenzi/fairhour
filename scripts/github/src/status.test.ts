import { describe, expect, it } from "vitest";
import type { BacklogItemDef } from "./schema.ts";
import { deriveStatus, deriveStatuses, rewriteStatuses, type Status } from "./status.ts";

function def(
  id: string,
  overrides: Partial<Pick<BacklogItemDef, "status" | "state" | "depends_on">> = {},
): BacklogItemDef {
  return {
    id,
    title: `Item ${id}`,
    type: "feature",
    areas: ["core"],
    priority: "P1",
    size: "S",
    status: "ready",
    labels: [],
    state: "open",
    depends_on: [],
    children: [],
    body: "x",
    acceptance: ["y"],
    ...overrides,
  };
}

describe("deriveStatus", () => {
  const done = new Set(["A-001"]);
  const isDone = (id: string): boolean => done.has(id);

  it.each<[string, Partial<BacklogItemDef>, Status]>([
    ["no dependencies", { status: "blocked" }, "ready"],
    ["every dependency done", { status: "blocked", depends_on: ["A-001"] }, "ready"],
    ["an open dependency", { status: "ready", depends_on: ["A-001", "A-002"] }, "blocked"],
    ["triage is kept", { status: "triage", depends_on: ["A-002"] }, "triage"],
    ["in-progress is kept", { status: "in-progress", depends_on: ["A-002"] }, "in-progress"],
  ])("%s", (_name, overrides, expected) => {
    expect(deriveStatus(def("X-001", overrides), isDone)).toBe(expected);
  });
});

describe("deriveStatuses", () => {
  it("covers open items only and treats unknown dependencies as not done", () => {
    const items = new Map(
      [
        def("A-001", { state: "done" }),
        def("A-002", { status: "blocked", depends_on: ["A-001"] }),
        def("A-003", { depends_on: ["A-002"] }),
        def("A-004", { depends_on: ["Z-999"] }),
      ].map((item) => [item.id, item]),
    );
    expect([...deriveStatuses(items)]).toEqual([
      ["A-002", "ready"],
      ["A-003", "blocked"],
      ["A-004", "blocked"],
    ]);
  });
});

describe("rewriteStatuses", () => {
  const yaml = [
    "# comment: status: ready",
    "items:",
    "  - id: A-001",
    "    title: First",
    "    status: blocked # was waiting",
    "    depends_on: [B-001]",
    "  - id: A-002",
    "    body: |",
    "      status: blocked",
    "    status: ready",
    "  - id: A-003",
    "    status: in-progress",
    "",
  ].join("\n");

  it("changes only the status lines that differ, keeping comments and other text", () => {
    const result = rewriteStatuses(
      yaml,
      new Map<string, Status>([
        ["A-001", "ready"],
        ["A-002", "ready"],
      ]),
    );
    expect(result.changed).toEqual(["A-001"]);
    expect(result.content).toBe(
      yaml.replace("    status: blocked # was waiting", "    status: ready # was waiting"),
    );
  });

  it("leaves items without a computed status and status-like body text alone", () => {
    const result = rewriteStatuses(yaml, new Map<string, Status>([["A-003", "ready"]]));
    expect(result.changed).toEqual(["A-003"]);
    expect(result.content).toContain("      status: blocked\n");
    expect(rewriteStatuses(yaml, new Map()).content).toBe(yaml);
  });
});
