/**
 * Copies the repository's Markdown into the docs content collection, converting it on the way
 * (see `transform.ts`). This is the only module of the sync that touches the file system.
 */
import type { Dirent } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
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

/** One generated page. */
export interface SyncedPage {
  /** Repository-relative path of the source file. */
  readonly source: string;
  /** Route on the site, without slashes at either end. */
  readonly route: string;
  /** Path of the generated file, relative to the content directory. */
  readonly output: string;
}

interface PlannedPage extends SyncedPage {
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

/** The entries of a directory; a directory that does not exist is empty. */
async function readDirectory(directory: string): Promise<Dirent[]> {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
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

/** Empties a generated folder, keeping the hand-written pages inside it. */
async function cleanFolder(contentDir: string, folder: string, handwritten: readonly string[]) {
  if (!SAFE_PATH.test(folder)) throw new Error(`Refusing to clean "${folder}"`);
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

/** Empties the generated folders, keeping the hand-written pages (`pnpm clean` uses it). */
export async function cleanContent(
  options: Pick<SyncOptions, "contentDir" | "directories" | "files" | "handwritten">,
): Promise<void> {
  for (const folder of generatedFolders(options)) {
    await cleanFolder(options.contentDir, folder, options.handwritten ?? []);
  }
}

/**
 * Regenerates the synced part of the content collection from the repository's files.
 * Generated folders are emptied first (so deleted sources disappear), except for the
 * hand-written pages listed in `options.handwritten`.
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

  const routes = new Map(planned.map((page) => [page.source, page.route]));
  await cleanContent(options);

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
    const destination = path.join(options.contentDir, page.output);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, converted);
  }
  return planned.map(({ source, route, output }) => ({ source, route, output }));
}
