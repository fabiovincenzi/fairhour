import { describe, expect, it } from "vitest";
import { sources } from "../test/fixtures.ts";
import { parseBacklog } from "./load.ts";
import {
  contentHash,
  extractBacklogId,
  isUntouchedSinceSync,
  renderIssueBody,
  type RenderContext,
} from "./render.ts";
import type { ResolvedItem } from "./schema.ts";

function backlogItems(): Map<string, ResolvedItem> {
  const result = parseBacklog(sources());
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return new Map(result.backlog.items.map((item) => [item.id, item]));
}

function context(numbers: [string, number][] = []): RenderContext {
  return {
    repository: "acme/fairhour",
    branch: "main",
    issueNumbers: new Map(numbers),
    items: backlogItems(),
  };
}

function item(id: string): ResolvedItem {
  const found = backlogItems().get(id);
  if (!found) throw new Error(id);
  return found;
}

describe("renderIssueBody", () => {
  it("renders acceptance criteria, markers and an absolute link to the YAML file", () => {
    const body = renderIssueBody(item("CORE-003"), context());
    expect(body).toContain("### Acceptance criteria\n\n- [ ] Rounds");
    expect(body).toContain("### Depends on\n\n- `CORE-002` Money package");
    expect(body).toContain(
      "https://github.com/acme/fairhour/blob/main/.github/backlog/01-core.yml",
    );
    expect(body).toContain("<!-- backlog-id: CORE-003 -->");
    expect(body).toMatch(/<!-- backlog-sync: [0-9a-f]{16} -->$/);
  });

  it("checks acceptance criteria of done items and rewrites relative links", () => {
    const body = renderIssueBody(item("CORE-002"), context());
    expect(body).toContain("- [x] Uses bigint\n- [x] Has tests");
    expect(body).toContain("[the docs](https://github.com/acme/fairhour/blob/main/docs/money.md)");
  });

  it("renders epics' children as a task list using issue numbers when known", () => {
    const body = renderIssueBody(item("CORE-001"), context([["CORE-002", 7]]));
    expect(body).toContain(
      "### Sub-issues\n\n- [x] #7 (`CORE-002`)\n- [ ] `CORE-003` Rounding rules",
    );
  });

  it("falls back to the ID for references to unknown items", () => {
    const ctx = { ...context(), items: new Map<string, ResolvedItem>() };
    expect(renderIssueBody(item("CORE-003"), ctx)).toContain("- `CORE-002` CORE-002");
  });

  it("is deterministic", () => {
    expect(renderIssueBody(item("CORE-001"), context())).toBe(
      renderIssueBody(item("CORE-001"), context()),
    );
  });
});

describe("sync markers", () => {
  it("extracts the backlog ID", () => {
    expect(extractBacklogId("text\n<!-- backlog-id: CORE-012 -->")).toBe("CORE-012");
    expect(extractBacklogId("<!--backlog-id:AB-001-->")).toBe("AB-001");
    expect(extractBacklogId("no marker")).toBeUndefined();
    expect(extractBacklogId(null)).toBeUndefined();
    expect(extractBacklogId(undefined)).toBeUndefined();
  });

  it("detects whether a body was edited since the last sync", () => {
    const body = renderIssueBody(item("CORE-003"), context());
    expect(isUntouchedSinceSync(body)).toBe(true);
    expect(isUntouchedSinceSync(body.replace(/\n/g, "\r\n"))).toBe(true);
    expect(isUntouchedSinceSync(body.replace("- [ ] Rounds", "- [x] Rounds"))).toBe(false);
    expect(isUntouchedSinceSync("hand written body")).toBe(false);
    expect(isUntouchedSinceSync("")).toBe(false);
  });

  it("hashes normalized content", () => {
    expect(contentHash("a  \r\nb\n")).toBe(contentHash("a\nb"));
    expect(contentHash("a")).not.toBe(contentHash("b"));
    expect(contentHash("x")).toHaveLength(16);
  });
});
