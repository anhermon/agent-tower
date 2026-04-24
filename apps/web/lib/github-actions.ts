export interface GitHubActionExecutor {
  reviewPullRequest(params: {
    repoFullName: string;
    pullRequestNumber: number;
    instructions: string;
  }): Promise<void>;

  createComment(params: { repoFullName: string; issueNumber: number; body: string }): Promise<void>;

  createIssue(params: { repoFullName: string; title: string; body: string }): Promise<void>;
}

const GITHUB_API_BASE = "https://api.github.com";

function getGitHubToken(): string {
  const token = process.env.CLAUDE_CONTROL_PLANE_GITHUB_TOKEN;
  if (!token) {
    throw new Error("CLAUDE_CONTROL_PLANE_GITHUB_TOKEN is not configured");
  }
  return token;
}

function extractPullRequestNumber(rawPayload: unknown): number | null {
  const payload = rawPayload as Record<string, unknown>;
  if (typeof payload.number === "number") {
    return payload.number;
  }
  const pr = payload.pull_request as Record<string, unknown> | undefined;
  if (pr && typeof pr.number === "number") {
    return pr.number;
  }
  return null;
}

function extractIssueNumber(rawPayload: unknown): number | null {
  const payload = rawPayload as Record<string, unknown>;
  if (typeof payload.number === "number") {
    return payload.number;
  }
  const issue = payload.issue as Record<string, unknown> | undefined;
  if (issue && typeof issue.number === "number") {
    return issue.number;
  }
  return null;
}

async function githubFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getGitHubToken();
  const url = `${GITHUB_API_BASE}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "control-plane-webhook-agent",
      ...(options.headers || {}),
    },
  });

  if (response.status === 403 || response.status === 429) {
    const retryAfter = response.headers.get("retry-after");
    const resetAt = response.headers.get("x-ratelimit-reset");
    console.warn("GitHub API rate limit hit", {
      path,
      retryAfter,
      resetAt,
    });
    throw new Error(`GitHub API rate limit: ${response.status}`);
  }

  if (response.status === 401) {
    throw new Error("GitHub API authentication failed");
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API error: ${response.status} ${body}`);
  }

  return response;
}

export function createGitHubActionExecutor(): GitHubActionExecutor {
  return {
    async reviewPullRequest({ repoFullName, pullRequestNumber, instructions }) {
      const [owner, repo] = repoFullName.split("/");
      await githubFetch(`/repos/${owner}/${repo}/pulls/${pullRequestNumber}/reviews`, {
        method: "POST",
        body: JSON.stringify({
          body: instructions,
          event: "COMMENT",
        }),
      });
    },

    async createComment({ repoFullName, issueNumber, body }) {
      const [owner, repo] = repoFullName.split("/");
      await githubFetch(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
    },

    async createIssue({ repoFullName, title, body }) {
      const [owner, repo] = repoFullName.split("/");
      await githubFetch(`/repos/${owner}/${repo}/issues`, {
        method: "POST",
        body: JSON.stringify({ title, body }),
      });
    },
  };
}

export function createActionExecutor(): GitHubActionExecutor {
  return createGitHubActionExecutor();
}

export { extractPullRequestNumber, extractIssueNumber };
