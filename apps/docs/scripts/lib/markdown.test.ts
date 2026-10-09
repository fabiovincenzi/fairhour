import { describe, expect, it } from "vitest";
import {
  convertAlerts,
  extractTitle,
  hasFrontmatterKey,
  mapLinesOutsideFences,
  normalizeNewlines,
  plainText,
  splitFrontmatter,
  titleFromFilename,
} from "./markdown.ts";

describe("normalizeNewlines", () => {
  it("converts CRLF and CR to LF", () => {
    expect(normalizeNewlines("a\r\nb\rc\n")).toBe("a\nb\nc\n");
  });
});

describe("splitFrontmatter", () => {
  it("returns the YAML and the body", () => {
    expect(splitFrontmatter("---\ntitle: A\nx: 1\n---\n\nBody\n")).toEqual({
      frontmatter: "title: A\nx: 1",
      body: "\nBody\n",
    });
  });

  it("handles an empty frontmatter and a file that ends at the closing fence", () => {
    expect(splitFrontmatter("---\n---\nBody")).toEqual({ frontmatter: "", body: "Body" });
    expect(splitFrontmatter("---\ntitle: A\n---")).toEqual({ frontmatter: "title: A", body: "" });
  });

  it("does not treat a thematic break in the middle of a file as frontmatter", () => {
    const source = "# Title\n\n---\n\ntext\n---\n";
    expect(splitFrontmatter(source)).toEqual({ frontmatter: null, body: source });
  });
});

describe("hasFrontmatterKey", () => {
  it("only matches top-level keys", () => {
    const yaml = "title: A\nsidebar:\n  order: 1\nhero:\n  title: B";
    expect(hasFrontmatterKey(yaml, "title")).toBe(true);
    expect(hasFrontmatterKey(yaml, "sidebar")).toBe(true);
    expect(hasFrontmatterKey(yaml, "order")).toBe(false);
    expect(hasFrontmatterKey(yaml, "editUrl")).toBe(false);
  });
});

describe("mapLinesOutsideFences", () => {
  it("skips fenced code blocks of both kinds, including longer fences", () => {
    const body = [
      "a",
      "```ts",
      "b",
      "```",
      "c",
      "~~~",
      "d",
      "~~~",
      "````",
      "```",
      "e",
      "````",
      "f",
    ];
    const seen: string[] = [];
    const result = mapLinesOutsideFences(body.join("\n"), (line) => {
      seen.push(line);
      return [line.toUpperCase()];
    });
    expect(seen).toEqual(["a", "c", "f"]);
    expect(result.split("\n")).toEqual([
      "A",
      "```ts",
      "b",
      "```",
      "C",
      "~~~",
      "d",
      "~~~",
      "````",
      "```",
      "e",
      "````",
      "F",
    ]);
  });

  it("keeps an unterminated fence open until the end", () => {
    const seen: string[] = [];
    mapLinesOutsideFences("a\n```\nb\nc", (line) => {
      seen.push(line);
      return [line];
    });
    expect(seen).toEqual(["a"]);
  });

  it("does not close a fence with a different marker or with trailing text", () => {
    const seen: string[] = [];
    mapLinesOutsideFences("```\n~~~\n``` js\nx\n```\ny", (line) => {
      seen.push(line);
      return [line];
    });
    expect(seen).toEqual(["y"]);
  });

  it("lets the visitor drop or add lines and see its neighbours", () => {
    const result = mapLinesOutsideFences("a\nb\nc", (line, index, lines) =>
      line === "b" ? [] : [`${line}${index}${lines.length}`, "+"],
    );
    expect(result).toBe("a03\n+\nc23\n+");
  });
});

describe("plainText", () => {
  it("strips inline Markdown from a heading", () => {
    expect(plainText("The `@fairhour/money` **API** and _more_")).toBe(
      "The @fairhour/money API and more",
    );
    expect(plainText("[A link](https://example.com) and ![img](x.png) and [ref][1]")).toBe(
      "A link and img and ref",
    );
    expect(plainText("Use <kbd>Ctrl</kbd> \\* here")).toBe("Use Ctrl * here");
  });

  it("keeps snake_case and star emphasis", () => {
    expect(plainText("snake_case_name and *star* and __bold__")).toBe(
      "snake_case_name and star and bold",
    );
  });
});

describe("extractTitle", () => {
  it("takes the first H1, removes it and the blank line after it", () => {
    expect(extractTitle("# Hello `world`\n\nText\n\n# Second\n")).toEqual({
      title: "Hello world",
      body: "Text\n\n# Second\n",
    });
  });

  it("keeps the spacing when the heading sits between paragraphs", () => {
    expect(extractTitle("intro\n\n# Title\n\ntext").body).toBe("intro\n\ntext");
    expect(extractTitle("intro\n# Title\n\ntext").body).toBe("intro\n\ntext");
  });

  it("removes a closing sequence and ignores deeper headings and fenced comments", () => {
    expect(extractTitle("```sh\n# not a title\n```\n\n## Sub\n\n# Real ##\n").title).toBe("Real");
    expect(extractTitle("## Only sub\n").title).toBeNull();
  });

  it("returns the body untouched when there is no H1", () => {
    expect(extractTitle("text\n\n## Sub\n")).toEqual({ title: null, body: "text\n\n## Sub\n" });
  });

  it("handles a heading on the last line", () => {
    expect(extractTitle("text\n# Title")).toEqual({ title: "Title", body: "text" });
  });
});

describe("titleFromFilename", () => {
  it("humanizes file names", () => {
    expect(titleFromFilename("release-process.md")).toBe("Release process");
    expect(titleFromFilename("tax_engine")).toBe("Tax engine");
    expect(titleFromFilename(".md")).toBe(".md");
    expect(titleFromFilename("")).toBe("");
  });
});

describe("convertAlerts", () => {
  it("converts every GitHub alert type to a Starlight aside", () => {
    const source = [
      "> [!NOTE]",
      "> A note",
      "",
      "> [!TIP]",
      "> A tip",
      "",
      "> [!IMPORTANT]",
      "> Important",
      "",
      "> [!WARNING]",
      "> Careful",
      "> on two lines",
      "",
      "> [!CAUTION]",
      "> Danger",
    ].join("\n");
    expect(convertAlerts(source)).toBe(
      [
        ":::note",
        "A note",
        ":::",
        "",
        ":::tip",
        "A tip",
        ":::",
        "",
        ":::note[Important]",
        "Important",
        ":::",
        "",
        ":::caution[Warning]",
        "Careful",
        "on two lines",
        ":::",
        "",
        ":::danger[Caution]",
        "Danger",
        ":::",
      ].join("\n"),
    );
  });

  it("keeps blank quoted lines and ends the alert at the first unquoted line", () => {
    expect(convertAlerts("> [!NOTE]\n> a\n>\n> b\ntext")).toBe(":::note\na\n\nb\n:::\ntext");
  });

  it("leaves ordinary blockquotes and alerts inside code fences alone", () => {
    const source = "> quote\n\n```md\n> [!NOTE]\n> inside\n```\n";
    expect(convertAlerts(source)).toBe(source);
  });
});
