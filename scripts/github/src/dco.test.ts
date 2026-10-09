import { describe, expect, it } from "vitest";
import {
  FIELD_SEPARATOR,
  RECORD_SEPARATOR,
  checkDco,
  formatDcoResult,
  isBot,
  parseGitLog,
  signOffs,
  type CommitInfo,
} from "./dco.ts";

const commit = (overrides: Partial<CommitInfo>): CommitInfo => ({
  sha: "a".repeat(40),
  authorName: "Ada Lovelace",
  authorEmail: "ada@example.com",
  message: "feat: x\n\nSigned-off-by: Ada Lovelace <ada@example.com>",
  parentCount: 1,
  ...overrides,
});

describe("checkDco", () => {
  it.each([
    ["signed off", commit({}), true],
    ["case-insensitive email", commit({ message: "fix\n\nsigned-off-by: Ada <ADA@Example.com>" }), true],
    ["co-authored with own sign-off", commit({ message: "x\n\nSigned-off-by: Bob <bob@x.io>\nSigned-off-by: Ada <ada@example.com>" }), true],
    ["missing sign-off", commit({ message: "feat: nope" }), false],
    ["someone else's sign-off", commit({ message: "x\n\nSigned-off-by: Bob <bob@x.io>" }), false],
    ["sign-off inside a sentence", commit({ message: "x\n\nPlease add Signed-off-by: Ada <ada@example.com> later" }), false],
  ])("%s", (_name, input, ok) => {
    expect(checkDco([input]).ok).toBe(ok);
  });

  it("skips merge commits and bots", () => {
    const result = checkDco([
      commit({ sha: "m", parentCount: 2, message: "Merge" }),
      commit({ sha: "r", authorName: "renovate[bot]", authorEmail: "29139614+renovate[bot]@users.noreply.github.com", message: "chore(deps)" }),
      commit({ sha: "ok" }),
    ]);
    expect(result).toMatchObject({ ok: true, checked: 1 });
    expect(result.skipped).toEqual([
      { sha: "m", reason: "merge commit" },
      { sha: "r", reason: "bot author" },
    ]);
  });

  it("explains failures", () => {
    const result = checkDco([
      commit({ sha: "1".repeat(40), message: "feat: one" }),
      commit({ sha: "2".repeat(40), message: "fix: two\n\nSigned-off-by: Bob <bob@x.io>" }),
    ]);
    expect(result.failures).toHaveLength(2);
    const text = formatDcoResult(result);
    expect(text).toContain("❌ DCO: 2 of 2 commit(s)");
    expect(text).toContain('111111111111 "feat: one": missing Signed-off-by line');
    expect(text).toContain("does not match the author email (ada@example.com)");
    expect(text).toContain("git rebase --signoff");
    expect(formatDcoResult(checkDco([commit({})]))).toBe("✅ DCO: all 1 commit(s) are signed off.");
  });
});

describe("helpers", () => {
  it("detects bots by name or noreply email", () => {
    expect(isBot(commit({ authorName: "github-actions[bot]" }))).toBe(true);
    expect(isBot(commit({ authorEmail: "49699333+dependabot[bot]@users.noreply.github.com" }))).toBe(true);
    expect(isBot(commit({}))).toBe(false);
  });

  it("extracts every sign-off", () => {
    expect(signOffs("x\nSigned-off-by: A B <a@b.c>\nSigned-off-by:C<c@d.e>")).toEqual([
      { name: "A B", email: "a@b.c" },
      { name: "C", email: "c@d.e" },
    ]);
  });

  it("parses git log output", () => {
    const record = (fields: string[]): string => fields.join(FIELD_SEPARATOR) + RECORD_SEPARATOR;
    const output =
      record(["sha1", "Ada", "ada@example.com", "p1", "feat: x\n\nSigned-off-by: Ada <ada@example.com>\n"]) +
      "\n" +
      record(["sha2", "Bob", "bob@x.io", "p1 p2", "Merge branch"]) +
      "\n" +
      record(["sha3", "Root", "root@x.io", "", "initial"]) +
      "\n";
    expect(parseGitLog(output)).toEqual([
      { sha: "sha1", authorName: "Ada", authorEmail: "ada@example.com", message: "feat: x\n\nSigned-off-by: Ada <ada@example.com>", parentCount: 1 },
      { sha: "sha2", authorName: "Bob", authorEmail: "bob@x.io", message: "Merge branch", parentCount: 2 },
      { sha: "sha3", authorName: "Root", authorEmail: "root@x.io", message: "initial", parentCount: 0 },
    ]);
    expect(parseGitLog("")).toEqual([]);
  });
});
