import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { rewriteLinks } from "./links.ts";
import { BASE, REPO } from "./site.ts";
import { DIRECTORIES, FILES, HANDWRITTEN } from "./sources.ts";
import { syncContent, type SyncedPage } from "./sync.ts";

const repoRoot = path.resolve(import.meta.dirname, "../../../..");

function directory(target: string) {
  const found = DIRECTORIES.find((candidate) => candidate.target === target);
  if (found === undefined) throw new Error(`No source for ${target}`);
  return found;
}

describe("source configuration", () => {
  it("orders ADRs by number, with the template last and the index first", () => {
    const order = directory("adr").order;
    expect(order?.("0001-technology-stack")).toBe(1);
    expect(order?.("0002-licensing")).toBe(2);
    expect(order?.("0000-template")).toBe(10_000);
    expect(order?.("index")).toBeUndefined();
  });

  it("orders the contributing guides after CONTRIBUTING.md", () => {
    const order = directory("contributing").order;
    expect(order?.("tax-packs")).toBe(2);
    expect(order?.("translations")).toBe(3);
    expect(order?.("anything-else")).toBeUndefined();
    expect(FILES.find((file) => file.file === "CONTRIBUTING.md")?.order).toBe(1);
  });

  it("keeps the hand-written landing pages of the mixed sections", () => {
    expect(HANDWRITTEN).toEqual(["tax-packs/index.md", "self-hosting/index.md"]);
    expect(directory("tax-packs").readmeName).toBe("overview");
  });
});

describe("generated folders", () => {
  const gitignore = readFileSync(path.join(repoRoot, ".gitignore"), "utf8").split("\n");
  const generated = "apps/docs/src/content/docs";
  const folders = new Set([
    ...DIRECTORIES.map((source) => source.target),
    ...FILES.map((file) => file.route.split("/")[0] ?? ""),
  ]);

  it("are all gitignored, except for the hand-written pages inside them", () => {
    expect(folders.size).toBeGreaterThan(0);
    for (const folder of folders) {
      const kept = HANDWRITTEN.filter((page) => page.startsWith(`${folder}/`));
      if (kept.length === 0) {
        expect(gitignore, folder).toContain(`${generated}/${folder}/`);
      } else {
        expect(gitignore, folder).toContain(`${generated}/${folder}/*`);
        for (const page of kept) expect(gitignore, page).toContain(`!${generated}/${page}`);
      }
    }
  });

  it("have their hand-written pages in the repository", () => {
    for (const page of HANDWRITTEN) {
      expect(existsSync(path.join(repoRoot, generated, page)), page).toBe(true);
    }
  });
});

describe("the repository's own documents", () => {
  let output: string;
  let pages: readonly SyncedPage[];

  beforeAll(async () => {
    output = await mkdtemp(path.join(tmpdir(), "fairhour-docs-"));
    pages = await syncContent({
      repoRoot,
      contentDir: output,
      base: BASE,
      repo: REPO,
      directories: DIRECTORIES,
      files: FILES,
      handwritten: HANDWRITTEN,
    });
  });

  afterAll(async () => {
    await rm(output, { recursive: true, force: true });
  });

  it("sync without errors and cover the ADRs and the root files", () => {
    const outputs = pages.map((page) => page.output);
    expect(outputs).toContain("adr/index.md");
    expect(outputs).toContain("adr/0001-technology-stack.md");
    expect(outputs).toContain("adr/0002-licensing.md");
    expect(outputs).toContain("maintainers/index.md");
    expect(outputs).toContain("contributing/guide.md");
    expect(outputs).toContain("contributing/governance.md");
    expect(outputs).toContain("contributing/security.md");
    expect(outputs).toContain("self-hosting/environment-variables.md");
  });

  it("produce pages with a title and an edit link to the original file", async () => {
    for (const page of pages) {
      const text = await readFile(path.join(output, page.output), "utf8");
      expect(text, page.output).toMatch(/^---\n# Generated from .+\ntitle: ".+"\n/);
      expect(text, page.output).toContain(
        `editUrl: "${REPO.url}/edit/${REPO.branch}/${page.source}"`,
      );
    }
  });

  it("leave no relative link behind", async () => {
    const routes = new Map(pages.map((page) => [page.source, page.route]));
    for (const page of pages) {
      const text = await readFile(path.join(output, page.output), "utf8");
      const [, , body = ""] = text.split(/^---$/m);
      const context = { sourcePath: page.source, routes, base: BASE, repo: REPO };
      expect(rewriteLinks(body, context), page.output).toBe(body);
    }
  });
});
