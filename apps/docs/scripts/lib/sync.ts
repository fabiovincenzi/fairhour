/**
 * Copies the repository's Markdown into the docs content collection, converting it on the way
 * (see `transform.ts`). This is the only module of the sync that touches the file system.
 *
 * The sync is safe to run while other tasks read the content (`astro sync`, `astro check`,
 * `astro build`) and while other syncs run: a page is written to a temporary file next to its
 * destination and renamed over it, so a reader sees the old or the new page and never a partial
 * one; a page whose content did not change is not touched; and only files that are no longer
 * generated are deleted. Nothing is emptied first.
 */
import { randomBytes } from "node:crypto";
import type { Dirent } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { transformDocument } from "./transform.ts";
import type { RepoInfo } from "./site.ts";

/** Every `.md` file below `dir` (recursively) becomes a page under `target`. */
export interface DirectorySource {
  /** Repository-relative source directory, for example `docs/adr`. */
  readonly dir: string;
  /** Folder (and route prefix) in the content collection, for example `adr`. */
  readonly target: string;
  /** Name of the page generated from `README.md` in `dir`. Defaults to `index`. */
  readonly readmeName?: string;
  /** Sidebar order by page name (`0001-technology-stack`); the README page defaults to 0. */
  readonly order?: (name: string) => number | undefined;
  /** Shorter sidebar label derived from the page title. */
  readonly sidebarLabel?: (title: string) => string | undefined;
}

/** One repository file that becomes one page. */
export interface FileSource {
  /** Repository-relative path, for example `CONTRIBUTING.md`. */
  readonly file: string;
  /** Route in the content collection (`contributing/guide`); its first segment is a generated folder. */
  readonly route: string;
  readonly order?: number;
  /** Turns the file into Markdown first (for files that are not Markdown, such as `.env.example`). */
  readonly render?: (text: string) => string;
}

export interface SyncOptions {
  /** Absolute path of the repository root. */
  readonly repoRoot: string;
  /** Absolute path of the docs content directory (`apps/docs/src/content/docs`). */
  readonly contentDir: string;
  /** Base path of the site, without a trailing slash. */
  readonly base: string;
  readonly repo: RepoInfo;
  readonly directories: readonly DirectorySource[];
  readonly files: readonly FileSource[];
  /**
   * Hand-written pages (paths relative to `contentDir`) that live inside generated folders. They
   * survive the clean-up, and a generated page may not take their place.
   */
  readonly handwritten?: readonly string[];
}

/** What the sync did to a generated file. */
export type PageChange = "created" | "updated" | "unchanged";

/** One generated page. */
export interface SyncedPage {
  /** Repository-relative path of the source file. */
  readonly source: string;
  /** Route on the site, without slashes at either end. */
  readonly route: string;
  /** Path of the generated file, relative to the content directory. */
  readonly output: string;
  /** `unchanged` pages were not written: their content was already up to date. */
  readonly change: PageChange;
}

interface PlannedPage extends Omit<SyncedPage, "change"> {
  readonly order: number | undefined;
  readonly sidebarLabel: DirectorySource["sidebarLabel"];
  readonly render: FileSource["render"];
}

const SAFE_PATH = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

/** Lowercase, hyphen-separated slug of one path segment (`Release Process` is `release-process`). */
export function slugify(segment: string): string {
  return segment
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

/** The entries of a directory; a directory that does not exist is empty. */
async function readDirectory(directory: string): Promise<Dirent[]> {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
}

/** The text of a file, or `undefined` when it does not exist. */
async function readIfExists(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

/** Repository-relative POSIX paths of the Markdown files below `dir` (relative to `root`), sorted. */
async function listMarkdown(root: string, dir: string, prefix = ""): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readDirectory(path.join(root, dir, prefix))) {
    if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue;
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) found.push(...(await listMarkdown(root, dir, relative)));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) found.push(relative);
  }
  return found.sort();
}

function planDirectory(source: DirectorySource, relativePaths: readonly string[]): PlannedPage[] {
  return relativePaths.map((relative) => {
    const segments = relative.replace(/\.md$/i, "").split("/").map(slugify);
    // `README.md` (and `index.md`) describe the folder they are in.
    const describesFolder = /^(?:readme|index)$/.test(segments.at(-1) ?? "");
    const name = describesFolder ? (source.readmeName ?? "index") : (segments.at(-1) ?? "");
    const asIndex = describesFolder && name === "index";
    const parts = [source.target, ...segments.slice(0, -1)];
    const route = (asIndex ? parts : [...parts, name]).join("/");
    return {
      source: `${source.dir}/${relative}`,
      route,
      output: asIndex ? `${route}/index.md` : `${route}.md`,
      order: source.order?.(name) ?? (asIndex ? 0 : undefined),
      sidebarLabel: source.sidebarLabel,
      render: undefined,
    };
  });
}

function planFile(source: FileSource): PlannedPage {
  return {
    source: source.file,
    route: source.route,
    output: `${source.route}.md`,
    order: source.order,
    sidebarLabel: undefined,
    render: source.render,
  };
}

/** Throws unless every route is unique and no page takes the place of a hand-written one. */
function assertNoCollisions(pages: readonly PlannedPage[], handwritten: readonly string[]) {
  const seen = new Map<string, string>();
  for (const page of pages) {
    const previous = seen.get(page.route);
    if (previous !== undefined) {
      throw new Error(`${previous} and ${page.source} would both become the page "${page.route}"`);
    }
    seen.set(page.route, page.source);
    if (handwritten.includes(page.output)) {
      throw new Error(`${page.source} would overwrite the hand-written page ${page.output}`);
    }
  }
}

/** Throws unless `folder` is a plain relative path that is safe to write into and clean. */
function assertSafeFolder(folder: string): void {
  if (!SAFE_PATH.test(folder)) throw new Error(`Refusing to clean "${folder}"`);
}

/** Empties a generated folder, keeping the hand-written pages inside it. */
async function cleanFolder(contentDir: string, folder: string, handwritten: readonly string[]) {
  assertSafeFolder(folder);
  const absolute = path.join(contentDir, folder);
  for (const entry of await readDirectory(absolute)) {
    if (!handwritten.includes(`${folder}/${entry.name}`)) {
      await rm(path.join(absolute, entry.name), { recursive: true, force: true });
    }
  }
}

/** The generated folders: the targets of the directory sources and the first segments of file routes. */
function generatedFolders(options: Pick<SyncOptions, "directories" | "files">): Set<string> {
  return new Set([
    ...options.directories.map((directory) => directory.target),
    ...options.files.map((file) => file.route.split("/")[0] ?? ""),
  ]);
}

/**
 * Empties the generated folders, keeping the hand-written pages (`pnpm clean` uses it). Unlike
 * `syncContent` this is not safe while another task reads the content.
 */
export async function cleanContent(
  options: Pick<SyncOptions, "contentDir" | "directories" | "files" | "handwritten">,
): Promise<void> {
  for (const folder of generatedFolders(options)) {
    await cleanFolder(options.contentDir, folder, options.handwritten ?? []);
  }
}

/**
 * Temporary files are dot-files with a `.tmp` extension, so that no content loader picks them up.
 * They are never deleted as stale: they may belong to a sync that is about to rename them (a
 * crashed sync can leave one behind; `pnpm clean` removes it).
 */
const TEMPORARY = /^\..+\.\d+\.[0-9a-f]{8}\.tmp$/;

function temporaryPath(destination: string): string {
  const { dir, base } = path.parse(destination);
  return path.join(dir, `.${base}.${String(process.pid)}.${randomBytes(4).toString("hex")}.tmp`);
}

/**
 * Makes the file hold `text`: nothing happens when it already does, otherwise the text is written
 * to a temporary file in the same directory and renamed over the destination (atomic on the same
 * file system), so a concurrent reader never sees a half-written page.
 */
async function writeAtomically(destination: string, text: string): Promise<PageChange> {
  const current = await readIfExists(destination);
  if (current === text) return "unchanged";
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = temporaryPath(destination);
  try {
    await writeFile(temporary, text);
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return current === undefined ? "created" : "updated";
}

/** Paths (relative to the content directory, POSIX) that the sync generates or must not touch. */
interface Keep {
  readonly files: ReadonlySet<string>;
  readonly directories: ReadonlySet<string>;
  readonly handwritten: readonly string[];
}

function keepPaths(outputs: readonly string[], handwritten: readonly string[]): Keep {
  const directories = new Set<string>();
  for (const output of [...outputs, ...handwritten]) {
    for (let dir = path.posix.dirname(output); dir !== "."; dir = path.posix.dirname(dir)) {
      directories.add(dir);
    }
  }
  return { files: new Set(outputs), directories, handwritten };
}

/**
 * Deletes what is below `directory` and is no longer generated: stale files, and the directories
 * that end up with nothing to keep. A directory that a page will be written into is never removed
 * (a concurrent sync may be about to use it). Returns whether anything in `directory` is kept.
 */
async function removeStale(contentDir: string, directory: string, keep: Keep): Promise<boolean> {
  let used = keep.directories.has(directory);
  for (const entry of await readDirectory(path.join(contentDir, directory))) {
    const relative = `${directory}/${entry.name}`;
    const absolute = path.join(contentDir, relative);
    if (keep.files.has(relative) || keep.handwritten.includes(relative)) {
      used = true;
    } else if (entry.isDirectory()) {
      if (await removeStale(contentDir, relative, keep)) used = true;
      else await rm(absolute, { recursive: true, force: true });
    } else if (TEMPORARY.test(entry.name)) {
      used = true;
    } else {
      await rm(absolute, { force: true });
    }
  }
  return used;
}

/**
 * Brings the synced part of the content collection in line with the repository's files, without
 * ever emptying it: pages are written atomically and only when their content changed, then the
 * files that are no longer generated are deleted (so removed sources disappear). The hand-written
 * pages listed in `options.handwritten` are left alone. Safe to run concurrently with readers
 * and with other syncs.
 */
export async function syncContent(options: SyncOptions): Promise<readonly SyncedPage[]> {
  const handwritten = options.handwritten ?? [];
  const planned: PlannedPage[] = [];
  for (const directory of options.directories) {
    const relativePaths = await listMarkdown(options.repoRoot, directory.dir);
    planned.push(...planDirectory(directory, relativePaths));
  }
  for (const file of options.files) {
    if (!SAFE_PATH.test(file.route) || !file.route.includes("/")) {
      throw new Error(`Invalid route "${file.route}" for ${file.file}: use <folder>/<page>`);
    }
    planned.push(planFile(file));
  }
  assertNoCollisions(planned, handwritten);
  const folders = generatedFolders(options);
  for (const folder of folders) assertSafeFolder(folder);

  const routes = new Map(planned.map((page) => [page.source, page.route]));
  const pages: SyncedPage[] = [];
  for (const page of planned) {
    const text = await readFile(path.join(options.repoRoot, page.source), "utf8");
    const converted = transformDocument(page.render?.(text) ?? text, {
      sourcePath: page.source,
      routes,
      base: options.base,
      repo: options.repo,
      ...(page.order === undefined ? {} : { order: page.order }),
      ...(page.sidebarLabel === undefined ? {} : { sidebarLabel: page.sidebarLabel }),
    });
    const change = await writeAtomically(path.join(options.contentDir, page.output), converted);
    pages.push({ source: page.source, route: page.route, output: page.output, change });
  }

  const keep = keepPaths(
    planned.map((page) => page.output),
    handwritten,
  );
  for (const folder of folders) await removeStale(options.contentDir, folder, keep);
  return pages;
}
