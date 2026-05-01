/**
 * Harness adapter for OpenAI Codex CLI.
 *
 * Session log format (JSONL, one JSON object per line):
 *   {"timestamp":"…","type":"session_meta","payload":{"id":"…","timestamp":"…","cwd":"…","cli_version":"…"}}
 *   {"timestamp":"…","type":"turn_context","payload":{"model":"gpt-5.4",…}}
 *   {"timestamp":"…","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":…,"cached_input_tokens":…,"output_tokens":…}}}}
 *   {"timestamp":"…","type":"response_item","payload":{"type":"message","role":"user"|"assistant",…}}
 *
 * Storage layout: {dataRoot}/sessions/{YYYY}/{MM}/{DD}/rollout-*.jsonl
 *
 * Data root defaults to ~/.codex (or CODEX_HOME env var).
 */

import { createReadStream, statSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

import type {
  AdapterContext,
  AdapterHealth,
  CostBreakdown,
  DateRange,
  HarnessAdapter,
  HarnessDescriptor,
  ModelUsage,
  ProjectSummary,
  ReplayData,
  SessionAnalyticsFilter,
  SessionUsageSummary,
  Timeseries,
  ToolAnalytics,
} from "@control-plane/core";
import { EMPTY_CACHE_EFFICIENCY, estimateCostFromUsage } from "@control-plane/core";

import { foldCostBreakdown } from "./analytics/cost.js";
import { foldProjectSummaries } from "./analytics/project-summary.js";
import { foldTimeseries } from "./analytics/timeseries.js";
import { foldToolAnalytics } from "./analytics/tools.js";

// ─── Environment / default root ──────────────────────────────────────────────

export const CODEX_HOME_ENV = "CODEX_HOME";

/**
 * Resolve the Codex data root directory.
 *
 * Resolution order:
 *   1. `CODEX_HOME` env var (returned as-is, even if the path doesn't exist).
 *   2. `~/.codex` if the directory exists (conventional Codex location).
 *   3. `null` — callers should treat this as "Codex not installed".
 */
export function resolveCodexDataRoot(): string | null {
  const env = process.env[CODEX_HOME_ENV];
  if (env) return env;
  const defaultPath = join(homedir(), ".codex");
  if (isExistingDirectory(defaultPath)) return defaultPath;
  return null;
}

function isExistingDirectory(target: string): boolean {
  try {
    return statSync(target).isDirectory();
  } catch {
    return false;
  }
}

// ─── Raw JSONL shapes ────────────────────────────────────────────────────────

interface CodexSessionMeta {
  readonly id: string;
  readonly timestamp?: string;
  readonly cwd?: string;
  readonly cli_version?: string;
  readonly model_provider?: string;
  readonly source?: string;
}

interface CodexTokenCountInfo {
  readonly input_tokens: number;
  readonly cached_input_tokens: number;
  readonly output_tokens: number;
}

interface CodexEntry {
  readonly timestamp?: string;
  readonly type: string;
  readonly payload?: Record<string, unknown>;
}

// ─── Parsed session ───────────────────────────────────────────────────────────

interface ParsedCodexSession {
  readonly sessionId: string;
  readonly filePath: string;
  readonly modifiedAt: string;
  readonly sizeBytes: number;
  readonly cwd?: string;
  readonly startTime?: string;
  readonly endTime?: string;
  readonly model?: string;
  readonly version?: string;
  readonly totalTokenUsage: CodexTokenCountInfo;
  readonly userMessageCount: number;
  readonly assistantMessageCount: number;
}

// ─── Reader ───────────────────────────────────────────────────────────────────

async function listCodexFiles(dataRoot: string): Promise<readonly string[]> {
  const sessionsDir = join(dataRoot, "sessions");
  const result: string[] = [];
  try {
    const years = await readdir(sessionsDir);
    for (const year of years) {
      const yearDir = join(sessionsDir, year);
      const months = await readdir(yearDir).catch(() => []);
      for (const month of months) {
        const monthDir = join(yearDir, month);
        const days = await readdir(monthDir).catch(() => []);
        for (const day of days) {
          const dayDir = join(monthDir, day);
          const files = await readdir(dayDir).catch(() => []);
          for (const f of files) {
            if (f.endsWith(".jsonl")) {
              result.push(join(dayDir, f));
            }
          }
        }
      }
    }
  } catch {
    // Sessions directory doesn't exist — return empty list.
  }
  return result;
}

async function parseCodexFile(filePath: string): Promise<ParsedCodexSession | null> {
  let sessionId: string | null = null;
  let cwd: string | undefined;
  let startTime: string | undefined;
  let model: string | undefined;
  let version: string | undefined;
  let lastTimestamp: string | undefined;
  let userMsgs = 0;
  let assistantMsgs = 0;
  // Track the final token_count payload (last one = cumulative total).
  let totalTokenUsage: CodexTokenCountInfo = {
    input_tokens: 0,
    cached_input_tokens: 0,
    output_tokens: 0,
  };

  try {
    const rl = createInterface({
      input: createReadStream(filePath),
      crlfDelay: Infinity,
    });

    for await (const raw of rl) {
      if (!raw.trim()) continue;
      let entry: CodexEntry;
      try {
        entry = JSON.parse(raw) as CodexEntry;
      } catch {
        continue;
      }

      if (entry.timestamp) lastTimestamp = entry.timestamp;
      const payload = entry.payload ?? {};

      if (entry.type === "session_meta") {
        const meta = payload as unknown as CodexSessionMeta;
        sessionId = meta.id ?? null;
        cwd = meta.cwd;
        startTime = meta.timestamp;
        version = meta.cli_version;
      } else if (entry.type === "turn_context") {
        if (typeof payload["model"] === "string") model = payload["model"];
      } else if (entry.type === "event_msg") {
        const p = payload as Record<string, unknown>;
        if (p["type"] === "token_count") {
          const info = p["info"] as Record<string, unknown> | undefined;
          const total = info?.["total_token_usage"] as Record<string, unknown> | undefined;
          if (total) {
            totalTokenUsage = {
              input_tokens: (total["input_tokens"] as number | undefined) ?? 0,
              cached_input_tokens: (total["cached_input_tokens"] as number | undefined) ?? 0,
              output_tokens: (total["output_tokens"] as number | undefined) ?? 0,
            };
          }
        }
      } else if (entry.type === "response_item") {
        const p = payload as Record<string, unknown>;
        if (p["role"] === "user") userMsgs++;
        if (p["role"] === "assistant") assistantMsgs++;
      }
    }
  } catch {
    return null;
  }

  if (!sessionId) return null;

  let fileStat: { size: number; mtime: Date } | null = null;
  try {
    fileStat = await stat(filePath);
  } catch {
    return null;
  }

  return {
    sessionId,
    filePath,
    modifiedAt: fileStat.mtime.toISOString(),
    sizeBytes: fileStat.size,
    ...(cwd !== undefined ? { cwd } : {}),
    ...(startTime !== undefined ? { startTime } : {}),
    ...(lastTimestamp !== undefined ? { endTime: lastTimestamp } : {}),
    ...(model !== undefined ? { model } : {}),
    ...(version !== undefined ? { version } : {}),
    totalTokenUsage,
    userMessageCount: userMsgs,
    assistantMessageCount: assistantMsgs,
  };
}

function toSessionUsageSummary(parsed: ParsedCodexSession): SessionUsageSummary {
  const { totalTokenUsage } = parsed;

  const usage: ModelUsage = {
    inputTokens: totalTokenUsage.input_tokens,
    outputTokens: totalTokenUsage.output_tokens,
    cacheReadInputTokens: totalTokenUsage.cached_input_tokens,
    cacheCreationInputTokens: 0,
  };

  const estimatedCostUsd = parsed.model ? estimateCostFromUsage(parsed.model, usage) : 0;

  const durationMs =
    parsed.startTime && parsed.endTime
      ? new Date(parsed.endTime).getTime() - new Date(parsed.startTime).getTime()
      : undefined;

  return {
    sessionId: parsed.sessionId,
    model: parsed.model ?? null,
    usage,
    estimatedCostUsd,
    cacheEfficiency: EMPTY_CACHE_EFFICIENCY,
    toolCounts: {},
    flags: {
      hasCompaction: false,
      usesTaskAgent: false,
      usesMcp: false,
      usesWebSearch: false,
      usesWebFetch: false,
      hasThinking: false,
    },
    compactions: [],
    ...(parsed.startTime !== undefined ? { startTime: parsed.startTime } : {}),
    ...(parsed.endTime !== undefined ? { endTime: parsed.endTime } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    userMessageCount: parsed.userMessageCount,
    assistantMessageCount: parsed.assistantMessageCount,
    ...(parsed.version !== undefined ? { version: parsed.version } : {}),
    ...(parsed.cwd !== undefined ? { cwd: parsed.cwd } : {}),
  };
}

// ─── Harness adapter ──────────────────────────────────────────────────────────

/**
 * Harness adapter for OpenAI Codex CLI sessions.
 *
 * Auto-discovers session JSONL files under `{dataRoot}/sessions/`.
 * Returns empty lists rather than throwing when the data root doesn't exist.
 */
export class CodexHarnessAdapter implements HarnessAdapter {
  readonly descriptor: HarnessDescriptor;

  constructor(dataRoot?: string) {
    const root = dataRoot ?? resolveCodexDataRoot() ?? join(homedir(), ".codex");
    this.descriptor = {
      kind: "codex",
      displayName: "Codex CLI",
      dataRoot: root,
    };
  }

  async listProjectSummaries(_context?: AdapterContext): Promise<readonly ProjectSummary[]> {
    const sessions = await this._loadAll();
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
    filter?: SessionAnalyticsFilter,
    _context?: AdapterContext
  ): Promise<readonly SessionUsageSummary[]> {
    let sessions = await this._loadAll();

    if (filter?.projectId) {
      sessions = sessions.filter((s) => (s.cwd ?? "unknown") === filter.projectId);
    }
    if (filter?.range) {
      const { from, to } = filter.range;
      sessions = sessions.filter((s) => {
        const d = s.startTime?.slice(0, 10);
        return d ? d >= from && d <= to : false;
      });
    }

    return sessions;
  }

  async loadSessionUsage(
    sessionId: string,
    _context?: AdapterContext
  ): Promise<SessionUsageSummary | undefined> {
    const all = await this._loadAll();
    return all.find((s) => s.sessionId === sessionId);
  }

  // Replay not supported — Codex JSONL lacks enough turn-level detail to
  // reconstruct a canonical ReplayData. Return undefined rather than throw.
  async loadSessionReplay(
    _sessionId: string,
    _context?: AdapterContext
  ): Promise<ReplayData | undefined> {
    return undefined;
  }

  async loadActivityTimeseries(range?: DateRange, _context?: AdapterContext): Promise<Timeseries> {
    const sessions = await this._loadAll();
    return foldTimeseries(sessions, { ...(range ? { range } : {}) });
  }

  async loadCostBreakdown(range?: DateRange, _context?: AdapterContext): Promise<CostBreakdown> {
    const sessions = await this._loadAll();
    return foldCostBreakdown(sessions, { ...(range ? { range } : {}) });
  }

  async loadToolAnalytics(_context?: AdapterContext): Promise<ToolAnalytics> {
    const sessions = await this._loadAll();
    return foldToolAnalytics(sessions);
  }

  async health(_context?: AdapterContext): Promise<AdapterHealth> {
    const sessionsDir = join(this.descriptor.dataRoot, "sessions");
    try {
      await stat(sessionsDir);
      return { status: "healthy", checkedAt: new Date().toISOString() };
    } catch {
      return {
        status: "degraded",
        checkedAt: new Date().toISOString(),
        message: `Codex sessions directory not found: ${sessionsDir}`,
      };
    }
  }

  private async _loadAll(): Promise<readonly SessionUsageSummary[]> {
    const files = await listCodexFiles(this.descriptor.dataRoot);
    const parsed = await Promise.all(files.map(parseCodexFile));
    return parsed.filter((p): p is ParsedCodexSession => p !== null).map(toSessionUsageSummary);
  }
}
