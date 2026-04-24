/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { TokenAttributionReport } from "@control-plane/core";

import { AttributionTable } from "./attribution-table";

const SINGLE_ROW_REPORT: TokenAttributionReport = {
  generatedAt: "2026-04-24T00:00:00.000Z",
  totalSessionsAnalyzed: 5,
  totalEstimatedSavings: 1200,
  rows: [
    {
      toolId: "rtk",
      toolName: "RTK",
      sessionsObserved: 3,
      toolCallsObserved: 3,
      estimatedTokensSaved: 1200,
      percentReduction: 2.5,
      evidence:
        "Approximation: Bash tool calls with 'rtk' in command string (~400 tokens saved per call).",
    },
  ],
};

describe("AttributionTable", () => {
  afterEach(cleanup);

  it("renders the tool name for a single-row report", () => {
    render(<AttributionTable report={SINGLE_ROW_REPORT} />);
    expect(screen.getByText("RTK")).toBeDefined();
  });

  it("renders the estimated savings for a single-row report", () => {
    render(<AttributionTable report={SINGLE_ROW_REPORT} />);
    // 1200 formatted with toLocaleString — at minimum should contain "1"
    const cells = screen.getAllByText(/1[,.]?200/);
    expect(cells.length).toBeGreaterThanOrEqual(1);
  });

  it("renders column headers", () => {
    render(<AttributionTable report={SINGLE_ROW_REPORT} />);
    expect(screen.getByText("Tool")).toBeDefined();
    expect(screen.getByText("Sessions")).toBeDefined();
    expect(screen.getByText("Tool Calls")).toBeDefined();
  });

  it("renders evidence text", () => {
    render(<AttributionTable report={SINGLE_ROW_REPORT} />);
    expect(screen.getByText(/Approximation: Bash tool calls with 'rtk'/)).toBeDefined();
  });

  it("renders a totals row", () => {
    render(<AttributionTable report={SINGLE_ROW_REPORT} />);
    expect(screen.getByText("Totals")).toBeDefined();
  });
});
