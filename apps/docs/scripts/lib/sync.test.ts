import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanContent, slugify, syncContent, type SyncOptions } from "./sync.ts";

let root: string;
let options: SyncOptions;

async function write(file: string, text: string): Promise<void> {
  await mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await writeFile(path.join(root, file), text);
}

async function read(file: string): Promise<string> {
  return readFile(path.join(root, file), "utf8");
}

async function tree(dir: string): Promise<string[]> {
  const entries = await readdir(path.join(root, dir), { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(path.join(root, dir), path.join(entry.parentPath, entry.name)))
    .map((file) => file.split(path.sep).join("/"))
    .sort();
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "fairhour-sync-"));
  options = {
    repoRoot: path.join(root, "repo"),
    contentDir: path.join(root, "content"),
    base: "/fairhour",
    repo: { url: "https://github.com/o/r", branch: "main" },
    directories: [],
    files: [],
  };
  await mkdir(options.contentDir, { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Release Process")).toBe("release-process");
    expect(slugify("0001-technology-stack")).toBe("0001-technology-stack");
    expect(slugify("--A__b.c--")).toBe("a-b-c");
  });
});

describe("syncContent", () => {
  it("generates pages from directories and files, mapping README to the index", async () => {
    await write(
      "repo/docs/adr/README.md",
      "# Architecture Decision Records\n\n[One](0001-one.md)\n",
    );
    await write("repo/docs/adr/0001-one.md", "# ADR-0001: One: details\n\n[Index](README.md)\n");
    await write("repo/docs/adr/0000-template.md", "# ADR-NNNN: Template\n");
    await write("repo/docs/guides/Deep Dive/README.md", "# Deep\n");
    await write("repo/docs/guides/Deep Dive/Part One.md", "# Part one\n");
    await write("repo/docs/guides/_ignored.md", "# Ignored\n");
    await write("repo/docs/guides/.hidden.md", "# Hidden\n");
    await write("repo/docs/guides/notes.txt", "not markdown\n");
    await write("repo/CONTRIBUTING.md", "# Contributing\n\nSee [ADRs](docs/adr/README.md).\n");

    const pages = await syncContent({
      ...options,
      directories: [
        {
          dir: "docs/adr",
          target: "adr",
          order: (name) => (name.startsWith("0000") ? 100 : undefined),
          sidebarLabel: (title) => (title.startsWith("ADR-") ? title.split(":")[0] : undefined),
        },
        { dir: "docs/guides", target: "guides" },
        { dir: "docs/missing", target: "missing" },
      ],
      files: [{ file: "CONTRIBUTING.md", route: "contributing/guide", order: 1 }],
    });

    expect(pages.map((page) => [page.source, page.output])).toEqual([
      ["docs/adr/0000-template.md", "adr/0000-template.md"],
      ["docs/adr/0001-one.md", "adr/0001-one.md"],
      ["docs/adr/README.md", "adr/index.md"],
      ["docs/guides/Deep Dive/Part One.md", "guides/deep-dive/part-one.md"],
      ["docs/guides/Deep Dive/README.md", "guides/deep-dive/index.md"],
      ["CONTRIBUTING.md", "contributing/guide.md"],
    ]);
    expect(await tree("content")).toEqual([
      "adr/0000-template.md",
      "adr/0001-one.md",
      "adr/index.md",
      "contributing/guide.md",
      "guides/deep-dive/index.md",
      "guides/deep-dive/part-one.md",
    ]);

    const index = await read("content/adr/index.md");
    expect(index).toContain('title: "Architecture Decision Records"');
    expect(index).toContain("sidebar:\n  order: 0\n");
    expect(index).toContain("[One](/fairhour/adr/0001-one/)");
    const one = await read("content/adr/0001-one.md");
    expect(one).toContain('label: "ADR-0001"');
    expect(one).toContain("[Index](/fairhour/adr/)");
    expect(await read("content/adr/0000-template.md")).toContain("order: 100");
    expect(await read("content/contributing/guide.md")).toContain("[ADRs](/fairhour/adr/)");
    expect(await read("content/contributing/guide.md")).toContain(
      'editUrl: "https://github.com/o/r/edit/main/CONTRIBUTING.md"',
    );
  });

  it("removes stale pages but keeps the hand-written ones", async () => {
    await write("repo/docs/packs/it.md", "# Italy\n");
    await write("content/packs/index.md", "---\ntitle: Packs\n---\n");
    await write("content/packs/old.md", "stale");
    await write("content/packs/nested/old.md", "stale");

    const directories = [{ dir: "docs/packs", target: "packs" }];
    const handwritten = ["packs/index.md"];
    await syncContent({ ...options, directories, handwritten });
    expect(await tree("content")).toEqual(["packs/index.md", "packs/it.md"]);
    expect(await read("content/packs/index.md")).toBe("---\ntitle: Packs\n---\n");

    await rm(path.join(options.repoRoot, "docs/packs/it.md"));
    await syncContent({ ...options, directories, handwritten });
    expect(await tree("content")).toEqual(["packs/index.md"]);
  });

  it("renames the README page of a section that has a hand-written index", async () => {
    await write("repo/docs/packs/README.md", "# About the packs\n");
    const pages = await syncContent({
      ...options,
      directories: [{ dir: "docs/packs", target: "packs", readmeName: "overview" }],
      handwritten: ["packs/index.md"],
    });
    expect(pages.map((page) => page.output)).toEqual(["packs/overview.md"]);
    expect(await read("content/packs/overview.md")).not.toContain("order: 0");
  });

  it("renders files that are not Markdown and keeps their hand-written neighbours", async () => {
    await write("repo/.env.example", "A=1\n");
    await write("content/hosting/index.md", "hand-written");
    const pages = await syncContent({
      ...options,
      files: [
        {
          file: ".env.example",
          route: "hosting/env",
          render: (text) => `# Env\n\n\`${text.trim()}\`\n`,
        },
      ],
      handwritten: ["hosting/index.md"],
    });
    expect(pages.map((page) => page.output)).toEqual(["hosting/env.md"]);
    expect(await read("content/hosting/env.md")).toContain("`A=1`");
    expect(await read("content/hosting/index.md")).toBe("hand-written");
  });

  it("cleans the generated folders and nothing else", async () => {
    await write("content/packs/index.md", "hand-written");
    await write("content/packs/it.md", "generated");
    await write("content/tools/page.md", "generated");
    await write("content/other/page.md", "not ours");

    await cleanContent({
      ...options,
      directories: [{ dir: "docs/packs", target: "packs" }],
      files: [{ file: "X.md", route: "tools/page" }],
      handwritten: ["packs/index.md"],
    });

    expect(await tree("content")).toEqual(["other/page.md", "packs/index.md"]);
  });

  it("treats index.md like a README", async () => {
    await write("repo/docs/x/index.md", "# X\n");
    const pages = await syncContent({ ...options, directories: [{ dir: "docs/x", target: "x" }] });
    expect(pages.map((page) => page.route)).toEqual(["x"]);
  });

  it("rejects two sources that map to the same page", async () => {
    await write("repo/docs/a/Notes.md", "# A\n");
    await write("repo/docs/a/notes.md", "# B\n");
    await expect(
      syncContent({ ...options, directories: [{ dir: "docs/a", target: "a" }] }),
    ).rejects.toThrow(/would both become the page "a\/notes"/);
  });

  it("rejects a page and a folder index that share a route", async () => {
    await write("repo/docs/a/foo.md", "# A\n");
    await write("repo/docs/a/foo/README.md", "# B\n");
    await expect(
      syncContent({ ...options, directories: [{ dir: "docs/a", target: "a" }] }),
    ).rejects.toThrow(/both become the page "a\/foo"/);
  });

  it("rejects a source that would overwrite a hand-written page", async () => {
    await write("repo/docs/packs/README.md", "# Packs\n");
    await expect(
      syncContent({
        ...options,
        directories: [{ dir: "docs/packs", target: "packs" }],
        handwritten: ["packs/index.md"],
      }),
    ).rejects.toThrow(/hand-written page packs\/index\.md/);
  });

  it("rejects unsafe targets and routes", async () => {
    await write("repo/FILE.md", "# F\n");
    await expect(
      syncContent({ ...options, files: [{ file: "FILE.md", route: "top-level" }] }),
    ).rejects.toThrow(/Invalid route/);
    await expect(
      syncContent({ ...options, files: [{ file: "FILE.md", route: "../escape/page" }] }),
    ).rejects.toThrow(/Invalid route/);
    await expect(
      syncContent({ ...options, directories: [{ dir: "docs", target: "../.." }] }),
    ).rejects.toThrow(/Refusing to clean/);
    await expect(
      syncContent({ ...options, directories: [{ dir: "docs", target: "" }] }),
    ).rejects.toThrow(/Refusing to clean/);
  });

  it("fails loudly when a directory cannot be read", async () => {
    await write("repo/docs/a", "a file, not a directory");
    await expect(
      syncContent({ ...options, directories: [{ dir: "docs/a", target: "a" }] }),
    ).rejects.toThrow();
  });
});
