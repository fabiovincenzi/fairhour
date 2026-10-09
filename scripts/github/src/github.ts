import type { LabelDef, MilestoneDef } from "./schema.ts";

export interface GitHubLabel {
  readonly name: string;
  readonly color: string;
  readonly description: string | null;
}

export interface GitHubMilestone {
  readonly number: number;
  readonly title: string;
  readonly description: string | null;
  readonly state: "open" | "closed";
  readonly due_on: string | null;
}

export interface GitHubIssue {
  readonly number: number;
  readonly title: string;
  readonly body: string | null;
  readonly state: "open" | "closed";
  readonly labels: readonly string[];
  /** Milestone title, or null. */
  readonly milestone: string | null;
}

export interface CreateIssueInput {
  readonly title: string;
  readonly body: string;
  readonly labels: readonly string[];
  readonly milestone?: number;
}

export interface UpdateIssueInput {
  readonly title?: string;
  readonly body?: string;
  readonly labels?: readonly string[];
  readonly milestone?: number | null;
  readonly state?: "closed";
  readonly state_reason?: "completed";
}

/** The subset of the GitHub REST API the backlog sync needs. */
export interface GitHubApi {
  listLabels(): Promise<GitHubLabel[]>;
  createLabel(label: LabelDef): Promise<void>;
  updateLabel(currentName: string, label: LabelDef): Promise<void>;
  listMilestones(): Promise<GitHubMilestone[]>;
  createMilestone(milestone: MilestoneDef): Promise<GitHubMilestone>;
  updateMilestone(number: number, milestone: MilestoneDef): Promise<void>;
  /** All issues (open and closed), pull requests excluded. */
  listIssues(): Promise<GitHubIssue[]>;
  createIssue(input: CreateIssueInput): Promise<GitHubIssue>;
  updateIssue(number: number, input: UpdateIssueInput): Promise<GitHubIssue>;
}

export interface RestClientOptions {
  readonly token: string;
  /** `owner/repo`. */
  readonly repository: string;
  readonly apiUrl?: string;
  readonly fetchImpl?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
  /** Pause after each write to stay under GitHub's secondary rate limits. */
  readonly writeDelayMs?: number;
  readonly maxRetries?: number;
}

interface RawIssue {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  labels: (string | { name?: string })[];
  milestone: { title: string } | null;
  pull_request?: unknown;
}

export class GitHubRequestError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GitHubRequestError";
    this.status = status;
  }
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function toIssue(raw: RawIssue): GitHubIssue {
  return {
    number: raw.number,
    title: raw.title,
    body: raw.body,
    state: raw.state,
    labels: raw.labels
      .map((label) => (typeof label === "string" ? label : (label.name ?? "")))
      .filter((name) => name !== ""),
    milestone: raw.milestone?.title ?? null,
  };
}

function nextLink(header: string | null): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

/** Minimal fetch-based GitHub REST client with pagination and rate-limit retries. */
export class RestGitHubClient implements GitHubApi {
  private readonly token: string;
  private readonly repoPath: string;
  private readonly apiUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly writeDelayMs: number;
  private readonly maxRetries: number;

  constructor(options: RestClientOptions) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(options.repository)) {
      throw new Error(`invalid repository "${options.repository}", expected owner/repo`);
    }
    this.token = options.token;
    this.repoPath = `/repos/${options.repository}`;
    this.apiUrl = (options.apiUrl ?? "https://api.github.com").replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.writeDelayMs = options.writeDelayMs ?? 1000;
    this.maxRetries = options.maxRetries ?? 5;
  }

  private async request(
    method: string,
    url: string,
    body?: unknown,
  ): Promise<Response> {
    const fullUrl = url.startsWith("http") ? url : `${this.apiUrl}${url}`;
    for (let attempt = 0; ; attempt++) {
      const init: RequestInit = {
        method,
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${this.token}`,
          "x-github-api-version": "2022-11-28",
          "user-agent": "fairhour-backlog-sync",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      };
      const response = await this.fetchImpl(fullUrl, init);
      if (response.ok) {
        if (method !== "GET" && this.writeDelayMs > 0) await this.sleep(this.writeDelayMs);
        return response;
      }
      const retryable =
        response.status === 429 ||
        response.status >= 500 ||
        (response.status === 403 &&
          (response.headers.has("retry-after") ||
            response.headers.get("x-ratelimit-remaining") === "0"));
      if (!retryable || attempt >= this.maxRetries) {
        const text = await response.text();
        throw new GitHubRequestError(
          `GitHub ${method} ${url} failed with ${String(response.status)}: ${text.slice(0, 500)}`,
          response.status,
        );
      }
      await this.sleep(this.retryDelay(response, attempt));
    }
  }

  private retryDelay(response: Response, attempt: number): number {
    const retryAfter = Number(response.headers.get("retry-after"));
    if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter, 120) * 1000;
    const reset = Number(response.headers.get("x-ratelimit-reset"));
    if (Number.isFinite(reset) && reset > 0) {
      const wait = reset * 1000 - Date.now();
      if (wait > 0) return Math.min(wait, 120_000);
    }
    return Math.min(2 ** attempt * 1000, 60_000);
  }

  private async json<T>(method: string, url: string, body?: unknown): Promise<T> {
    const response = await this.request(method, url, body);
    return (await response.json()) as T;
  }

  private async paginate<T>(url: string): Promise<T[]> {
    const results: T[] = [];
    let next: string | undefined = url;
    while (next !== undefined) {
      const response = await this.request("GET", next);
      results.push(...((await response.json()) as T[]));
      next = nextLink(response.headers.get("link"));
    }
    return results;
  }

  listLabels(): Promise<GitHubLabel[]> {
    return this.paginate<GitHubLabel>(`${this.repoPath}/labels?per_page=100`);
  }

  async createLabel(label: LabelDef): Promise<void> {
    await this.request("POST", `${this.repoPath}/labels`, label);
  }

  async updateLabel(currentName: string, label: LabelDef): Promise<void> {
    await this.request(
      "PATCH",
      `${this.repoPath}/labels/${encodeURIComponent(currentName)}`,
      { new_name: label.name, color: label.color, description: label.description },
    );
  }

  listMilestones(): Promise<GitHubMilestone[]> {
    return this.paginate<GitHubMilestone>(
      `${this.repoPath}/milestones?state=all&per_page=100`,
    );
  }

  createMilestone(milestone: MilestoneDef): Promise<GitHubMilestone> {
    return this.json<GitHubMilestone>("POST", `${this.repoPath}/milestones`, {
      title: milestone.title,
      description: milestone.description,
      ...(milestone.due_on ? { due_on: `${milestone.due_on}T23:59:59Z` } : {}),
    });
  }

  async updateMilestone(number: number, milestone: MilestoneDef): Promise<void> {
    await this.request("PATCH", `${this.repoPath}/milestones/${String(number)}`, {
      description: milestone.description,
      ...(milestone.due_on ? { due_on: `${milestone.due_on}T23:59:59Z` } : {}),
    });
  }

  async listIssues(): Promise<GitHubIssue[]> {
    const raw = await this.paginate<RawIssue>(
      `${this.repoPath}/issues?state=all&per_page=100`,
    );
    return raw.filter((issue) => issue.pull_request === undefined).map(toIssue);
  }

  async createIssue(input: CreateIssueInput): Promise<GitHubIssue> {
    return toIssue(await this.json<RawIssue>("POST", `${this.repoPath}/issues`, input));
  }

  async updateIssue(number: number, input: UpdateIssueInput): Promise<GitHubIssue> {
    return toIssue(
      await this.json<RawIssue>("PATCH", `${this.repoPath}/issues/${String(number)}`, input),
    );
  }
}
