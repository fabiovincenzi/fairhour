/**
 * Where the documentation site lives and where its sources live. Shared by `astro.config.mjs`
 * and the content sync, so that the base path and the repository URL are written down once.
 */

/** Origin of the GitHub Pages site (project pages: `<owner>.github.io/<repo>/`). */
export const SITE = "https://fabiovincenzi.github.io";

/** Base path of the site, without a trailing slash (`/<repo>` on project pages). */
export const BASE = "/fairhour";

/** The GitHub repository the documentation is built from. */
export const REPO = {
  /** Repository URL without a trailing slash. */
  url: "https://github.com/fabiovincenzi/fairhour",
  /** Branch that edit links and file links point at. */
  branch: "main",
} as const;

/** Repository information needed to link back to GitHub. */
export interface RepoInfo {
  readonly url: string;
  readonly branch: string;
}
