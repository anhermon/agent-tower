import type {
  AdapterContext,
  AdapterHealth,
  CostBreakdown,
  DateRange,
  HarnessAdapter,
  HarnessDescriptor,
  ProjectSummary,
  ReplayData,
  SessionAnalyticsFilter,
  SessionUsageSummary,
  Timeseries,
  ToolAnalytics,
} from "@control-plane/core";

import { ClaudeCodeAnalyticsSource } from "./adapter.js";

/**
 * Harness adapter for Claude Code — wraps `ClaudeCodeAnalyticsSource` with
 * the `HarnessAdapter` contract so it can be registered in `AdapterRegistry`.
 *
 * The harness kind is "claude-code". Data root defaults to whatever
 * `ClaudeCodeAnalyticsSource` receives; pass the resolved path from
 * `resolveDataRoot()` or an explicit directory.
 */
export class ClaudeCodeHarnessAdapter implements HarnessAdapter {
  readonly descriptor: HarnessDescriptor;
  private readonly source: ClaudeCodeAnalyticsSource;

  constructor(dataRoot: string) {
    this.descriptor = {
      kind: "claude-code",
      displayName: "Claude Code",
      dataRoot,
    };
    this.source = new ClaudeCodeAnalyticsSource({ directory: dataRoot });
  }

  async listProjectSummaries(_context?: AdapterContext): Promise<readonly ProjectSummary[]> {
    return this.source.listProjectSummaries();
  }

  async listSessionSummaries(
    filter?: SessionAnalyticsFilter,
    _context?: AdapterContext
  ): Promise<readonly SessionUsageSummary[]> {
    return this.source.listSessionSummaries(filter);
  }

  async loadSessionUsage(
    sessionId: string,
    _context?: AdapterContext
  ): Promise<SessionUsageSummary | undefined> {
    return this.source.loadSessionUsage(sessionId);
  }

  async loadSessionReplay(
    sessionId: string,
    _context?: AdapterContext
  ): Promise<ReplayData | undefined> {
    return this.source.loadSessionReplay(sessionId);
  }

  async loadActivityTimeseries(range?: DateRange, _context?: AdapterContext): Promise<Timeseries> {
    return this.source.loadActivityTimeseries(range);
  }

  async loadCostBreakdown(range?: DateRange, _context?: AdapterContext): Promise<CostBreakdown> {
    return this.source.loadCostBreakdown(range);
  }

  async loadToolAnalytics(_context?: AdapterContext): Promise<ToolAnalytics> {
    return this.source.loadToolAnalytics();
  }

  async health(_context?: AdapterContext): Promise<AdapterHealth> {
    return {
      status: "healthy",
      checkedAt: new Date().toISOString(),
    };
  }
}
