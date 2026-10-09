/** Developer Certificate of Origin check: every non-merge commit carries a matching sign-off. */

export interface CommitInfo {
  readonly sha: string;
  readonly authorName: string;
  readonly authorEmail: string;
  readonly message: string;
  readonly parentCount: number;
}

export interface DcoFailure {
  readonly sha: string;
  readonly subject: string;
  readonly reason: string;
}

export interface DcoResult {
  readonly ok: boolean;
  readonly checked: number;
  readonly skipped: readonly { readonly sha: string; readonly reason: string }[];
  readonly failures: readonly DcoFailure[];
}

const SIGN_OFF = /^Signed-off-by:\s*(.+?)\s*<([^<>\s]+)>\s*$/gim;

/** Bot accounts (Renovate, Dependabot, github-actions, all-contributors) are exempt. */
export function isBot(commit: CommitInfo): boolean {
  return (
    /\[bot\]$/i.test(commit.authorName) ||
    /\[bot\]@users\.noreply\.github\.com$/i.test(commit.authorEmail)
  );
}

export function signOffs(message: string): { name: string; email: string }[] {
  return [...message.matchAll(SIGN_OFF)].map((match) => ({
    name: match[1] ?? "",
    email: (match[2] ?? "").toLowerCase(),
  }));
}

export function checkDco(commits: readonly CommitInfo[]): DcoResult {
  const failures: DcoFailure[] = [];
  const skipped: { sha: string; reason: string }[] = [];
  let checked = 0;
  for (const commit of commits) {
    if (commit.parentCount > 1) {
      skipped.push({ sha: commit.sha, reason: "merge commit" });
      continue;
    }
    if (isBot(commit)) {
      skipped.push({ sha: commit.sha, reason: "bot author" });
      continue;
    }
    checked++;
    const subject = commit.message.split("\n", 1)[0] ?? "";
    const found = signOffs(commit.message);
    if (found.length === 0) {
      failures.push({ sha: commit.sha, subject, reason: "missing Signed-off-by line" });
    } else if (!found.some((s) => s.email === commit.authorEmail.toLowerCase())) {
      failures.push({
        sha: commit.sha,
        subject,
        reason: `sign-off email (${found.map((s) => s.email).join(", ")}) does not match the author email (${commit.authorEmail})`,
      });
    }
  }
  return { ok: failures.length === 0, checked, skipped, failures };
}

/** Separators unlikely to appear in commit messages, used with `git log --format`. */
export const FIELD_SEPARATOR = "\u001f";
export const RECORD_SEPARATOR = "\u001e";
export const GIT_LOG_FORMAT = ["%H", "%an", "%ae", "%P", "%B"].join("%x1f") + "%x1e";

/** Parses `git log --format=${GIT_LOG_FORMAT}` output. */
export function parseGitLog(output: string): CommitInfo[] {
  return output
    .split(RECORD_SEPARATOR)
    .map((record) => record.replace(/^\n/, ""))
    .filter((record) => record.trim() !== "")
    .map((record) => {
      const [sha = "", authorName = "", authorEmail = "", parents = "", ...rest] =
        record.split(FIELD_SEPARATOR);
      return {
        sha,
        authorName,
        authorEmail,
        message: rest.join(FIELD_SEPARATOR).trim(),
        parentCount: parents.trim() === "" ? 0 : parents.trim().split(/\s+/).length,
      };
    });
}

export function formatDcoResult(result: DcoResult): string {
  if (result.ok) {
    return `✅ DCO: all ${String(result.checked)} commit(s) are signed off.`;
  }
  return [
    `❌ DCO: ${String(result.failures.length)} of ${String(result.checked)} commit(s) are not signed off correctly.`,
    "",
    ...result.failures.map((f) => `- ${f.sha.slice(0, 12)} "${f.subject}": ${f.reason}`),
    "",
    "Every commit needs a `Signed-off-by: Your Name <author@email>` line matching the commit author.",
    "Fix it with `git rebase --signoff <base-branch>` and force-push your branch.",
    "See https://github.com/fabiovincenzi/fairhour/blob/main/CONTRIBUTING.md#developer-certificate-of-origin-dco",
  ].join("\n");
}
