import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createGitHubActionExecutor } from "./github-actions";

const TEST_TOKEN = "ghp_test_token_12345";
const REPO = "owner/repo";

// ---------------------------------------------------------------------------
// fetch mock helpers
// ---------------------------------------------------------------------------

function makeOkResponse(body: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function makeErrorResponse(status: number, body = "error"): Response {
  return new Response(body, { status });
}

function makeRateLimitResponse(status: 403 | 429): Response {
  return new Response("rate limited", {
    status,
    headers: { "retry-after": "60", "x-ratelimit-reset": "1700000000" },
  });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.stubEnv("CLAUDE_CONTROL_PLANE_GITHUB_TOKEN", TEST_TOKEN);
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// reviewPullRequest
// ---------------------------------------------------------------------------

describe("GitHubActionExecutor.reviewPullRequest", () => {
  it("sends a POST to the correct GitHub API endpoint with COMMENT event", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeOkResponse({ id: 1 }));

    const executor = createGitHubActionExecutor();
    await executor.reviewPullRequest({
      repoFullName: REPO,
      pullRequestNumber: 42,
      instructions: "LGTM",
    });

    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/owner/repo/pulls/42/reviews");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.event).toBe("COMMENT");
    expect(body.body).toBe("LGTM");
  });

  it("sends Authorization header with Bearer token", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeOkResponse());

    const executor = createGitHubActionExecutor();
    await executor.reviewPullRequest({
      repoFullName: REPO,
      pullRequestNumber: 1,
      instructions: "",
    });

    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TEST_TOKEN}`);
  });

  it("throws when CLAUDE_CONTROL_PLANE_GITHUB_TOKEN is not set", async () => {
    vi.unstubAllEnvs();
    delete process.env.CLAUDE_CONTROL_PLANE_GITHUB_TOKEN;

    const executor = createGitHubActionExecutor();
    await expect(
      executor.reviewPullRequest({ repoFullName: REPO, pullRequestNumber: 1, instructions: "" })
    ).rejects.toThrow("CLAUDE_CONTROL_PLANE_GITHUB_TOKEN is not configured");
  });

  it("throws on rate limit (403)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeRateLimitResponse(403));

    const executor = createGitHubActionExecutor();
    await expect(
      executor.reviewPullRequest({ repoFullName: REPO, pullRequestNumber: 1, instructions: "" })
    ).rejects.toThrow("GitHub API rate limit: 403");
  });

  it("throws on rate limit (429)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeRateLimitResponse(429));

    const executor = createGitHubActionExecutor();
    await expect(
      executor.reviewPullRequest({ repoFullName: REPO, pullRequestNumber: 1, instructions: "" })
    ).rejects.toThrow("GitHub API rate limit: 429");
  });

  it("throws on 401 authentication failure", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeErrorResponse(401));

    const executor = createGitHubActionExecutor();
    await expect(
      executor.reviewPullRequest({ repoFullName: REPO, pullRequestNumber: 1, instructions: "" })
    ).rejects.toThrow("GitHub API authentication failed");
  });

  it("throws on generic 5xx error", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeErrorResponse(500, "internal server error"));

    const executor = createGitHubActionExecutor();
    await expect(
      executor.reviewPullRequest({ repoFullName: REPO, pullRequestNumber: 1, instructions: "" })
    ).rejects.toThrow("GitHub API error: 500");
  });
});

// ---------------------------------------------------------------------------
// createComment
// ---------------------------------------------------------------------------

describe("GitHubActionExecutor.createComment", () => {
  it("sends a POST to the correct GitHub issues comments endpoint", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeOkResponse({ id: 2 }));

    const executor = createGitHubActionExecutor();
    await executor.createComment({ repoFullName: REPO, issueNumber: 7, body: "Hello there!" });

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/owner/repo/issues/7/comments");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.body).toBe("Hello there!");
  });

  it("throws on rate limit", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeRateLimitResponse(429));

    const executor = createGitHubActionExecutor();
    await expect(
      executor.createComment({ repoFullName: REPO, issueNumber: 1, body: "" })
    ).rejects.toThrow("GitHub API rate limit");
  });
});

// ---------------------------------------------------------------------------
// createIssue
// ---------------------------------------------------------------------------

describe("GitHubActionExecutor.createIssue", () => {
  it("sends a POST to the correct GitHub issues endpoint with title and body", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeOkResponse({ number: 123 }));

    const executor = createGitHubActionExecutor();
    await executor.createIssue({
      repoFullName: REPO,
      title: "CI is broken",
      body: "Pipeline failed on main.",
    });

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/owner/repo/issues");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.title).toBe("CI is broken");
    expect(body.body).toBe("Pipeline failed on main.");
  });

  it("throws on 401 authentication failure", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(makeErrorResponse(401));

    const executor = createGitHubActionExecutor();
    await expect(
      executor.createIssue({ repoFullName: REPO, title: "test", body: "" })
    ).rejects.toThrow("GitHub API authentication failed");
  });
});
