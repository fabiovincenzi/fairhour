import { describe, expect, it } from "vitest";
import {
  adrSidebarLabel,
  editUrl,
  labelBeforeColon,
  labelWithoutParentheses,
  transformDocument,
  type DocumentOptions,
} from "./transform.ts";

const REPO = "https://github.com/fabiovincenzi/fairhour";

const options: DocumentOptions = {
  sourcePath: "docs/maintainers/triage.md",
  routes: new Map([
    ["docs/maintainers/triage.md", "maintainers/triage"],
    ["docs/maintainers/labels.md", "maintainers/labels"],
  ]),
  base: "/fairhour",
  repo: { url: REPO, branch: "main" },
};

const HEADER =
  "# Generated from docs/maintainers/triage.md by scripts/sync-content.ts. Do not edit.";

describe("adrSidebarLabel", () => {
  it("shortens ADR titles at the second colon", () => {
    expect(
      adrSidebarLabel("ADR-0002: Licensing: AGPL-3.0 for the product, MIT for the libraries"),
    ).toBe("ADR-0002: Licensing");
    expect(adrSidebarLabel("ADR-0001: Technology stack")).toBe("ADR-0001: Technology stack");
  });

  it("labels the template and ignores other titles", () => {
    expect(adrSidebarLabel("ADR-NNNN: Short noun phrase naming the decision")).toBe("Template");
    expect(adrSidebarLabel("Architecture Decision Records")).toBeUndefined();
  });
});

describe("labelBeforeColon", () => {
  it("keeps what comes before the first colon", () => {
    expect(labelBeforeColon("Tax engine design: `@fairhour/money`, `@fairhour/tax-core`")).toBe(
      "Tax engine design",
    );
  });

  it("returns undefined when there is nothing to shorten", () => {
    expect(labelBeforeColon("Tax engine design")).toBeUndefined();
    expect(labelBeforeColon(": odd")).toBeUndefined();
  });
});

describe("labelWithoutParentheses", () => {
  it("drops a trailing parenthetical", () => {
    expect(labelWithoutParentheses("Italy tax pack (@fairhour/tax-pack-it)")).toBe(
      "Italy tax pack",
    );
  });

  it("returns undefined when there is nothing to drop", () => {
    expect(labelWithoutParentheses("Italy tax pack")).toBeUndefined();
    expect(labelWithoutParentheses("(only this)")).toBeUndefined();
    expect(labelWithoutParentheses("A (b) c")).toBeUndefined();
  });
});

describe("editUrl", () => {
  it("points at the file on the configured branch", () => {
    expect(editUrl("docs/adr/README.md", { url: REPO, branch: "main" })).toBe(
      `${REPO}/edit/main/docs/adr/README.md`,
    );
  });
});

describe("transformDocument", () => {
  it("derives the title from the H1, drops it and adds the edit URL", () => {
    const output = transformDocument("# Triage guide\n\nSee [labels](labels.md).\n", options);
    expect(output).toBe(
      [
        "---",
        HEADER,
        'title: "Triage guide"',
        `editUrl: "${REPO}/edit/main/docs/maintainers/triage.md"`,
        "---",
        "",
        "See [labels](/fairhour/maintainers/labels/).",
        "",
      ].join("\n"),
    );
  });

  it("keeps existing frontmatter and adds only what is missing", () => {
    const source = '---\ntitle: Custom\ndescription: "Hello"\n---\n\n# Triage guide\n\nBody\n';
    const output = transformDocument(source, { ...options, order: 4, sidebarLabel: () => "Label" });
    expect(output).toBe(
      [
        "---",
        HEADER,
        "title: Custom",
        'description: "Hello"',
        // The title came from the frontmatter, so no label is derived; the order is still added.
        "sidebar:",
        "  order: 4",
        `editUrl: "${REPO}/edit/main/docs/maintainers/triage.md"`,
        "---",
        "",
        "Body",
        "",
      ].join("\n"),
    );
  });

  it("does not override a sidebar or editUrl that the file already sets", () => {
    const source = "---\nsidebar:\n  order: 9\neditUrl: false\n---\n# Title\n\nBody";
    const output = transformDocument(source, { ...options, order: 1 });
    expect(output).toContain("sidebar:\n  order: 9\n");
    expect(output).not.toContain("order: 1");
    expect(output).toContain("editUrl: false");
    expect(output).not.toContain("edit/main");
  });

  it("adds the sidebar order and a derived label", () => {
    const output = transformDocument("# ADR-0003: Money: bigint\n\nBody", {
      ...options,
      order: 3,
      sidebarLabel: adrSidebarLabel,
    });
    expect(output).toContain(
      'title: "ADR-0003: Money: bigint"\nsidebar:\n  label: "ADR-0003: Money"\n  order: 3\n',
    );
  });

  it("omits the sidebar block without order and label", () => {
    expect(transformDocument("# T\n\nx", options)).not.toContain("sidebar");
  });

  it("falls back to the file name when there is no H1, and escapes YAML specials", () => {
    const withoutHeading = transformDocument("Just text\n", options);
    expect(withoutHeading).toContain('title: "Triage"');
    const quoted = transformDocument('# Say "hi": a # b\n\nx', options);
    expect(quoted).toContain('title: "Say \\"hi\\": a # b"');
  });

  it("converts alerts, normalizes line endings and trims blank lines", () => {
    const output = transformDocument("# T\r\n\r\n> [!NOTE]\r\n> Careful\r\n\r\n\r\n", options);
    expect(output.endsWith("---\n\n:::note\nCareful\n:::\n")).toBe(true);
    expect(output).not.toContain("\r");
  });

  it("handles an empty frontmatter block", () => {
    const output = transformDocument("---\n---\n# T\n\nx", options);
    expect(output).toContain(`${HEADER}\ntitle: "T"\n`);
  });
});
