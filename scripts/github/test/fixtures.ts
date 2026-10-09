import type { BacklogSources } from "../src/load.ts";

export const labelsYaml = `
- name: "type: feature"
  color: "a2eeef"
  description: "New functionality"
- name: "type: epic"
  color: "3e4b9e"
- name: "type: docs"
  color: "0075ca"
- name: "area: core"
  color: "1d76db"
- name: "area: docs"
  color: "1d76db"
- name: P1
  color: d93f0b
- name: P2
  color: fbca04
- name: "size: S"
  color: c2e0c6
- name: "size: M"
  color: bfdadc
- name: "size: L"
  color: bfd4f2
- name: "status: ready"
  color: 0e8a16
- name: "status: blocked"
  color: e99695
- name: good first issue
  color: 7057ff
`;

export const milestonesYaml = `
- title: "v0.1 Foundation"
  description: "First"
- title: "v0.2 Core"
  description: "Second"
  due_on: "2026-12-31"
`;

export const backlogYaml = `
milestone: "v0.1 Foundation"
items:
  - id: CORE-001
    title: "Epic: the core"
    type: epic
    areas: [core]
    priority: P1
    size: L
    status: ready
    children: [CORE-002, CORE-003]
    body: |
      The epic.
    acceptance:
      - All children done
  - id: CORE-002
    title: "Money package"
    type: feature
    areas: [core]
    priority: P1
    size: M
    status: ready
    state: done
    body: |
      Money, see [the docs](../../docs/money.md).
    acceptance:
      - Uses bigint
      - Has tests
  - id: CORE-003
    title: "Rounding rules"
    type: feature
    areas: [core]
    priority: P2
    size: S
    status: blocked
    milestone: "v0.2 Core"
    depends_on: [CORE-002]
    labels: ["good first issue"]
    body: Rounding.
    acceptance:
      - Rounds
`;

export function sources(
  overrides: Partial<Record<"labels" | "milestones" | "backlog", string>> = {},
): BacklogSources {
  return {
    labels: { path: ".github/labels.yml", content: overrides.labels ?? labelsYaml },
    milestones: { path: ".github/milestones.yml", content: overrides.milestones ?? milestonesYaml },
    backlog: [{ path: ".github/backlog/01-core.yml", content: overrides.backlog ?? backlogYaml }],
  };
}
