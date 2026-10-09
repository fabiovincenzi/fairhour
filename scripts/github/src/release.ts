/**
 * What the release workflow runs after the "Version packages" PR is merged
 * (`pnpm release:publish`, called by `changesets/action`).
 *
 * - `NPM_PUBLISH_ENABLED=true` (an `NPM_TOKEN` secret exists): `changeset publish` publishes every
 *   non-private package to npm, then tags all released packages.
 * - Otherwise: `changeset git-tag` only creates the git tags (npm is never touched). `git-tag` is
 *   the Changesets 3.x name of what used to be `changeset tag`.
 *
 * Both commands report the tags they create through the `CHANGESETS_OUTPUT` file that
 * `changesets/action` provides, so the child process must inherit the environment.
 */

export interface ReleaseCommand {
  /** Arguments for `pnpm`. */
  readonly args: readonly string[];
  /** One line for the workflow log. */
  readonly description: string;
}

export function releaseCommand(env: Readonly<Record<string, string | undefined>>): ReleaseCommand {
  if (env.NPM_PUBLISH_ENABLED === "true") {
    return {
      args: ["exec", "changeset", "publish"],
      description:
        "NPM_PUBLISH_ENABLED=true: publishing public packages to npm and tagging releases.",
    };
  }
  return {
    args: ["exec", "changeset", "git-tag"],
    description: "npm publishing is disabled (set NPM_TOKEN to enable it): creating git tags only.",
  };
}
