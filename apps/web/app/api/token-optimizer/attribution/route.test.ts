import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TokenAttributionReport } from "@control-plane/core";

import * as tokenOptimizerSource from "@/lib/token-optimizer-source";

import { GET } from "./route.js";

vi.mock("@/lib/token-optimizer-source", () => ({
  computeAttribution: vi.fn(),
}));

const ROUTE_URL = "http://127.0.0.1/api/token-optimizer/attribution";

function makeReport(rowCount = 5): TokenAttributionReport {
  return {
    generatedAt: new Date().toISOString(),
    totalSessionsAnalyzed: 0,
    totalEstimatedSavings: 0,
    rows: Array.from({ length: rowCount }, (_, i) => ({
      toolId: "rtk" as const,
      toolName: `Tool ${i}`,
      sessionsObserved: 0,
      toolCallsObserved: 0,
      estimatedTokensSaved: 0,
      percentReduction: 0,
      evidence: "No sessions analyzed.",
    })),
  };
}

describe("GET /api/token-optimizer/attribution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("given_attribution_available__when_get__then_returns_ok_with_report_having_5_rows", async () => {
    const report = makeReport(5);
    vi.mocked(tokenOptimizerSource.computeAttribution).mockResolvedValue(report);

    const response = await GET(new Request(ROUTE_URL));

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    const returnedReport = body.report as TokenAttributionReport;
    expect(returnedReport.rows).toHaveLength(5);
  });

  it("given_source_throws__when_get__then_returns_500", async () => {
    vi.mocked(tokenOptimizerSource.computeAttribution).mockRejectedValue(new Error("scan failed"));

    const response = await GET(new Request(ROUTE_URL));

    expect(response.status).toBe(500);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe("string");
  });
});
