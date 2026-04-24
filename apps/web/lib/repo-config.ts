import { LRUCache } from "lru-cache";
import YAML from "yaml";
import { z } from "zod";

const WorkflowActionSchema = z.object({
  type: z.enum(["review_pr", "respond_comment", "create_issue"]),
  instructions: z.string().optional(),
  title_template: z.string().optional(),
  body_template: z.string().optional(),
});

const EventTriggerSchema = z.object({
  type: z.string(),
  actions: z.array(z.string()).optional(),
  filter: z.string().optional(),
});

const WorkflowRuleSchema = z.object({
  name: z.string(),
  events: z.array(EventTriggerSchema),
  actions: z.array(WorkflowActionSchema),
});

const RepoWorkflowConfigSchema = z.object({
  version: z.literal(1),
  enabled: z.boolean(),
  rules: z.array(WorkflowRuleSchema),
});

export type RepoWorkflowConfig = z.infer<typeof RepoWorkflowConfigSchema>;
export type WorkflowRule = z.infer<typeof WorkflowRuleSchema>;
export type EventTrigger = z.infer<typeof EventTriggerSchema>;
export type WorkflowAction = z.infer<typeof WorkflowActionSchema>;

export interface RepoConfigProvider {
  fetchConfig(repoFullName: string): Promise<RepoWorkflowConfig | null>;
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

interface CacheEntry {
  readonly config: RepoWorkflowConfig | null;
}

export function createRepoConfigProvider(): RepoConfigProvider {
  const cache = new LRUCache<string, CacheEntry>({
    max: MAX_CACHE_SIZE,
    ttlAutopurge: true,
  });

  function getCacheKey(repoFullName: string): string {
    return `github:${repoFullName}`;
  }

  async function fetchConfig(repoFullName: string): Promise<RepoWorkflowConfig | null> {
    const token = getGitHubToken();
    const cacheKey = getCacheKey(repoFullName);

    const cached = cache.get(cacheKey);
    if (cached !== undefined) {
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
        cache.set(cacheKey, { config: null }, { ttl: NEGATIVE_CACHE_TTL_MS });
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

      const result = RepoWorkflowConfigSchema.safeParse(parsed);
      if (!result.success) {
        console.warn("Invalid repo config schema", {
          repoFullName,
          errors: result.error.issues,
        });
        return null;
      }

      cache.set(cacheKey, { config: result.data }, { ttl: CACHE_TTL_MS });

      return result.data;
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
