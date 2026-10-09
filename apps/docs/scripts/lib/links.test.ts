import { describe, expect, it } from "vitest";
import { rewriteLinks, rewriteTarget, type LinkContext } from "./links.ts";

const REPO = "https://github.com/fabiovincenzi/fairhour";

const routes = new Map([
  ["docs/adr/README.md", "adr"],
  ["docs/adr/0001-technology-stack.md", "adr/0001-technology-stack"],
  ["docs/adr/0002-licensing.md", "adr/0002-licensing"],
  ["docs/maintainers/release-process.md", "maintainers/release-process"],
  ["CONTRIBUTING.md", "contributing/guide"],
]);

const context: LinkContext = {
  sourcePath: "docs/adr/0001-technology-stack.md",
  routes,
  base: "/fairhour",
  repo: { url: REPO, branch: "main" },
};

describe("rewriteTarget", () => {
  it("leaves external URLs, anchors, mail links and links with the base path alone", () => {
    for (const target of [
      "https://example.com/a",
      "http://example.com",
      "mailto:a@b.c",
      "tel:+39",
      "//cdn.example.com/x.js",
      "#decision",
      "",
      "/fairhour/self-hosting/",
      "?plain=1",
    ]) {
      expect(rewriteTarget(target, context)).toBe(target);
    }
  });

  it("maps links between synced documents to site routes and keeps the fragment", () => {
    expect(rewriteTarget("0002-licensing.md", context)).toBe("/fairhour/adr/0002-licensing/");
    expect(rewriteTarget("./0002-licensing.md#why-mit", context)).toBe(
      "/fairhour/adr/0002-licensing/#why-mit",
    );
    expect(rewriteTarget("../maintainers/release-process.md", context)).toBe(
      "/fairhour/maintainers/release-process/",
    );
    expect(rewriteTarget("../../CONTRIBUTING.md#dco", context)).toBe(
      "/fairhour/contributing/guide/#dco",
    );
  });

  it("maps links to a directory with a README to the section index", () => {
    expect(rewriteTarget("../adr/", context)).toBe("/fairhour/adr/");
    expect(rewriteTarget(".", context)).toBe("/fairhour/adr/");
    expect(rewriteTarget("README.md", context)).toBe("/fairhour/adr/");
  });

  it("maps everything else to GitHub, as a file or as a directory", () => {
    expect(rewriteTarget("../../CLAUDE.md#conventions", context)).toBe(
      `${REPO}/blob/main/CLAUDE.md#conventions`,
    );
    expect(rewriteTarget("../../.github/workflows/ci.yml?plain=1", context)).toBe(
      `${REPO}/blob/main/.github/workflows/ci.yml?plain=1`,
    );
    expect(rewriteTarget("../../.github/backlog/", context)).toBe(
      `${REPO}/tree/main/.github/backlog`,
    );
    expect(rewriteTarget("../../packages/money", context)).toBe(`${REPO}/blob/main/packages/money`);
    expect(rewriteTarget("../../", context)).toBe(REPO);
    expect(rewriteTarget("../..#readme", context)).toBe(`${REPO}#readme`);
  });

  it("uses the raw file URL for images and keeps links to missing synced files linkable", () => {
    expect(rewriteTarget("../assets/logo-placeholder.svg", context, true)).toBe(
      `${REPO}/raw/main/docs/assets/logo-placeholder.svg`,
    );
    expect(rewriteTarget("NNNN-title.md", context)).toBe(
      `${REPO}/blob/main/docs/adr/NNNN-title.md`,
    );
  });

  it("resolves root-absolute paths against the repository root", () => {
    expect(rewriteTarget("/docs/adr/0002-licensing.md", context)).toBe(
      "/fairhour/adr/0002-licensing/",
    );
    expect(rewriteTarget("/LICENSE", context)).toBe(`${REPO}/blob/main/LICENSE`);
  });

  it("leaves paths that escape the repository alone", () => {
    expect(rewriteTarget("../../../outside.md", context)).toBe("../../../outside.md");
    expect(rewriteTarget("../../..", context)).toBe("../../..");
  });

  it("works for documents in the repository root", () => {
    const root = { ...context, sourcePath: "CONTRIBUTING.md" };
    expect(rewriteTarget("docs/adr/0001-technology-stack.md", root)).toBe(
      "/fairhour/adr/0001-technology-stack/",
    );
    expect(rewriteTarget("SECURITY.md", root)).toBe(`${REPO}/blob/main/SECURITY.md`);
  });

  it("honours a different base path and branch", () => {
    const other: LinkContext = {
      ...context,
      base: "",
      repo: { url: "https://x.test/r", branch: "dev" },
    };
    expect(rewriteTarget("0002-licensing.md", other)).toBe("/adr/0002-licensing/");
    expect(rewriteTarget("../../LICENSE", other)).toBe("https://x.test/r/blob/dev/LICENSE");
  });
});

describe("rewriteLinks", () => {
  it("rewrites inline links, images, reference definitions and HTML attributes", () => {
    const body = [
      "See [ADR-2](0002-licensing.md) and [code](../../packages/money/src/index.ts).",
      "![diagram](../assets/d.svg) and [![badge](../assets/b.svg)](0002-licensing.md)",
      "[ref]: ../maintainers/release-process.md",
      '[titled]: <0002-licensing.md> "Title"',
      '<a href="0002-licensing.md">x</a> <img src=\'../assets/i.png\' alt="">',
    ].join("\n");
    expect(rewriteLinks(body, context).split("\n")).toEqual([
      "See [ADR-2](/fairhour/adr/0002-licensing/) and [code](" +
        `${REPO}/blob/main/packages/money/src/index.ts).`,
      `![diagram](${REPO}/raw/main/docs/assets/d.svg) and ` +
        `[![badge](${REPO}/raw/main/docs/assets/b.svg)](/fairhour/adr/0002-licensing/)`,
      "[ref]: /fairhour/maintainers/release-process/",
      '[titled]: /fairhour/adr/0002-licensing/ "Title"',
      '<a href="/fairhour/adr/0002-licensing/">x</a> ' +
        `<img src='${REPO}/raw/main/docs/assets/i.png' alt="">`,
    ]);
  });

  it("keeps link titles, nested parentheses and angle-bracket destinations", () => {
    expect(rewriteLinks('[a](0002-licensing.md "The title")', context)).toBe(
      '[a](/fairhour/adr/0002-licensing/ "The title")',
    );
    expect(rewriteLinks("[a](../../a(b).md)", context)).toBe(`[a](${REPO}/blob/main/a(b).md)`);
    expect(rewriteLinks("[a](<../../my file.md>)", context)).toBe(
      `[a](<${REPO}/blob/main/my file.md>)`,
    );
    expect(rewriteLinks("[a](<0002-licensing.md>)", context)).toBe(
      "[a](/fairhour/adr/0002-licensing/)",
    );
  });

  it("does not touch code spans, fenced code or unchanged links", () => {
    const body = [
      "`[a](0002-licensing.md)` and [b](0002-licensing.md) and ``[c](x.md)``",
      "[label with `code`](0002-licensing.md)",
      "```md",
      "[d](0002-licensing.md)",
      "```",
      "[e](https://example.com) <https://example.com/x.md> [f](#anchor)",
    ].join("\n");
    expect(rewriteLinks(body, context).split("\n")).toEqual([
      "`[a](0002-licensing.md)` and [b](/fairhour/adr/0002-licensing/) and ``[c](x.md)``",
      "[label with `code`](/fairhour/adr/0002-licensing/)",
      "```md",
      "[d](0002-licensing.md)",
      "```",
      "[e](https://example.com) <https://example.com/x.md> [f](#anchor)",
    ]);
  });

  it("handles several links on one line and brackets inside labels", () => {
    expect(rewriteLinks("[[x]](0002-licensing.md) [y](0001-technology-stack.md)", context)).toBe(
      "[[x]](/fairhour/adr/0002-licensing/) [y](/fairhour/adr/0001-technology-stack/)",
    );
    expect(rewriteLinks("![[x]](../a.png)", context)).toBe(`![[x]](${REPO}/raw/main/docs/a.png)`);
  });

  it("returns lines without links unchanged", () => {
    expect(rewriteLinks("plain text\n\n- item (with parentheses)", context)).toBe(
      "plain text\n\n- item (with parentheses)",
    );
  });

  it("treats an unbalanced closing bracket without an opening one as text", () => {
    expect(rewriteLinks("a](0002-licensing.md)", context)).toBe(
      "a](/fairhour/adr/0002-licensing/)",
    );
  });
});
