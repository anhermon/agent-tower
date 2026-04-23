import {
  ClaudeCodeAnalyticsSource,
  computeSkillsEfficacy,
  computeSkillsUsage,
  resolveDataRoot,
  scoreSessionWaste,
} from "@control-plane/adapter-claude-code";
import type {
  DateRange,
  SessionAnalyticsFilter,
  SessionUsageSummary,
  WasteVerdict,
} from "@control-plane/core";

import { asRecord, errorResult, type ToolDefinition, type ToolResult } from "./types.js";

interface ParsedAuditInput {
  readonly limit: number | null;
  readonly since: string | null;
  readonly until: string | null;
}

const DEFAULT_LIMIT = 20;
const COLD_GIANT_SIZE_BYTES = 8000;
const COLD_GIANT_MAX_INVOCATIONS = 5;
const NEGATIVE_EFFICACY_DELTA = -0.05;
const NEGATIVE_EFFICACY_MIN_SESSIONS = 5;
const HIGH_WASTE_THRESHOLD = 0.4;

function parseInput(raw: unknown): ParsedAuditInput {
  const r = asRecord(raw);
  const limit = r.limit;
  const since = r.since;
  const until = r.until;
  return {
    limit: typeof limit === "number" && Number.isFinite(limit) ? limit : null,
    since: typeof since === "string" && since.length > 0 ? since : null,
    until: typeof until === "string" && until.length > 0 ? until : null,
  };
}

interface CostRow {
  readonly sessionId: string;
  readonly cwd: string;
  readonly costUsd: number;
  readonly turns: number;
  readonly model: string | null;
  readonly startTime: string | null;
}

function toCostRow(summary: SessionUsageSummary): CostRow {
  return {
    sessionId: summary.sessionId,
    cwd: summary.cwd ?? "unknown",
    costUsd: summary.estimatedCostUsd,
    turns: summary.userMessageCount + summary.assistantMessageCount,
    model: summary.model,
    startTime: summary.startTime ?? null,
  };
}

interface WasteVerdictWithContext extends WasteVerdict {
  readonly cwd: string;
  readonly costUsd: number;
}

export const controlPlaneAuditTool: ToolDefinition = {
  name: "control_plane_audit",
  description:
    "Read-only aggregate audit. Rolls up total cost, top sessions by cost + waste, average waste sub-scores, cold-giant skills (large manifest, few invocations), negative-efficacy skills, and per-project cost/waste.",
  inputSchema: {
    type: "object",
    properties: {
      limit: {
        type: "number",
        minimum: 1,
        description: `Size of the top-N lists (topByCost / topByWaste). Defaults to ${DEFAULT_LIMIT}.`,
      },
      since: {
        type: "string",
        description: "Inclusive lower bound for the session start date. Format YYYY-MM-DD.",
      },
      until: {
        type: "string",
        description: "Inclusive upper bound for the session start date. Format YYYY-MM-DD.",
      },
    },
    additionalProperties: false,
  },
  handler: async (raw): Promise<ToolResult> => {
    try {
      return await runAuditHandler(raw);
    } catch (error) {
      return errorResult(error);
    }
  },
};

async function runAuditHandler(raw: unknown): Promise<ToolResult> {
  const input = parseInput(raw);
  const resolved = resolveDataRoot();
  if (!resolved) {
    return { ok: false, reason: "unconfigured" };
  }
  const limit = Math.max(1, Math.floor(input.limit ?? DEFAULT_LIMIT));
  const range = buildDateRange(input.since, input.until);
  const filter: SessionAnalyticsFilter = range ? { range } : {};

  const source = new ClaudeCodeAnalyticsSource({ directory: resolved.directory });
  const summaries = await source.listSessionSummaries(filter);

  const costRows = summaries.map(toCostRow);
  const totalEstimatedCostUsd = summaries.reduce((acc, s) => acc + s.estimatedCostUsd, 0);
  const topByCost = [...costRows].sort((a, b) => b.costUsd - a.costUsd).slice(0, limit);

  const costBySessionId = new Map<string, CostRow>();
  for (const row of costRows) costBySessionId.set(row.sessionId, row);

  const verdicts = buildVerdicts(summaries, costBySessionId);
  const topByWaste = [...verdicts].sort((a, b) => b.overall - a.overall).slice(0, limit);
  const wasteAggregates = buildWasteAggregates(summaries, verdicts);
  const topProjects = buildTopProjects(summaries, verdicts, limit);

  const [usage, efficacy] = await Promise.all([computeSkillsUsage(), computeSkillsEfficacy()]);
  const skillsColdGiants = buildColdGiants(usage);
  const skillsNegativeEfficacy = buildNegativeEfficacy(efficacy);

  return {
    ok: true,
    dataRoot: resolved.directory,
    sessionsScanned: summaries.length,
    totalEstimatedCostUsd,
    topByCost,
    topByWaste,
    wasteAggregates,
    skillsColdGiants,
    skillsNegativeEfficacy,
    topProjects,
  };
}

function buildDateRange(since: string | null, until: string | null): DateRange | null {
  if (since && until) return { from: since, to: until };
  if (since) return { from: since, to: since };
  if (until) return { from: until, to: until };
  return null;
}

function buildVerdicts(
  summaries: readonly SessionUsageSummary[],
  costBySessionId: ReadonlyMap<string, CostRow>
): readonly WasteVerdictWithContext[] {
  return summaries
    .filter((s) => s.waste !== undefined)
    .map((summary) => {
      const verdict = scoreSessionWaste(summary);
      const ctx = costBySessionId.get(summary.sessionId);
      return {
        ...verdict,
        cwd: ctx?.cwd ?? summary.cwd ?? "unknown",
        costUsd: ctx?.costUsd ?? summary.estimatedCostUsd,
      };
    });
}

function buildWasteAggregates(
  summaries: readonly SessionUsageSummary[],
  verdicts: readonly WasteVerdictWithContext[]
): Record<string, number> {
  const count = verdicts.length;
  const avg = (pick: (v: WasteVerdictWithContext) => number): number =>
    count === 0 ? 0 : verdicts.reduce((acc, v) => acc + pick(v), 0) / count;
  return {
    avgOverall: avg((v) => v.overall),
    avgCacheThrash: avg((v) => v.scores.cacheThrash),
    avgSequentialTools: avg((v) => v.scores.sequentialTools),
    avgToolPollution: avg((v) => v.scores.toolPollution),
    avgContextBloat: avg((v) => v.scores.contextBloat),
    bloatWithoutCompactionCount: summaries.reduce(
      (acc, s) => acc + (s.waste?.bloatWithoutCompaction ? 1 : 0),
      0
    ),
    highWasteSessionCount: verdicts.reduce(
      (acc, v) => acc + (v.overall > HIGH_WASTE_THRESHOLD ? 1 : 0),
      0
    ),
    sessionsWithWasteSignals: count,
  };
}

interface ProjectAcc {
  projectId: string;
  sessions: number;
  totalCostUsd: number;
  wasteSum: number;
  wasteCount: number;
}

function buildTopProjects(
  summaries: readonly SessionUsageSummary[],
  verdicts: readonly WasteVerdictWithContext[],
  limit: number
): unknown[] {
  const verdictBySession = new Map<string, WasteVerdictWithContext>();
  for (const v of verdicts) verdictBySession.set(v.sessionId, v);

  const projectAcc = new Map<string, ProjectAcc>();
  for (const s of summaries) {
    const projectId = s.cwd ?? "unknown";
    let entry = projectAcc.get(projectId);
    if (!entry) {
      entry = { projectId, sessions: 0, totalCostUsd: 0, wasteSum: 0, wasteCount: 0 };
      projectAcc.set(projectId, entry);
    }
    entry.sessions += 1;
    entry.totalCostUsd += s.estimatedCostUsd;
    const v = verdictBySession.get(s.sessionId);
    if (v) {
      entry.wasteSum += v.overall;
      entry.wasteCount += 1;
    }
  }
  return [...projectAcc.values()]
    .map((p) => ({
      projectId: p.projectId,
      sessions: p.sessions,
      totalCostUsd: p.totalCostUsd,
      avgWasteScore: p.wasteCount === 0 ? 0 : p.wasteSum / p.wasteCount,
    }))
    .sort((a, b) => b.totalCostUsd - a.totalCostUsd)
    .slice(0, limit);
}

function buildColdGiants(usage: Awaited<ReturnType<typeof computeSkillsUsage>>): unknown[] {
  if (!usage.ok) return [];
  return usage.report.perSkill
    .filter(
      (row) =>
        row.sizeBytes > COLD_GIANT_SIZE_BYTES && row.invocationCount < COLD_GIANT_MAX_INVOCATIONS
    )
    .map((row) => ({
      name: row.displayName,
      sizeBytes: row.sizeBytes,
      invocationCount: row.invocationCount,
    }));
}

function buildNegativeEfficacy(
  efficacy: Awaited<ReturnType<typeof computeSkillsEfficacy>>
): unknown[] {
  if (!efficacy.ok) return [];
  return efficacy.report.qualifying
    .filter(
      (row) =>
        row.delta < NEGATIVE_EFFICACY_DELTA && row.sessionsCount >= NEGATIVE_EFFICACY_MIN_SESSIONS
    )
    .sort((a, b) => a.delta - b.delta)
    .map((row) => ({ name: row.displayName, delta: row.delta, sessions: row.sessionsCount }));
}
