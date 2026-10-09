import { mkdir, mkdtemp, readdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
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

  it("creates the pages that are new and reports what it did", async () => {
    await write("repo/docs/guides/one.md", "# One\n");
    const directories = [{ dir: "docs/guides", target: "guides" }];
    const first = await syncContent({ ...options, directories });
    expect(first.map((page) => [page.output, page.change])).toEqual([["guides/one.md", "created"]]);

    await write("repo/docs/guides/deep/two.md", "# Two\n");
    const second = await syncContent({ ...options, directories });
    expect(second.map((page) => [page.output, page.change])).toEqual([
      ["guides/deep/two.md", "created"],
      ["guides/one.md", "unchanged"],
    ]);
    expect(await tree("content")).toEqual(["guides/deep/two.md", "guides/one.md"]);
    expect(await read("content/guides/deep/two.md")).toContain('title: "Two"');
  });

  it("leaves pages whose content did not change untouched", async () => {
    await write("repo/docs/guides/same.md", "# Same\n");
    await write("repo/docs/guides/edited.md", "# Before\n");
    const directories = [{ dir: "docs/guides", target: "guides" }];
    await syncContent({ ...options, directories });

    // Age both files so that a rewrite is visible in the modification time and the inode (a
    // rename puts a new file in place).
    const past = new Date("2020-01-01T00:00:00Z");
    for (const page of ["same", "edited"]) {
      await utimes(path.join(options.contentDir, `guides/${page}.md`), past, past);
    }
    const before = await stat(path.join(options.contentDir, "guides/same.md"));

    await write("repo/docs/guides/edited.md", "# After\n");
    const pages = await syncContent({ ...options, directories });
    expect(pages.map((page) => [page.output, page.change])).toEqual([
      ["guides/edited.md", "updated"],
      ["guides/same.md", "unchanged"],
    ]);

    const same = await stat(path.join(options.contentDir, "guides/same.md"));
    expect(same.mtimeMs).toBe(past.getTime());
    expect(same.ino).toBe(before.ino);
    const edited = await stat(path.join(options.contentDir, "guides/edited.md"));
    expect(edited.mtimeMs).toBeGreaterThan(past.getTime());
    expect(await read("content/guides/edited.md")).toContain('title: "After"');
  });

  it("deletes only the files that are no longer generated, and the folders they leave empty", async () => {
    await write("repo/docs/guides/keep.md", "# Keep\n");
    await write("repo/docs/guides/deep/gone.md", "# Gone\n");
    await write("repo/docs/guides/also/gone.md", "# Gone too\n");
    const directories = [{ dir: "docs/guides", target: "guides" }];
    const handwritten = ["guides/also/index.md"];
    await syncContent({ ...options, directories, handwritten: [] });
    expect(await tree("content")).toEqual([
      "guides/also/gone.md",
      "guides/deep/gone.md",
      "guides/keep.md",
    ]);

    await write("content/guides/also/index.md", "hand-written");
    await write("content/guides/stale/page.md", "stale");
    await write("content/guides/.stale.md", "stale dot-file");
    await write("content/guides/notes.txt", "stale of another type");
    await rm(path.join(options.repoRoot, "docs/guides/deep"), { recursive: true });
    await rm(path.join(options.repoRoot, "docs/guides/also"), { recursive: true });
    await syncContent({ ...options, directories, handwritten });

    expect(await tree("content")).toEqual(["guides/also/index.md", "guides/keep.md"]);
    // The folders that held only stale files are gone; the one with a hand-written page stays.
    expect((await readdir(path.join(options.contentDir, "guides"))).sort()).toEqual([
      "also",
      "keep.md",
    ]);
  });

  it("keeps the temporary files of a sync that may still be running, and clean removes them", async () => {
    await write("repo/docs/guides/one.md", "# One\n");
    const directories = [{ dir: "docs/guides", target: "guides" }];
    await write("content/guides/.one.md.4242.0123abcd.tmp", "being written");
    await syncContent({ ...options, directories });
    expect(await tree("content")).toEqual(["guides/.one.md.4242.0123abcd.tmp", "guides/one.md"]);

    await cleanContent({ ...options, directories, files: [] });
    expect(await tree("content")).toEqual([]);
  });

  it("leaves no temporary file behind", async () => {
    for (let i = 0; i < 5; i++) await write(`repo/docs/guides/page-${String(i)}.md`, "# Page\n");
    await syncContent({ ...options, directories: [{ dir: "docs/guides", target: "guides" }] });
    expect((await tree("content")).filter((file) => file.endsWith(".tmp"))).toEqual([]);
  });

  it("never exposes a missing or partial page to a reader, even with syncs running together", async () => {
    // The race of the `lint`, `typecheck` and `build` tasks: several syncs run while `astro sync`
    // reads the pages. Emptying the folder first, or writing in place, would make the reader
    // see a missing or truncated page.
    const directories = [{ dir: "docs/guides", target: "guides" }];
    const body = "Some text that makes the page a few hundred kilobytes.\n".repeat(4000);
    const page = (version: string) => `# Page\n\n${version}\n\n${body}\nEND\n`;
    await write("repo/docs/guides/page.md", page("v0"));
    await write("repo/docs/guides/other.md", page("other"));
    await syncContent({ ...options, directories });

    const problems: string[] = [];
    const poll = { running: true };
    const reader = (async () => {
      while (poll.running) {
        for (const name of ["page", "other"]) {
          try {
            const text = await read(`content/guides/${name}.md`);
            if (!text.startsWith("---\n") || !text.endsWith("\nEND\n")) {
              problems.push(`${name}: partial page of ${String(text.length)} characters`);
            }
          } catch (error) {
            problems.push(`${name}: ${String(error)}`);
          }
        }
      }
    })();

    for (let round = 1; round <= 8; round++) {
      await write("repo/docs/guides/page.md", page(`v${String(round)}`));
      await Promise.all(Array.from({ length: 4 }, () => syncContent({ ...options, directories })));
    }
    poll.running = false;
    await reader;

    expect(problems).toEqual([]);
    expect(await read("content/guides/page.md")).toContain("v8");
    expect(await tree("content")).toEqual(["guides/other.md", "guides/page.md"]);
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
