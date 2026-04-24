/* eslint-disable @typescript-eslint/require-await -- test mocks implement async interfaces with synchronous stubs */
/* eslint-disable @typescript-eslint/no-empty-function -- test spy suppressors need empty function bodies */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRepoConfigProvider, type RepoConfigProvider } from "./repo-config";

describe("RepoConfigProvider", () => {
  let provider: RepoConfigProvider;
  let fetchMock: ReturnType<typeof vi.fn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  const originalEnv = process.env.CLAUDE_CONTROL_PLANE_GITHUB_TOKEN;

  beforeEach(() => {
    process.env.CLAUDE_CONTROL_PLANE_GITHUB_TOKEN = "test-token";
    fetchMock = vi.fn();
    global.fetch = fetchMock;
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    provider = createRepoConfigProvider();
    // Note: we don't use fakeTimers here because lru-cache relies on Date.now()
    // and we mock Date.now() directly in tests that need TTL expiration
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalEnv === undefined) {
      delete process.env.CLAUDE_CONTROL_PLANE_GITHUB_TOKEN;
    } else {
      process.env.CLAUDE_CONTROL_PLANE_GITHUB_TOKEN = originalEnv;
    }
  });

  describe("fetchConfig", () => {
    it("fetches config from GitHub API and returns parsed config", async () => {
      const yamlContent = `
version: 1
enabled: true
rules:
  - name: "Review PRs"
    events:
      - type: pull_request
        actions: [opened, synchronize]
    actions:
      - type: review_pr
        instructions: "Review this PR"
`;

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => yamlContent,
        headers: new Headers({
          "X-RateLimit-Remaining": "4999",
        }),
      });

      const config = await provider.fetchConfig("owner/repo");

      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.github.com/repos/owner/repo/contents/.opencode/workflow.yml",
        {
          headers: {
            Accept: "application/vnd.github.v3.raw",
            Authorization: "Bearer test-token",
            "User-Agent": "control-plane-webhook-agent",
          },
        }
      );

      expect(config).toBeDefined();
      expect(config?.version).toBe(1);
      expect(config?.enabled).toBe(true);
      expect(config?.rules).toHaveLength(1);
      expect(config?.rules[0].name).toBe("Review PRs");
    });

    it("returns null for 404 response", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => "Not Found",
        headers: new Headers({}),
      });

      const config = await provider.fetchConfig("owner/repo");

      expect(config).toBeNull();
    });

    it("returns cached config on cache hit", async () => {
      const yamlContent = `
version: 1
enabled: true
rules: []
`;

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => yamlContent,
        headers: new Headers({
          "X-RateLimit-Remaining": "4999",
        }),
      });

      // First fetch
      await provider.fetchConfig("owner/repo");

      // Second fetch within TTL should not call fetch again
      const config = await provider.fetchConfig("owner/repo");

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(config).toBeDefined();
      expect(config?.version).toBe(1);
    });

    it("fetches again after cache TTL expires", async () => {
      const yamlContent = `
version: 1
enabled: true
rules: []
`;

      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => yamlContent,
          headers: new Headers({
            "X-RateLimit-Remaining": "4999",
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          text: async () => yamlContent,
          headers: new Headers({
            "X-RateLimit-Remaining": "4998",
          }),
        });

      const baseTime = performance.now();
      vi.spyOn(performance, "now").mockReturnValue(baseTime);

      // First fetch
      await provider.fetchConfig("owner/repo");

      // Advance time past TTL (60 seconds)
      vi.spyOn(performance, "now").mockReturnValue(baseTime + 61_000);

      // Second fetch should call fetch again
      await provider.fetchConfig("owner/repo");

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("returns null and logs warning for invalid YAML", async () => {
      const invalidYaml = `
version: 1
enabled: true
rules:
  - name: "Test"
    events: [invalid yaml syntax :::
`;

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => invalidYaml,
        headers: new Headers({}),
      });

      const config = await provider.fetchConfig("owner/repo");

      expect(config).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to parse repo config"),
        expect.any(Object)
      );
    });

    it("returns null and logs warning for invalid schema", async () => {
      const invalidSchema = `
version: 2
enabled: not-a-boolean
rules: "not-an-array"
`;

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => invalidSchema,
        headers: new Headers({}),
      });

      const config = await provider.fetchConfig("owner/repo");

      expect(config).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Invalid repo config schema"),
        expect.any(Object)
      );
    });

    it("returns null and logs warning for missing required fields", async () => {
      const missingFields = `
version: 1
rules: []
`;

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => missingFields,
        headers: new Headers({}),
      });

      const config = await provider.fetchConfig("owner/repo");

      expect(config).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Invalid repo config schema"),
        expect.any(Object)
      );
    });

    it("negative caches 404 responses for 300 seconds", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => "Not Found",
        headers: new Headers({}),
      });

      // First fetch
      await provider.fetchConfig("owner/repo");

      // Second fetch within 300s TTL should not call fetch again
      await provider.fetchConfig("owner/repo");

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("refetches after 404 negative cache expires", async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          text: async () => "Not Found",
          headers: new Headers({}),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          text: async () => "Not Found",
          headers: new Headers({}),
        });

      const baseTime = performance.now();
      vi.spyOn(performance, "now").mockReturnValue(baseTime);

      // First fetch
      await provider.fetchConfig("owner/repo");

      // Advance time past 404 TTL (300 seconds)
      vi.spyOn(performance, "now").mockReturnValue(baseTime + 301_000);

      // Second fetch should call fetch again
      await provider.fetchConfig("owner/repo");

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("logs rate limit warnings when remaining drops below 100", async () => {
      const yamlContent = `
version: 1
enabled: true
rules: []
`;

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => yamlContent,
        headers: new Headers({
          "X-RateLimit-Remaining": "50",
        }),
      });

      await provider.fetchConfig("owner/repo");

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("GitHub API rate limit low"),
        expect.any(Object)
      );
    });

    it("logs debug rate limit info when remaining is healthy", async () => {
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

      const yamlContent = `
version: 1
enabled: true
rules: []
`;

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => yamlContent,
        headers: new Headers({
          "X-RateLimit-Remaining": "4999",
        }),
      });

      await provider.fetchConfig("owner/repo");

      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining("GitHub API rate limit"),
        expect.any(Object)
      );
    });

    it("throws error when GitHub token is not configured", async () => {
      delete process.env.CLAUDE_CONTROL_PLANE_GITHUB_TOKEN;

      // Create a new provider with missing token
      const providerWithoutToken = createRepoConfigProvider();

      await expect(providerWithoutToken.fetchConfig("owner/repo")).rejects.toThrow(
        "CLAUDE_CONTROL_PLANE_GITHUB_TOKEN is not configured"
      );
    });
  });
});
