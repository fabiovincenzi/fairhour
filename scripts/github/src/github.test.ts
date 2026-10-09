import { describe, expect, it } from "vitest";
import { GitHubRequestError, RestGitHubClient } from "./github.ts";

interface Call {
  url: string;
  method: string;
  body: unknown;
  headers: Record<string, string>;
}

function fakeFetch(responses: Response[]): { fetchImpl: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl = ((url: string, init?: RequestInit) => {
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    const response = responses.shift();
    if (!response) throw new Error("no more responses");
    return Promise.resolve(response);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const json = (data: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(data), { status: 200, ...init });

function client(responses: Response[], sleeps: number[] = []) {
  const { fetchImpl, calls } = fakeFetch(responses);
  const api = new RestGitHubClient({
    token: "t0k3n",
    repository: "acme/fairhour",
    fetchImpl,
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    writeDelayMs: 5,
    maxRetries: 2,
  });
  return { api, calls };
}

describe("RestGitHubClient", () => {
  it("rejects invalid repository names", () => {
    expect(() => new RestGitHubClient({ token: "x", repository: "nope" })).toThrow(/owner\/repo/);
  });

  it("follows pagination links and sends auth headers", async () => {
    const { api, calls } = client([
      json([{ name: "a", color: "000000", description: null }], {
        headers: { link: '<https://api.github.com/repos/acme/fairhour/labels?page=2>; rel="next", <https://x>; rel="last"' },
      }),
      json([{ name: "b", color: "ffffff", description: "B" }]),
    ]);
    const labels = await api.listLabels();
    expect(labels.map((l) => l.name)).toEqual(["a", "b"]);
    expect(calls[0]?.url).toBe("https://api.github.com/repos/acme/fairhour/labels?per_page=100");
    expect(calls[1]?.url).toBe("https://api.github.com/repos/acme/fairhour/labels?page=2");
    expect(calls[0]?.headers["authorization"]).toBe("Bearer t0k3n");
  });

  it("excludes pull requests and normalizes issue labels and milestones", async () => {
    const { api } = client([
      json([
        { number: 1, title: "i", body: null, state: "open", labels: [{ name: "P1" }, "raw", {}], milestone: { title: "v1" } },
        { number: 2, title: "pr", body: null, state: "open", labels: [], milestone: null, pull_request: {} },
      ]),
    ]);
    expect(await api.listIssues()).toEqual([
      { number: 1, title: "i", body: null, state: "open", labels: ["P1", "raw"], milestone: "v1" },
    ]);
  });

  it("encodes label names and pauses after writes", async () => {
    const sleeps: number[] = [];
    const { api, calls } = client([new Response(null, { status: 200 })], sleeps);
    await api.updateLabel("type: bug", { name: "type: bug", color: "d73a4a", description: "Bug" });
    expect(calls[0]?.url).toBe("https://api.github.com/repos/acme/fairhour/labels/type%3A%20bug");
    expect(calls[0]?.method).toBe("PATCH");
    expect(calls[0]?.body).toEqual({ new_name: "type: bug", color: "d73a4a", description: "Bug" });
    expect(sleeps).toEqual([5]);
  });

  it("retries rate-limited requests honoring retry-after", async () => {
    const sleeps: number[] = [];
    const { api, calls } = client(
      [
        new Response("slow down", { status: 403, headers: { "retry-after": "3" } }),
        new Response("busy", { status: 502 }),
        json({ number: 9, title: "t", body: "b", state: "open", labels: [], milestone: null }, { status: 201 }),
      ],
      sleeps,
    );
    const issue = await api.createIssue({ title: "t", body: "b", labels: [], milestone: 4 });
    expect(issue.number).toBe(9);
    expect(calls).toHaveLength(3);
    expect(calls[2]?.body).toEqual({ title: "t", body: "b", labels: [], milestone: 4 });
    expect(sleeps).toEqual([3000, 2000, 5]);
  });

  it("waits for the rate limit reset when the quota is exhausted", async () => {
    const sleeps: number[] = [];
    const reset = Math.floor(Date.now() / 1000) + 30;
    const { api } = client(
      [
        new Response("limit", {
          status: 403,
          headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(reset) },
        }),
        json([]),
      ],
      sleeps,
    );
    await api.listMilestones();
    expect(sleeps[0]).toBeGreaterThan(25_000);
    expect(sleeps[0]).toBeLessThanOrEqual(30_000);
  });

  it("throws a descriptive error for non-retryable failures and after max retries", async () => {
    const { api } = client([new Response("Validation Failed", { status: 422 })]);
    await expect(api.createLabel({ name: "x", color: "000000", description: "" })).rejects.toThrow(
      /POST \/repos\/acme\/fairhour\/labels failed with 422: Validation Failed/,
    );
    const { api: retrying } = client([
      new Response("a", { status: 500 }),
      new Response("b", { status: 500 }),
      new Response("c", { status: 500 }),
    ]);
    const error = await retrying.listIssues().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GitHubRequestError);
    expect((error as GitHubRequestError).status).toBe(500);
  });

  it("creates and updates milestones with due dates", async () => {
    const { api, calls } = client([
      json({ number: 3, title: "v1", description: "d", state: "open", due_on: null }, { status: 201 }),
      new Response(null, { status: 200 }),
      new Response(null, { status: 200 }),
      json({ number: 1, title: "t", body: "", state: "closed", labels: [], milestone: null }),
    ]);
    expect((await api.createMilestone({ title: "v1", description: "d", due_on: "2026-12-31" })).number).toBe(3);
    await api.updateMilestone(3, { title: "v1", description: "e", due_on: "2027-01-31" });
    await api.updateMilestone(3, { title: "v1", description: "f" });
    await api.updateIssue(1, { state: "closed", state_reason: "completed" });
    expect(calls[0]?.body).toEqual({ title: "v1", description: "d", due_on: "2026-12-31T23:59:59Z" });
    expect(calls[1]?.body).toEqual({ description: "e", due_on: "2027-01-31T23:59:59Z" });
    expect(calls[2]?.body).toEqual({ description: "f" });
    expect(calls[3]?.url).toBe("https://api.github.com/repos/acme/fairhour/issues/1");
  });
});
