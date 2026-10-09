/**
 * Copies the repository's Markdown (ADRs, design docs, tax pack docs, contributing and
 * maintainer guides, CONTRIBUTING.md, GOVERNANCE.md, SECURITY.md) into the docs content
 * collection, so that the repository stays the single source of truth, and derives the
 * environment variable reference from .env.example.
 *
 * Runs on Node's native TypeScript support: `node scripts/sync-content.ts` (the `predev`,
 * `prebuild` and `typecheck` scripts do it); `--clean` only removes the generated pages. The
 * generated folders are gitignored.
 */
import path from "node:path";
import { BASE, REPO } from "./lib/site.ts";
import { DIRECTORIES, FILES, HANDWRITTEN } from "./lib/sources.ts";
import { cleanContent, syncContent } from "./lib/sync.ts";

const docsRoot = path.resolve(import.meta.dirname, "..");
const options = {
  repoRoot: path.resolve(docsRoot, "../.."),
  contentDir: path.join(docsRoot, "src/content/docs"),
  base: BASE,
  repo: REPO,
  directories: DIRECTORIES,
  files: FILES,
  handwritten: HANDWRITTEN,
};

if (process.argv.includes("--clean")) {
  await cleanContent(options);
  console.log("Removed the generated pages from src/content/docs.");
} else {
  const pages = await syncContent(options);
  console.log(`Synced ${pages.length} files from the repository into src/content/docs.`);
}
