import type {
  CostBreakdown,
  DateRange,
  ProjectSummary,
  ReplayData,
  SessionAnalyticsFilter,
  SessionAnalyticsSource,
  SessionIngestBatch,
  SessionUsageSummary,
  Timeseries,
  ToolAnalytics,
} from "@control-plane/core";

import { foldCostBreakdown } from "./analytics/cost.js";
import { foldProjectSummaries } from "./analytics/project-summary.js";
import { foldReplay } from "./analytics/replay.js";
import { foldSessionSummary } from "./analytics/session-summary.js";
import { foldTimeseries } from "./analytics/timeseries.js";
import { foldToolAnalytics } from "./analytics/tools.js";
import {
  type NormalizedTranscript,
  type NormalizeOptions,
  normalizeTranscript,
} from "./normalizer.js";
import {
  type ClaudeCodeDataRoot,
  type ClaudeSessionFile,
  listSessionFiles,
  type ReadTranscriptResult,
  readTranscriptFile,
} from "./reader.js";

/**
 * Read-only Claude Code source adapter.
 *
 * The adapter scans an explicit data root, reads JSONL transcripts, and emits
 * canonical `SessionIngestBatch` values ready to be handed to any
 * `SessionIngestAdapter`. It performs no writes and no network calls.
 */
export class ClaudeCodeSessionSource {
  constructor(private readonly root: ClaudeCodeDataRoot) {}

  async listSessions(): Promise<readonly ClaudeSessionFile[]> {
    return listSessionFiles(this.root);
  }

  async loadSession(
    sessionId: string,
    options: NormalizeOptions = {}
  ): Promise<NormalizedTranscript | undefined> {
    const sessions = await this.listSessions();
    const match = sessions.find((session) => session.sessionId === sessionId);
    if (!match) {
      return undefined;
    }

    const { entries } = await readTranscriptFile(match.filePath);
    if (entries.length === 0) {
      return undefined;
    }

    return normalizeTranscript(entries, options);
  }

  async *stream(options: NormalizeOptions = {}): AsyncGenerator<SessionIngestBatch, void, void> {
    const sessions = await this.listSessions();
    for (const session of sessions) {
      const { entries } = await readTranscriptFile(session.filePath);
      if (entries.length === 0) continue;

      try {
        const normalized = normalizeTranscript(entries, options);
        yield normalized.batch;
      } catch {}
    }
  }
}

interface CachedParse {
  readonly mtime: string;
  readonly result: ReadTranscriptResult;
}

/**
 * Read-only adapter that implements the canonical `SessionAnalyticsSource`
 * contract. Shares the JSONL reader + listing with `ClaudeCodeSessionSource`;
 * results are memoized by `filePath:mtime` so repeat listings are O(n) instead
 * of O(n·m).
 */
export class ClaudeCodeAnalyticsSource implements SessionAnalyticsSource {
  private readonly parseCache = new Map<string, CachedParse>();
  private readonly summaryCache = new Map<
    string,
    { mtime: string; summary: SessionUsageSummary }
  >();

  constructor(private readonly root: ClaudeCodeDataRoot) {}

  async listProjectSummaries(): Promise<readonly ProjectSummary[]> {
    const sessions = await this.collectAllSummaries();
    return foldProjectSummaries(
      sessions,
      (s) => s.cwd ?? "unknown",
      (_id, group) => {
        for (const s of group) if (s.cwd) return s.cwd;
        return undefined;
      }
    );
  }

  async listSessionSummaries(
    filter?: SessionAnalyticsFilter
  ): Promise<readonly SessionUsageSummary[]> {
    const all = await this.collectAllSummaries();
    let result = all;
    if (filter?.projectId) {
      result = result.filter((s) => (s.cwd ?? "unknown") === filter.projectId);
    }
    if (filter?.range) {
      const { from, to } = filter.range;
      result = result.filter((s) => {
        const d = s.startTime?.slice(0, 10);
        return d ? d >= from && d <= to : false;
      });
    }
    return result;
  }

  async loadSessionUsage(sessionId: string): Promise<SessionUsageSummary | undefined> {
    const file = await this.findSessionFile(sessionId);
    if (!file) return undefined;
    return this.summaryFor(file);
  }

  async loadSessionEntries(sessionId: string): Promise<ReadTranscriptResult | undefined> {
    const file = await this.findSessionFile(sessionId);
    if (!file) return undefined;
    return this.parseFile(file);
  }

  async loadSessionReplay(sessionId: string): Promise<ReplayData | undefined> {
    const file = await this.findSessionFile(sessionId);
    if (!file) return undefined;
    const parsed = await this.parseFile(file);
    if (parsed.entries.length === 0) return undefined;
    return foldReplay(parsed.entries, { sessionId });
  }

  async loadActivityTimeseries(range?: DateRange): Promise<Timeseries> {
    // Re-use the same filter pipeline as listSessionSummaries so range-scoped
    // metrics (timeseries, cost, etc.) stay consistent with the session list
    // the UI is showing.
    const sessions = await this.listSessionSummaries(range ? { range } : undefined);
    return foldTimeseries(sessions, { ...(range ? { range } : {}) });
  }

  async loadCostBreakdown(range?: DateRange): Promise<CostBreakdown> {
    const sessions = await this.listSessionSummaries(range ? { range } : undefined);
    return foldCostBreakdown(sessions, { ...(range ? { range } : {}) });
  }

  async loadToolAnalytics(): Promise<ToolAnalytics> {
    const sessions = await this.collectAllSummaries();
    return foldToolAnalytics(sessions);
  }

  private async collectAllSummaries(): Promise<readonly SessionUsageSummary[]> {
    const files = await listSessionFiles(this.root);
    const concurrency = 16;
    const results: SessionUsageSummary[] = new Array(files.length);
    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (true) {
        const index = cursor;
        cursor += 1;
        if (index >= files.length) return;
        const file = files[index]!;
        try {
          results[index] = await this.summaryFor(file);
        } catch {
          // Skip unreadable files without fabricating data.
          results[index] = foldSessionSummary([], { sessionId: file.sessionId });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
    return results.filter(Boolean);
  }

  private async summaryFor(file: ClaudeSessionFile): Promise<SessionUsageSummary> {
    const key = file.filePath;
    const cached = this.summaryCache.get(key);
    if (cached?.mtime === file.modifiedAt) return cached.summary;
    const parsed = await this.parseFile(file);
    const summary = foldSessionSummary(parsed.entries, {
      sessionId: file.sessionId,
      includeTurns: false,
    });
    this.summaryCache.set(key, { mtime: file.modifiedAt, summary });
    return summary;
  }

  private async parseFile(file: ClaudeSessionFile): Promise<ReadTranscriptResult> {
    const key = file.filePath;
    const cached = this.parseCache.get(key);
    if (cached?.mtime === file.modifiedAt) return cached.result;
    const result = await readTranscriptFile(file.filePath);
    this.parseCache.set(key, { mtime: file.modifiedAt, result });
    return result;
  }

  private async findSessionFile(sessionId: string): Promise<ClaudeSessionFile | undefined> {
    const files = await listSessionFiles(this.root);
    return files.find((f) => f.sessionId === sessionId);
  }
}
