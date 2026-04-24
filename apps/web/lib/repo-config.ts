import YAML from "yaml";

export interface RepoWorkflowConfig {
  readonly version: number;
  readonly enabled: boolean;
  readonly rules: readonly WorkflowRule[];
}

export interface WorkflowRule {
  readonly name: string;
  readonly events: readonly EventTrigger[];
  readonly actions: readonly WorkflowAction[];
}

export interface EventTrigger {
  readonly type: string;
  readonly actions?: readonly string[];
  readonly filter?: string;
}

export interface WorkflowAction {
  readonly type: "review_pr" | "respond_comment" | "create_issue";
  readonly instructions?: string;
  readonly title_template?: string;
  readonly body_template?: string;
}

export interface RepoConfigProvider {
  fetchConfig(repoFullName: string): Promise<RepoWorkflowConfig | null>;
}

interface CacheEntry {
  config: RepoWorkflowConfig | null;
  expiresAt: number;
}

const GITHUB_API_BASE = "https://api.github.com";
const CACHE_TTL_MS = 60_000;
const NEGATIVE_CACHE_TTL_MS = 300_000;
const MAX_CACHE_SIZE = 1000;

function getGitHubToken(): string {
  const token = process.env.CLAUDE_CONTROL_PLANE_GITHUB_TOKEN;
  if (!token) {
    throw new Error("CLAUDE_CONTROL_PLANE_GITHUB_TOKEN is not configured");
  }
  return token;
}

function isValidRepoConfig(value: unknown): value is RepoWorkflowConfig {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  if (obj.version !== 1) {
    return false;
  }

  if (typeof obj.enabled !== "boolean") {
    return false;
  }

  if (!Array.isArray(obj.rules)) {
    return false;
  }

  for (const rule of obj.rules) {
    if (typeof rule !== "object" || rule === null) {
      return false;
    }

    const ruleObj = rule as Record<string, unknown>;

    if (typeof ruleObj.name !== "string") {
      return false;
    }

    if (!Array.isArray(ruleObj.events)) {
      return false;
    }

    for (const event of ruleObj.events) {
      if (typeof event !== "object" || event === null) {
        return false;
      }
      const eventObj = event as Record<string, unknown>;
      if (typeof eventObj.type !== "string") {
        return false;
      }
      if (eventObj.actions !== undefined && !Array.isArray(eventObj.actions)) {
        return false;
      }
      if (eventObj.filter !== undefined && typeof eventObj.filter !== "string") {
        return false;
      }
    }

    if (!Array.isArray(ruleObj.actions)) {
      return false;
    }

    for (const action of ruleObj.actions) {
      if (typeof action !== "object" || action === null) {
        return false;
      }
      const actionObj = action as Record<string, unknown>;
      if (
        typeof actionObj.type !== "string" ||
        !["review_pr", "respond_comment", "create_issue"].includes(actionObj.type)
      ) {
        return false;
      }
      if (actionObj.instructions !== undefined && typeof actionObj.instructions !== "string") {
        return false;
      }
      if (actionObj.title_template !== undefined && typeof actionObj.title_template !== "string") {
        return false;
      }
      if (actionObj.body_template !== undefined && typeof actionObj.body_template !== "string") {
        return false;
      }
    }
  }

  return true;
}

function logRateLimit(headers: Headers, repoFullName: string): void {
  const remaining = headers.get("X-RateLimit-Remaining");
  if (remaining === null) return;

  const remainingNum = parseInt(remaining, 10);
  if (Number.isNaN(remainingNum)) return;

  if (remainingNum < 100) {
    console.warn("GitHub API rate limit low", {
      repoFullName,
      remaining: remainingNum,
    });
  } else {
    console.debug("GitHub API rate limit", {
      repoFullName,
      remaining: remainingNum,
    });
  }
}

export function createRepoConfigProvider(): RepoConfigProvider {
  const cache = new Map<string, CacheEntry>();
  const accessOrder: string[] = [];

  function getCacheKey(repoFullName: string): string {
    return `github:${repoFullName}`;
  }

  function getFromCache(key: string): CacheEntry | undefined {
    const entry = cache.get(key);
    if (!entry) return undefined;

    // Update access order for LRU
    const index = accessOrder.indexOf(key);
    if (index > -1) {
      accessOrder.splice(index, 1);
    }
    accessOrder.push(key);

    return entry;
  }

  function setCache(key: string, entry: CacheEntry): void {
    if (cache.has(key)) {
      const index = accessOrder.indexOf(key);
      if (index > -1) {
        accessOrder.splice(index, 1);
      }
    } else if (cache.size >= MAX_CACHE_SIZE) {
      const oldestKey = accessOrder.shift();
      if (oldestKey) {
        cache.delete(oldestKey);
      }
    }

    cache.set(key, entry);
    accessOrder.push(key);
  }

  async function fetchConfig(repoFullName: string): Promise<RepoWorkflowConfig | null> {
    const token = getGitHubToken();
    const cacheKey = getCacheKey(repoFullName);
    const now = Date.now();

    const cached = getFromCache(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.config;
    }

    const url = `${GITHUB_API_BASE}/repos/${repoFullName}/contents/.opencode/workflow.yml`;

    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/vnd.github.v3.raw",
          Authorization: `Bearer ${token}`,
          "User-Agent": "control-plane-webhook-agent",
        },
      });

      logRateLimit(response.headers, repoFullName);

      if (response.status === 404) {
        setCache(cacheKey, {
          config: null,
          expiresAt: now + NEGATIVE_CACHE_TTL_MS,
        });
        return null;
      }

      if (!response.ok) {
        console.warn("GitHub API error fetching repo config", {
          repoFullName,
          status: response.status,
          statusText: response.statusText,
        });
        return null;
      }

      const rawYaml = await response.text();

      let parsed: unknown;
      try {
        parsed = YAML.parse(rawYaml);
      } catch (parseError) {
        console.warn("Failed to parse repo config YAML", {
          repoFullName,
          error: parseError instanceof Error ? parseError.message : String(parseError),
        });
        return null;
      }

      if (!isValidRepoConfig(parsed)) {
        console.warn("Invalid repo config schema", {
          repoFullName,
        });
        return null;
      }

      setCache(cacheKey, {
        config: parsed,
        expiresAt: now + CACHE_TTL_MS,
      });

      return parsed;
    } catch (error) {
      console.warn("Failed to fetch repo config", {
        repoFullName,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  return {
    fetchConfig,
  };
}
