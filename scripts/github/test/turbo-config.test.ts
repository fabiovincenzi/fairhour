import { describe, expect, it } from "vitest";
import { readTurboConfig } from "./turbo-json.ts";

// Workspace packages are consumed from source (see ADR-0001), so a task's cache hash must change
// when the source of any package it depends on changes. Turborepo only hashes a task's own
// package and the *tasks* it depends on: `dependsOn: ["^typecheck"]` would serialise the packages,
// and without any dependency a change to a library would not invalidate its dependents. The
// "transit" task does nothing, but it connects every package to its dependencies, so the tasks
// below stay parallel and still get a new hash. Details: "Transit Nodes" in the Turborepo docs.

/** Cached tasks whose result depends on the source of the packages they import. */
const SOURCE_DEPENDENT_TASKS = ["build", "lint", "typecheck", "test", "test:integration"] as const;

describe("turbo.json transit task", () => {
  const turbo = readTurboConfig();

  it("links every package to the packages it depends on", () => {
    expect(turbo.tasks.transit?.dependsOn).toEqual(["^transit"]);
  });

  it.each(SOURCE_DEPENDENT_TASKS)("makes %s depend on transit", (task) => {
    expect(turbo.tasks[task]?.dependsOn).toContain("transit");
  });

  it("does not serialise lint, typecheck and test across packages", () => {
    for (const task of ["lint", "typecheck", "test", "test:integration"]) {
      expect(turbo.tasks[task]?.dependsOn, task).toEqual(["transit"]);
    }
  });
});
