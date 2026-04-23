import { readFile } from "node:fs/promises";
import { listSessionFiles, type ClaudeSessionFile } from "@control-plane/adapter-claude-code";
import { resolveDataRoot } from "./sessions-source";
import { listSkillsOrEmpty, type SkillManifest } from "./skills-source";

/**
 * Server-only data layer for Skill EFFICACY analysis. Orthogonal to
 * `skills-usage-source.ts`: that module counts Skill-tool invocations, this
 * one classifies each **session** by outcome + satisfaction heuristics and
 * correlates the resulting effective-score per skill against an all-sessions
 * baseline. Modeled after OpenCode's efficacy report but deterministic — no
 * SQLite, no LLM, no external services.
 *
 * Read-only: nothing on disk is mutated and no network is touched. If no data
 * root is configured the result is `{ok: false, reason: "unconfigured"}` so
 * callers can render configuration guidance in an empty state.
 */

export type SessionOutcome = "completed" | "partial" | "abandoned" | "unknown";

export interface SessionSummary {
  readonly sessionId: string;
  readonly filePath: string;
  readonly firstAt: string | null;
  readonly lastAt: string | null;
  readonly durationSeconds: number | null;
  readonly turnCount: number;
  readonly toolUseCount: number;
  readonly toolErrorCount: number;
  readonly userInterruptCount: number;
  readonly correctionSignalCount: number;
  readonly positiveSignalCount: number;
  readonly endedWithOrphanToolUse: boolean;
  readonly outcome: SessionOutcome;
  readonly outcomeMultiplier: number;
  readonly satisfactionScore: number;
  readonly effectiveScore: number;
  readonly skillIds: readonly string[];
}

export interface SkillEfficacyRow {
  readonly skillId: string;
  readonly displayName: string;
  readonly known: boolean;
  readonly sessionsCount: number;
  readonly invocationsCount: number;
  readonly avgSatisfaction: number;
  readonly avgOutcomeMultiplier: number;
  readonly avgEffectiveScore: number;
  readonly delta: number;
  readonly outcomeBreakdown: {
    readonly completed: number;
    readonly partial: number;
    readonly abandoned: number;
    readonly unknown: number;
  };
  readonly qualifying: boolean;
}

export interface EfficacyBaseline {
  readonly satisfaction: number;
  readonly outcomeMultiplier: number;
  readonly effectiveScore: number;
  readonly sessionsScored: number;
}

export interface SkillsEfficacyReport {
  readonly baseline: EfficacyBaseline;
  readonly sessionsAnalyzed: number;
  readonly sessionsWithSkill: number;
  readonly skillsProfiled: number;
  readonly qualifying: readonly SkillEfficacyRow[];
  readonly insufficientData: readonly SkillEfficacyRow[];
  readonly outcomeDistribution: {
    readonly completed: number;
    readonly partial: number;
    readonly abandoned: number;
    readonly unknown: number;
  };
  readonly minSessionsForQualifying: number;
}

export type ListSkillsEfficacyResult =
  | { readonly ok: true; readonly report: SkillsEfficacyReport }
  | { readonly ok: false; readonly reason: "unconfigured" | "error"; readonly message?: string };

const DEFAULT_MIN_SESSIONS = 3;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

interface EnrichedSummary {
  readonly summary: SessionSummary;
  readonly invocationsBySkillKey: ReadonlyMap<string, number>;
}

interface CacheEntry {
  readonly key: string;
  readonly enriched: readonly EnrichedSummary[];
}

let summaryCache: CacheEntry | null = null;

export async function computeSkillsEfficacy(options?: {
  readonly skills?: readonly SkillManifest[];
  readonly minSessionsForQualifying?: number;
}): Promise<ListSkillsEfficacyResult> {
  const resolved = resolveDataRoot();
  if (!resolved) {
    return { ok: false, reason: "unconfigured" };
  }

  try {
    const files = await listSessionFiles({ directory: resolved.directory });
    const enriched = await summarizeWithCache(files);

    let skills: readonly SkillManifest[];
    if (options?.skills) {
      skills = options.skills;
    } else {
      const list = await listSkillsOrEmpty();
      skills = list.ok ? list.skills : [];
    }

    const minSessions = Math.max(1, options?.minSessionsForQualifying ?? DEFAULT_MIN_SESSIONS);
    const report = buildReport(enriched, skills, minSessions);
    return { ok: true, report };
  } catch (error) {
    return { ok: false, reason: "error", message: errorMessage(error) };
  }
}

async function summarizeWithCache(
  files: readonly ClaudeSessionFile[]
): Promise<readonly EnrichedSummary[]> {
  const sortedKeyParts = files.map((file) => `${file.filePath}:${file.modifiedAt}`).sort();
  const cacheKey = sortedKeyParts.join("|");

  if (summaryCache && summaryCache.key === cacheKey) {
    return summaryCache.enriched;
  }

  const enriched: EnrichedSummary[] = [];
  for (const file of files) {
    const one = await summarizeFile(file);
    if (one) enriched.push(one);
  }

  summaryCache = { key: cacheKey, enriched };
  return enriched;
}

interface RawEntry {
  readonly lineIndex: number;
  readonly type: string;
  readonly timestamp: string | null;
  readonly sessionId: string | null;
  readonly raw: Record<string, unknown>;
}

async function summarizeFile(file: ClaudeSessionFile): Promise<EnrichedSummary | null> {
  let raw: string;
  try {
    raw = await readFile(file.filePath, "utf8");
  } catch {
    return null;
  }

  const entries: RawEntry[] = [];
  const lines = raw.split("\n");
  let explicitSessionId: string | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i]!.trim();
    if (trimmed.length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    const entry = parsed as Record<string, unknown>;
    const type = typeof entry.type === "string" ? entry.type : null;
    if (!type) continue;
    const timestamp = typeof entry.timestamp === "string" ? entry.timestamp : null;
    const sessionId = typeof entry.sessionId === "string" ? entry.sessionId : null;
    if (!explicitSessionId && sessionId) explicitSessionId = sessionId;
    entries.push({ lineIndex: i, type, timestamp, sessionId, raw: entry });
  }

  const sessionId = explicitSessionId ?? file.sessionId;

  // First pass: aggregate counts + collect tool_use ids per session file.
  let toolUseCount = 0;
  let toolErrorCount = 0;
  let userInterruptCount = 0;
  let correctionSignalCount = 0;
  let positiveSignalCount = 0;
  let turnCount = 0;
  let firstAt: string | null = null;
  let lastAt: string | null = null;
  const toolUseIds = new Set<string>();
  const toolResultIds = new Set<string>();
  const skillIdsOrdered: string[] = [];
  const skillIdSet = new Set<string>();
  const invocationsBySkillKey = new Map<string, number>();
  let lastUserMessageText: string | null = null;
  let lastUserHasCorrection = false;
  let lastAssistantIndex = -1;
  let lastEntryIndex = -1;
  const userEntryIndices: number[] = [];

  for (let idx = 0; idx < entries.length; idx += 1) {
    const entry = entries[idx]!;
    lastEntryIndex = idx;
    if (entry.timestamp) {
      if (!firstAt || entry.timestamp < firstAt) firstAt = entry.timestamp;
      if (!lastAt || entry.timestamp > lastAt) lastAt = entry.timestamp;
    }
    if (entry.type === "user" || entry.type === "assistant") {
      turnCount += 1;
    }
    if (entry.type === "user") {
      userEntryIndices.push(idx);
      const text = extractUserText(entry.raw);
      lastUserMessageText = text;
      if (text !== null) {
        const isInterrupt = isInterruptMessage(text);
        if (isInterrupt) {
          userInterruptCount += 1;
          lastUserHasCorrection = false;
        } else {
          const hasCorrection = matchesCorrection(text);
          const hasPositive = matchesPositive(text);
          if (hasCorrection) correctionSignalCount += 1;
          if (hasPositive) positiveSignalCount += 1;
          lastUserHasCorrection = hasCorrection;
        }
      } else {
        lastUserHasCorrection = false;
      }
    } else if (entry.type === "assistant") {
      lastAssistantIndex = idx;
      const blocks = getAssistantContentBlocks(entry.raw);
      for (const block of blocks) {
        if (!block || typeof block !== "object") continue;
        const b = block as Record<string, unknown>;
        if (b.type === "tool_use") {
          toolUseCount += 1;
          const id = typeof b.id === "string" ? b.id : null;
          if (id) toolUseIds.add(id);
          if (b.name === "Skill") {
            const input = b.input;
            if (input && typeof input === "object") {
              const skill = (input as Record<string, unknown>).skill;
              if (typeof skill === "string") {
                const s = skill.trim();
                if (s.length > 0) {
                  if (!skillIdSet.has(s)) {
                    skillIdSet.add(s);
                    skillIdsOrdered.push(s);
                  }
                  invocationsBySkillKey.set(s, (invocationsBySkillKey.get(s) ?? 0) + 1);
                }
              }
            }
          }
        }
      }
    } else if (entry.type === "tool_result") {
      // Standalone tool_result entry.
      const { id, isError } = extractToolResult(entry.raw);
      if (id) toolResultIds.add(id);
      if (isError) toolErrorCount += 1;
    }

    // Tool results may also appear nested inside user entries as content blocks.
    if (entry.type === "user") {
      const blocks = getUserContentBlocks(entry.raw);
      for (const block of blocks) {
        if (!block || typeof block !== "object") continue;
        const b = block as Record<string, unknown>;
        if (b.type === "tool_result") {
          const id = typeof b.tool_use_id === "string" ? b.tool_use_id : null;
          if (id) toolResultIds.add(id);
          if (isToolResultError(b)) toolErrorCount += 1;
        }
      }
    }
  }

  // Orphan tool_use detection: last assistant entry contains a tool_use whose
  // id has no matching tool_result anywhere later in the file.
  let endedWithOrphanToolUse = false;
  if (lastAssistantIndex >= 0) {
    const blocks = getAssistantContentBlocks(entries[lastAssistantIndex]!.raw);
    // Collect tool_result ids that appear AFTER lastAssistantIndex.
    const laterToolResultIds = new Set<string>();
    for (let i = lastAssistantIndex + 1; i < entries.length; i += 1) {
      const e = entries[i]!;
      if (e.type === "tool_result") {
        const { id } = extractToolResult(e.raw);
        if (id) laterToolResultIds.add(id);
      } else if (e.type === "user") {
        const userBlocks = getUserContentBlocks(e.raw);
        for (const block of userBlocks) {
          if (!block || typeof block !== "object") continue;
          const b = block as Record<string, unknown>;
          if (b.type === "tool_result") {
            const id = typeof b.tool_use_id === "string" ? b.tool_use_id : null;
            if (id) laterToolResultIds.add(id);
          }
        }
      }
    }
    for (const block of blocks) {
      if (!block || typeof block !== "object") continue;
      const b = block as Record<string, unknown>;
      if (b.type === "tool_use") {
        const id = typeof b.id === "string" ? b.id : null;
        if (!id || !laterToolResultIds.has(id)) {
          endedWithOrphanToolUse = true;
          break;
        }
      }
    }
  }

  // Abandoned check: interrupt in last 20% of entries.
  const totalEntries = entries.length;
  const lastTwentyPercentStart = Math.floor(totalEntries * 0.8);
  let interruptInTail = 0;
  for (const idx of userEntryIndices) {
    if (idx >= lastTwentyPercentStart) {
      const text = extractUserText(entries[idx]!.raw);
      if (text !== null && isInterruptMessage(text)) interruptInTail += 1;
    }
  }

  const firstMs = firstAt ? Date.parse(firstAt) : NaN;
  const lastMs = lastAt ? Date.parse(lastAt) : NaN;
  const durationSeconds =
    Number.isFinite(firstMs) && Number.isFinite(lastMs) && lastMs >= firstMs
      ? Math.round((lastMs - firstMs) / 1000)
      : null;

  const nowMs = Date.now();
  const lastEntryAgeMs = Number.isFinite(lastMs) ? nowMs - lastMs : 0;

  // Last user message after last assistant? A correction signal as the final
  // user message with no assistant follow-up is a "partial" signal.
  const lastUserIndex = userEntryIndices.length > 0 ? userEntryIndices[userEntryIndices.length - 1]! : -1;
  const lastUserIsCorrectionWithNoReply =
    lastUserIndex >= 0 && lastUserIndex > lastAssistantIndex && lastUserHasCorrection;

  // Last assistant ended with pure text (no orphan tool_use)?
  let lastIsAssistantText = false;
  if (lastEntryIndex >= 0 && entries[lastEntryIndex]!.type === "assistant" && !endedWithOrphanToolUse) {
    const blocks = getAssistantContentBlocks(entries[lastEntryIndex]!.raw);
    lastIsAssistantText = blocks.some(
      (block) => block && typeof block === "object" && (block as Record<string, unknown>).type === "text"
    );
  }

  const toolErrorRate = toolErrorCount / Math.max(1, toolUseCount);

  // Outcome classification — first match wins.
  let outcome: SessionOutcome;
  if (
    turnCount < 3 ||
    interruptInTail >= 1 ||
    (lastEntryAgeMs > SIX_HOURS_MS && endedWithOrphanToolUse)
  ) {
    outcome = "abandoned";
  } else if (
    endedWithOrphanToolUse ||
    toolErrorRate > 0.25 ||
    lastUserIsCorrectionWithNoReply
  ) {
    outcome = "partial";
  } else if (lastIsAssistantText && toolErrorRate <= 0.1) {
    outcome = "completed";
  } else {
    outcome = "unknown";
  }

  const outcomeMultiplier = multiplierFor(outcome);

  // Satisfaction score.
  let score = 0.6;
  score += Math.min(0.2, 0.05 * positiveSignalCount);
  score -= Math.min(0.3, 0.1 * correctionSignalCount);
  score -= Math.min(0.3, 0.15 * userInterruptCount);
  score -= 0.2 * toolErrorRate;

  if (lastIsAssistantText) {
    // Check last 3 user messages for correction signals.
    const recentUserIndices = userEntryIndices.slice(-3);
    let anyCorrection = false;
    for (const idx of recentUserIndices) {
      const text = extractUserText(entries[idx]!.raw);
      if (text !== null && matchesCorrection(text)) {
        anyCorrection = true;
        break;
      }
    }
    if (!anyCorrection) score += 0.05;
  }

  const satisfactionScore = Math.max(0, Math.min(1, score));
  const effectiveScore = satisfactionScore * outcomeMultiplier;

  // Suppress unused-variable warning for lastUserMessageText — it's captured
  // during the loop above purely for readability / future extension.
  void lastUserMessageText;
  void toolUseIds;
  void toolResultIds;

  const summary: SessionSummary = {
    sessionId,
    filePath: file.filePath,
    firstAt,
    lastAt,
    durationSeconds,
    turnCount,
    toolUseCount,
    toolErrorCount,
    userInterruptCount,
    correctionSignalCount,
    positiveSignalCount,
    endedWithOrphanToolUse,
    outcome,
    outcomeMultiplier,
    satisfactionScore,
    effectiveScore,
    skillIds: skillIdsOrdered
  };
  return { summary, invocationsBySkillKey };
}

function multiplierFor(outcome: SessionOutcome): number {
  switch (outcome) {
    case "completed":
      return 1.0;
    case "partial":
      return 0.7;
    case "abandoned":
      return 0.3;
    default:
      return 0.6;
  }
}

function getAssistantContentBlocks(entry: Record<string, unknown>): readonly unknown[] {
  const message = entry.message;
  if (!message || typeof message !== "object") return [];
  const content = (message as Record<string, unknown>).content;
  if (!Array.isArray(content)) return [];
  return content;
}

function getUserContentBlocks(entry: Record<string, unknown>): readonly unknown[] {
  const message = entry.message;
  if (!message || typeof message !== "object") return [];
  const content = (message as Record<string, unknown>).content;
  if (!Array.isArray(content)) return [];
  return content;
}

function extractUserText(entry: Record<string, unknown>): string | null {
  const message = entry.message;
  if (!message || typeof message !== "object") return null;
  const content = (message as Record<string, unknown>).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  // Collect text blocks; the last text block is the "last text block" for
  // correction-signal matching, but we return the full concatenation for
  // broader regex matching.
  const parts: string[] = [];
  let lastTextBlock: string | null = null;
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    if (b.type === "text" && typeof b.text === "string") {
      parts.push(b.text);
      lastTextBlock = b.text;
    } else if (b.type === "tool_result") {
      // tool_result content is not user prose — skip for signal matching.
      continue;
    }
  }
  if (parts.length === 0) return null;
  // We return the last text block specifically so correction-signal regexes
  // can anchor on the actual user message (per spec: "whose last text block
  // matches…"). Interrupt + positive signals check substring anywhere which
  // also holds on a single-block string.
  return lastTextBlock ?? parts.join("\n");
}

function extractToolResult(entry: Record<string, unknown>): { id: string | null; isError: boolean } {
  const message = entry.message;
  let source: Record<string, unknown> = entry;
  if (message && typeof message === "object") {
    source = message as Record<string, unknown>;
  }
  const id = typeof source.tool_use_id === "string" ? source.tool_use_id : null;
  const isError = isToolResultError(source);
  return { id, isError };
}

function isToolResultError(source: Record<string, unknown>): boolean {
  if (source.is_error === true) return true;
  const content = source.content;
  if (typeof content === "string") {
    if (content.startsWith("Error")) return true;
    if (content.includes('"error":true')) return true;
  } else if (Array.isArray(content)) {
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const b = block as Record<string, unknown>;
      if (b.is_error === true) return true;
      if (typeof b.text === "string") {
        if (b.text.startsWith("Error")) return true;
        if (b.text.includes('"error":true')) return true;
      }
    }
  }
  return false;
}

const INTERRUPT_PATTERNS = [
  /\[Request interrupted/i,
  /\[user interrupted/i
];

function isInterruptMessage(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.toLowerCase() === "cancel") return true;
  for (const pattern of INTERRUPT_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }
  return false;
}

// Correction regex — word must appear at the start of the string or after a
// punctuation boundary. Case-insensitive.
const CORRECTION_REGEX = /(?:^|[.!?;:,]\s*)(no|don['’]?t|stop|wrong|actually|instead)\b/i;

function matchesCorrection(text: string): boolean {
  return CORRECTION_REGEX.test(text.trim());
}

const POSITIVE_REGEX = /\b(thanks|thank you|perfect|great|awesome|nice work|nicely done|lgtm)\b/i;

function matchesPositive(text: string): boolean {
  return POSITIVE_REGEX.test(text);
}

interface Accumulator {
  skillId: string;
  displayName: string;
  known: boolean;
  sessionsCount: number;
  invocationsCount: number;
  satisfactionSum: number;
  outcomeMultiplierSum: number;
  effectiveScoreSum: number;
  outcomeBreakdown: { completed: number; partial: number; abandoned: number; unknown: number };
}

function buildReport(
  enriched: readonly EnrichedSummary[],
  skills: readonly SkillManifest[],
  minSessions: number
): SkillsEfficacyReport {
  // Baseline across ALL sessions (per spec).
  const sessionsAnalyzed = enriched.length;
  let baselineSatSum = 0;
  let baselineMulSum = 0;
  let baselineEffSum = 0;
  const outcomeDistribution = { completed: 0, partial: 0, abandoned: 0, unknown: 0 };

  for (const { summary: s } of enriched) {
    baselineSatSum += s.satisfactionScore;
    baselineMulSum += s.outcomeMultiplier;
    baselineEffSum += s.effectiveScore;
    outcomeDistribution[s.outcome] += 1;
  }

  const baseline: EfficacyBaseline =
    sessionsAnalyzed === 0
      ? { satisfaction: 0, outcomeMultiplier: 0, effectiveScore: 0, sessionsScored: 0 }
      : {
          satisfaction: baselineSatSum / sessionsAnalyzed,
          outcomeMultiplier: baselineMulSum / sessionsAnalyzed,
          effectiveScore: baselineEffSum / sessionsAnalyzed,
          sessionsScored: sessionsAnalyzed
        };

  // Manifest lookup for known/displayName joining.
  const byId = new Map<string, SkillManifest>();
  const byName = new Map<string, SkillManifest>();
  for (const m of skills) {
    byId.set(m.id, m);
    if (typeof m.name === "string" && m.name.length > 0 && !byName.has(m.name)) {
      byName.set(m.name, m);
    }
  }

  // Aggregate per skill.
  const acc = new Map<string, Accumulator>();
  let sessionsWithSkill = 0;

  for (const { summary: session, invocationsBySkillKey } of enriched) {
    if (session.skillIds.length === 0) continue;
    sessionsWithSkill += 1;

    for (const rawSkillKey of session.skillIds) {
      const manifest = byId.get(rawSkillKey) ?? byName.get(rawSkillKey) ?? null;
      const bucketKey = manifest ? manifest.id : rawSkillKey;
      let bucket = acc.get(bucketKey);
      if (!bucket) {
        bucket = {
          skillId: manifest ? manifest.id : rawSkillKey,
          displayName: manifest ? manifest.name : rawSkillKey,
          known: manifest !== null,
          sessionsCount: 0,
          invocationsCount: 0,
          satisfactionSum: 0,
          outcomeMultiplierSum: 0,
          effectiveScoreSum: 0,
          outcomeBreakdown: { completed: 0, partial: 0, abandoned: 0, unknown: 0 }
        };
        acc.set(bucketKey, bucket);
      }
      bucket.sessionsCount += 1;
      bucket.satisfactionSum += session.satisfactionScore;
      bucket.outcomeMultiplierSum += session.outcomeMultiplier;
      bucket.effectiveScoreSum += session.effectiveScore;
      bucket.outcomeBreakdown[session.outcome] += 1;
      bucket.invocationsCount += invocationsBySkillKey.get(rawSkillKey) ?? 1;
    }
  }

  const rows: SkillEfficacyRow[] = [];
  for (const bucket of acc.values()) {
    const avgSatisfaction = bucket.satisfactionSum / bucket.sessionsCount;
    const avgOutcomeMultiplier = bucket.outcomeMultiplierSum / bucket.sessionsCount;
    const avgEffectiveScore = bucket.effectiveScoreSum / bucket.sessionsCount;
    const qualifying = bucket.sessionsCount >= minSessions;
    rows.push({
      skillId: bucket.skillId,
      displayName: bucket.displayName,
      known: bucket.known,
      sessionsCount: bucket.sessionsCount,
      invocationsCount: bucket.invocationsCount,
      avgSatisfaction,
      avgOutcomeMultiplier,
      avgEffectiveScore,
      delta: avgEffectiveScore - baseline.effectiveScore,
      outcomeBreakdown: {
        completed: bucket.outcomeBreakdown.completed,
        partial: bucket.outcomeBreakdown.partial,
        abandoned: bucket.outcomeBreakdown.abandoned,
        unknown: bucket.outcomeBreakdown.unknown
      },
      qualifying
    });
  }

  const qualifying = rows
    .filter((r) => r.qualifying)
    .sort((a, b) => b.delta - a.delta || b.sessionsCount - a.sessionsCount);
  const insufficientData = rows
    .filter((r) => !r.qualifying)
    .sort(
      (a, b) =>
        b.sessionsCount - a.sessionsCount ||
        a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" })
    );

  return {
    baseline,
    sessionsAnalyzed,
    sessionsWithSkill,
    skillsProfiled: qualifying.length + insufficientData.length,
    qualifying,
    insufficientData,
    outcomeDistribution,
    minSessionsForQualifying: minSessions
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Test-only hook: clears the in-process session-summary cache. */
export function __clearSkillsEfficacyCacheForTests(): void {
  summaryCache = null;
}
