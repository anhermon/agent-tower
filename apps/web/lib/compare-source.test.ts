import { beforeEach, describe, expect, it, vi } from "vitest";

import { getCompareData } from "./compare-source";
import { getConfiguredAnalyticsSource } from "./sessions-source";

// Mock server-only so the import works in tests
vi.mock("server-only", () => ({}));

// Mock sessions-source to control the analytics source
vi.mock("./sessions-source", () => ({
  getConfiguredAnalyticsSource: vi.fn(),
}));

const mockGetConfiguredAnalyticsSource = vi.mocked(getConfiguredAnalyticsSource);

describe("getCompareData", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns unconfigured when no analytics source is available", async () => {
    mockGetConfiguredAnalyticsSource.mockReturnValue(null);
    const result = await getCompareData();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unconfigured");
  });

  it("returns compare data when sessions are available", async () => {
    const mockSummaries = [
      {
        sessionId: "s1",
        model: "claude-sonnet-4-6",
        usage: {
          inputTokens: 1000,
          outputTokens: 200,
          cacheCreationInputTokens: 400,
          cacheReadInputTokens: 1600,
        },
        estimatedCostUsd: 0.05,
        cacheEfficiency: { savedUsd: 0.01, hitRate: 0.8, wouldHavePaidUsd: 0.06 },
        toolCounts: {},
        flags: {
          hasCompaction: false,
          hasThinking: false,
          usesTaskAgent: false,
          usesMcp: false,
          usesWebSearch: false,
          usesWebFetch: false,
        },
        compactions: [],
        userMessageCount: 5,
        assistantMessageCount: 5,
      },
    ];
    const mockSource = {
      listSessionSummaries: vi.fn().mockResolvedValue(mockSummaries),
    };
    mockGetConfiguredAnalyticsSource.mockReturnValue(mockSource as never);

    const result = await getCompareData();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sessionCount).toBe(1);
      expect(result.value.models).toHaveLength(1);
      expect(result.value.models[0]?.model).toBe("claude-sonnet-4-6");
      expect(result.value.harnesses).toHaveLength(1);
      expect(result.value.featureMatrix.harnesses).toHaveLength(1);
    }
  });

  it("returns error result when source throws", async () => {
    const mockSource = {
      listSessionSummaries: vi.fn().mockRejectedValue(new Error("disk read failed")),
    };
    mockGetConfiguredAnalyticsSource.mockReturnValue(mockSource as never);

    const result = await getCompareData();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("error");
      if (result.reason === "error") expect(result.message).toContain("disk read failed");
    }
  });
});
