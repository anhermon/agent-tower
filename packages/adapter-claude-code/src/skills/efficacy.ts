import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

import type { DateRange } from "@control-plane/core";

import { resolveDataRoot } from "../data-root.js";
import { type ClaudeSessionFile, listSessionFiles } from "../reader.js";

import { listSkillsOrEmpty, type SkillManifest } from "./manifests.js";

/**
 * Skill EFFICACY analysis. Orthogonal to {@link computeSkillsUsage}: that
 * counts Skill-tool invocations, this classifies each session by outcome +
 * satisfaction heuristics and correlates the resulting effective-score per
 * skill against an all-sessions baseline. Deterministic — no SQLite, no LLM,
 * no external services.
 *
 * Read-only: nothing on disk is mutated and no network is touched.
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

interface FileCacheEntry {
  readonly mtime: string;
  readonly enriched: EnrichedSummary | null;
}

// Per-file memoization keyed on `(filePath, modifiedAt)`. An incremental scan
// (e.g., one new session transcript since last request) re-summarizes only the
// changed file instead of all N.
const fileCache = new Map<string, FileCacheEntry>();

export async function computeSkillsEfficacy(options?: {
  readonly skills?: readonly SkillManifest[];
  readonly minSessionsForQualifying?: number;
  readonly range?: DateRange;
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
    // Filter sessions by range AFTER the summary cache so the cache is
    // reused across range changes. Sessions with `firstAt === null` are
    // excluded when a range is provided.
    const scoped = options?.range ? filterEnrichedByRange(enriched, options.range) : enriched;
    const report = buildReport(scoped, skills, minSessions);
    return { ok: true, report };
  } catch (error) {
    return { ok: false, reason: "error", message: errorMessage(error) };
  }
}

function filterEnrichedByRange(
  enriched: readonly EnrichedSummary[],
  range: DateRange
): readonly EnrichedSummary[] {
  return enriched.filter(({ summary }) => {
    if (!summary.firstAt) return false;
    const day = summary.firstAt.slice(0, 10);
    return day >= range.from && day <= range.to;
  });
}

async function summarizeWithCache(
  files: readonly ClaudeSessionFile[]
): Promise<readonly EnrichedSummary[]> {
  const enriched: EnrichedSummary[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    seen.add(file.filePath);
    const cached = fileCache.get(file.filePath);
    let entry: FileCacheEntry;
    if (cached?.mtime === file.modifiedAt) {
      entry = cached;
    } else {
      const fresh = await summarizeFile(file);
      entry = { mtime: file.modifiedAt, enriched: fresh };
      fileCache.set(file.filePath, entry);
    }
    if (entry.enriched) enriched.push(entry.enriched);
  }
  for (const key of fileCache.keys()) {
    if (!seen.has(key)) fileCache.delete(key);
  }
  return enriched;
}

interface RawEntry {
  readonly lineIndex: number;
  readonly type: string;
  readonly timestamp: string | null;
  readonly sessionId: string | null;
  readonly raw: Record<string, unknown>;
}

interface ParsedTranscript {
  readonly entries: readonly RawEntry[];
  readonly explicitSessionId: string | null;
}

/**
 * Stream-parse a Claude Code JSONL transcript into `RawEntry[]`. The line-
 * by-line read keeps peak heap O(longest line) and avoids Next.js 15's
 * React Flight debug tracing capturing a multi-MB transcript into the RSC
 * payload (see `readInvocationsFromFile` in usage.ts for full rationale).
 */
async function parseTranscriptFile(filePath: string): Promise<ParsedTranscript | null> {
  let stream: ReturnType<typeof createReadStream>;
  try {
    stream = createReadStream(filePath, { encoding: "utf8" });
  } catch {
    return null;
  }
  const entries: RawEntry[] = [];
  let explicitSessionId: string | null = null;
  let lineIndex = -1;
  try {
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of rl) {
      lineIndex += 1;
      const entry = parseEntry(line, lineIndex);
      if (!entry) continue;
      if (!explicitSessionId && entry.sessionId) explicitSessionId = entry.sessionId;
      entries.push(entry);
    }
  } catch {
    if (entries.length === 0) return null;
  }
  return { entries, explicitSessionId };
}

function parseEntry(line: string, lineIndex: number): RawEntry | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const entry = parsed as Record<string, unknown>;
  const type = typeof entry.type === "string" ? entry.type : null;
  if (!type) return null;
  const timestamp = typeof entry.timestamp === "string" ? entry.timestamp : null;
  const sessionId = typeof entry.sessionId === "string" ? entry.sessionId : null;
  return { lineIndex, type, timestamp, sessionId, raw: entry };
}

/**
 * Mutable counters updated during the per-entry scan. Isolated so the outer
 * scan loop reads as straight-line "for each entry, apply handler".
 */
interface ScanState {
  toolUseCount: number;
  toolErrorCount: number;
  userInterruptCount: number;
  correctionSignalCount: number;
  positiveSignalCount: number;
  turnCount: number;
  firstAt: string | null;
  lastAt: string | null;
  readonly toolUseIds: Set<string>;
  readonly toolResultIds: Set<string>;
  readonly skillIdsOrdered: string[];
  readonly skillIdSet: Set<string>;
  readonly invocationsBySkillKey: Map<string, number>;
  lastUserHasCorrection: boolean;
  lastAssistantIndex: number;
  lastEntryIndex: number;
  readonly userEntryIndices: number[];
}

function initialState(): ScanState {
  return {
    toolUseCount: 0,
    toolErrorCount: 0,
    userInterruptCount: 0,
    correctionSignalCount: 0,
    positiveSignalCount: 0,
    turnCount: 0,
    firstAt: null,
    lastAt: null,
    toolUseIds: new Set<string>(),
    toolResultIds: new Set<string>(),
    skillIdsOrdered: [],
    skillIdSet: new Set<string>(),
    invocationsBySkillKey: new Map<string, number>(),
    lastUserHasCorrection: false,
    lastAssistantIndex: -1,
    lastEntryIndex: -1,
    userEntryIndices: [],
  };
}

function updateTimestampSpan(state: ScanState, ts: string | null): void {
  if (!ts) return;
  if (!state.firstAt || ts < state.firstAt) state.firstAt = ts;
  if (!state.lastAt || ts > state.lastAt) state.lastAt = ts;
}

function classifyUserText(state: ScanState, text: string | null): void {
  if (text === null) {
    state.lastUserHasCorrection = false;
    return;
  }
  if (isInterruptMessage(text)) {
    state.userInterruptCount += 1;
    state.lastUserHasCorrection = false;
    return;
  }
  const hasCorrection = matchesCorrection(text);
  const hasPositive = matchesPositive(text);
  if (hasCorrection) state.correctionSignalCount += 1;
  if (hasPositive) state.positiveSignalCount += 1;
  state.lastUserHasCorrection = hasCorrection;
}

function recordSkillInvocation(state: ScanState, block: Record<string, unknown>): void {
  const input = block.input;
  if (!input || typeof input !== "object") return;
  const skill = (input as Record<string, unknown>).skill;
  if (typeof skill !== "string") return;
  const s = skill.trim();
  if (s.length === 0) return;
  if (!state.skillIdSet.has(s)) {
    state.skillIdSet.add(s);
    state.skillIdsOrdered.push(s);
  }
  state.invocationsBySkillKey.set(s, (state.invocationsBySkillKey.get(s) ?? 0) + 1);
}

function handleAssistantBlock(state: ScanState, block: Record<string, unknown>): void {
  if (block.type !== "tool_use") return;
  state.toolUseCount += 1;
  const id = typeof block.id === "string" ? block.id : null;
  if (id) state.toolUseIds.add(id);
  if (block.name === "Skill") recordSkillInvocation(state, block);
}

function handleUserToolResultBlock(state: ScanState, block: Record<string, unknown>): void {
  if (block.type !== "tool_result") return;
  const id = typeof block.tool_use_id === "string" ? block.tool_use_id : null;
  if (id) state.toolResultIds.add(id);
  if (isToolResultError(block)) state.toolErrorCount += 1;
}

function processUserEntry(state: ScanState, entry: RawEntry, idx: number): void {
  state.userEntryIndices.push(idx);
  classifyUserText(state, extractUserText(entry.raw));
  for (const block of getUserContentBlocks(entry.raw)) {
    if (isObjectBlock(block)) handleUserToolResultBlock(state, block);
  }
}

function processAssistantEntry(state: ScanState, entry: RawEntry, idx: number): void {
  state.lastAssistantIndex = idx;
  for (const block of getAssistantContentBlocks(entry.raw)) {
    if (isObjectBlock(block)) handleAssistantBlock(state, block);
  }
}

function processToolResultEntry(state: ScanState, entry: RawEntry): void {
  const { id, isError } = extractToolResult(entry.raw);
  if (id) state.toolResultIds.add(id);
  if (isError) state.toolErrorCount += 1;
}

function processEntry(state: ScanState, entry: RawEntry, idx: number): void {
  state.lastEntryIndex = idx;
  updateTimestampSpan(state, entry.timestamp);

  if (entry.type === "user" || entry.type === "assistant") state.turnCount += 1;

  if (entry.type === "user") processUserEntry(state, entry, idx);
  else if (entry.type === "assistant") processAssistantEntry(state, entry, idx);
  else if (entry.type === "tool_result") processToolResultEntry(state, entry);
}

function isObjectBlock(block: unknown): block is Record<string, unknown> {
  return Boolean(block) && typeof block === "object";
}

/**
 * Determine whether the final assistant message contains a `tool_use` that
 * never received a matching `tool_result`. That's a strong "session ended
 * mid-flight" signal used by the outcome classifier.
 */
function computeEndedWithOrphanToolUse(
  entries: readonly RawEntry[],
  lastAssistantIndex: number
): boolean {
  if (lastAssistantIndex < 0) return false;
  const blocks = getAssistantContentBlocks(entries[lastAssistantIndex]?.raw ?? {});
  const laterToolResultIds = collectToolResultIdsAfter(entries, lastAssistantIndex);
  for (const block of blocks) {
    if (!isObjectBlock(block)) continue;
    if (block.type !== "tool_use") continue;
    const id = typeof block.id === "string" ? block.id : null;
    if (!id || !laterToolResultIds.has(id)) return true;
  }
  return false;
}

function collectUserToolResultIds(entry: Record<string, unknown>, out: Set<string>): void {
  for (const block of getUserContentBlocks(entry)) {
    if (!isObjectBlock(block)) continue;
    if (block.type !== "tool_result") continue;
    const id = typeof block.tool_use_id === "string" ? block.tool_use_id : null;
    if (id) out.add(id);
  }
}

function collectToolResultIdsAfter(
  entries: readonly RawEntry[],
  startIndex: number
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (let i = startIndex + 1; i < entries.length; i += 1) {
    const e = entries[i]!;
    if (e.type === "tool_result") {
      const { id } = extractToolResult(e.raw);
      if (id) ids.add(id);
    } else if (e.type === "user") {
      collectUserToolResultIds(e.raw, ids);
    }
  }
  return ids;
}

function countInterruptsInTail(
  entries: readonly RawEntry[],
  userEntryIndices: readonly number[]
): number {
  const lastTwentyPercentStart = Math.floor(entries.length * 0.8);
  let count = 0;
  for (const idx of userEntryIndices) {
    if (idx < lastTwentyPercentStart) continue;
    const text = extractUserText(entries[idx]?.raw ?? {});
    if (text !== null && isInterruptMessage(text)) count += 1;
  }
  return count;
}

function computeDurationSeconds(firstAt: string | null, lastAt: string | null): number | null {
  const firstMs = firstAt ? Date.parse(firstAt) : NaN;
  const lastMs = lastAt ? Date.parse(lastAt) : NaN;
  if (!Number.isFinite(firstMs) || !Number.isFinite(lastMs)) return null;
  if (lastMs < firstMs) return null;
  return Math.round((lastMs - firstMs) / 1000);
}

/**
 * Whether the final entry is an assistant message that ends with a text
 * block (not an orphan tool_use). Used to detect "clean completion".
 */
function isLastEntryAssistantText(
  entries: readonly RawEntry[],
  lastEntryIndex: number,
  endedWithOrphanToolUse: boolean
): boolean {
  if (lastEntryIndex < 0) return false;
  if (entries[lastEntryIndex]?.type !== "assistant") return false;
  if (endedWithOrphanToolUse) return false;
  const blocks = getAssistantContentBlocks(entries[lastEntryIndex]?.raw ?? {});
  return blocks.some((block) => isObjectBlock(block) && block.type === "text");
}

interface OutcomeInputs {
  readonly turnCount: number;
  readonly interruptInTail: number;
  readonly lastEntryAgeMs: number;
  readonly endedWithOrphanToolUse: boolean;
  readonly toolErrorRate: number;
  readonly lastUserIsCorrectionWithNoReply: boolean;
  readonly lastIsAssistantText: boolean;
}

function classifyOutcome(inputs: OutcomeInputs): SessionOutcome {
  if (
    inputs.turnCount < 3 ||
    inputs.interruptInTail >= 1 ||
    (inputs.lastEntryAgeMs > SIX_HOURS_MS && inputs.endedWithOrphanToolUse)
  ) {
    return "abandoned";
  }
  if (
    inputs.endedWithOrphanToolUse ||
    inputs.toolErrorRate > 0.25 ||
    inputs.lastUserIsCorrectionWithNoReply
  ) {
    return "partial";
  }
  if (inputs.lastIsAssistantText && inputs.toolErrorRate <= 0.1) {
    return "completed";
  }
  return "unknown";
}

interface SatisfactionInputs {
  readonly positiveSignalCount: number;
  readonly correctionSignalCount: number;
  readonly userInterruptCount: number;
  readonly toolErrorRate: number;
  readonly lastIsAssistantText: boolean;
  readonly recentUserHasCorrection: boolean;
}

function computeSatisfactionScore(inputs: SatisfactionInputs): number {
  let score = 0.6;
  score += Math.min(0.2, 0.05 * inputs.positiveSignalCount);
  score -= Math.min(0.3, 0.1 * inputs.correctionSignalCount);
  score -= Math.min(0.3, 0.15 * inputs.userInterruptCount);
  score -= 0.2 * inputs.toolErrorRate;
  if (inputs.lastIsAssistantText && !inputs.recentUserHasCorrection) {
    score += 0.05;
  }
  return Math.max(0, Math.min(1, score));
}

function recentUserHasCorrection(
  entries: readonly RawEntry[],
  userEntryIndices: readonly number[]
): boolean {
  for (const idx of userEntryIndices.slice(-3)) {
    const text = extractUserText(entries[idx]?.raw ?? {});
    if (text !== null && matchesCorrection(text)) return true;
  }
  return false;
}

async function summarizeFile(file: ClaudeSessionFile): Promise<EnrichedSummary | null> {
  const parsed = await parseTranscriptFile(file.filePath);
  if (!parsed) return null;
  const { entries, explicitSessionId } = parsed;

  const state = initialState();
  for (let idx = 0; idx < entries.length; idx += 1) {
    processEntry(state, entries[idx]!, idx);
  }

  const endedWithOrphanToolUse = computeEndedWithOrphanToolUse(entries, state.lastAssistantIndex);
  const interruptInTail = countInterruptsInTail(entries, state.userEntryIndices);
  const durationSeconds = computeDurationSeconds(state.firstAt, state.lastAt);

  const lastMs = state.lastAt ? Date.parse(state.lastAt) : NaN;
  const lastEntryAgeMs = Number.isFinite(lastMs) ? Date.now() - lastMs : 0;

  const lastUserIndex =
    state.userEntryIndices.length > 0
      ? state.userEntryIndices[state.userEntryIndices.length - 1]!
      : -1;
  const lastUserIsCorrectionWithNoReply =
    lastUserIndex >= 0 && lastUserIndex > state.lastAssistantIndex && state.lastUserHasCorrection;

  const lastIsAssistantText = isLastEntryAssistantText(
    entries,
    state.lastEntryIndex,
    endedWithOrphanToolUse
  );

  const toolErrorRate = state.toolErrorCount / Math.max(1, state.toolUseCount);

  const outcome = classifyOutcome({
    turnCount: state.turnCount,
    interruptInTail,
    lastEntryAgeMs,
    endedWithOrphanToolUse,
    toolErrorRate,
    lastUserIsCorrectionWithNoReply,
    lastIsAssistantText,
  });

  const satisfactionScore = computeSatisfactionScore({
    positiveSignalCount: state.positiveSignalCount,
    correctionSignalCount: state.correctionSignalCount,
    userInterruptCount: state.userInterruptCount,
    toolErrorRate,
    lastIsAssistantText,
    recentUserHasCorrection: recentUserHasCorrection(entries, state.userEntryIndices),
  });

  const outcomeMultiplier = multiplierFor(outcome);
  const effectiveScore = satisfactionScore * outcomeMultiplier;

  const summary: SessionSummary = {
    sessionId: explicitSessionId ?? file.sessionId,
    filePath: file.filePath,
    firstAt: state.firstAt,
    lastAt: state.lastAt,
    durationSeconds,
    turnCount: state.turnCount,
    toolUseCount: state.toolUseCount,
    toolErrorCount: state.toolErrorCount,
    userInterruptCount: state.userInterruptCount,
    correctionSignalCount: state.correctionSignalCount,
    positiveSignalCount: state.positiveSignalCount,
    endedWithOrphanToolUse,
    outcome,
    outcomeMultiplier,
    satisfactionScore,
    effectiveScore,
    skillIds: state.skillIdsOrdered,
  };
  return { summary, invocationsBySkillKey: state.invocationsBySkillKey };
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

/**
 * Generic helper: return the `message.content` array from an entry, or `[]`.
 * User and assistant entries share the exact same shape — previously we had
 * two identical copies (`getAssistantContentBlocks` / `getUserContentBlocks`)
 * which tripped `sonarjs/no-identical-functions`.
 */
function getMessageContentBlocks(entry: Record<string, unknown>): readonly unknown[] {
  const message = entry.message;
  if (!message || typeof message !== "object") return [];
  const content = (message as Record<string, unknown>).content;
  if (!Array.isArray(content)) return [];
  return content;
}

function getAssistantContentBlocks(entry: Record<string, unknown>): readonly unknown[] {
  return getMessageContentBlocks(entry);
}

function getUserContentBlocks(entry: Record<string, unknown>): readonly unknown[] {
  return getMessageContentBlocks(entry);
}

function collectTextBlocks(content: readonly unknown[]): {
  readonly parts: readonly string[];
  readonly lastTextBlock: string | null;
} {
  const parts: string[] = [];
  let lastTextBlock: string | null = null;
  for (const block of content) {
    if (!isObjectBlock(block)) continue;
    if (block.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
      lastTextBlock = block.text;
    }
  }
  return { parts, lastTextBlock };
}

function extractUserText(entry: Record<string, unknown>): string | null {
  const message = entry.message;
  if (!message || typeof message !== "object") return null;
  const content = (message as Record<string, unknown>).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  const { parts, lastTextBlock } = collectTextBlocks(content);
  if (parts.length === 0) return null;
  return lastTextBlock ?? parts.join("\n");
}

function extractToolResult(entry: Record<string, unknown>): {
  id: string | null;
  isError: boolean;
} {
  const message = entry.message;
  let source: Record<string, unknown> = entry;
  if (message && typeof message === "object") {
    source = message as Record<string, unknown>;
  }
  const id = typeof source.tool_use_id === "string" ? source.tool_use_id : null;
  const isError = isToolResultError(source);
  return { id, isError };
}

/**
 * A tool result is treated as an error when:
 *  1. its `is_error` flag is literally `true`, or
 *  2. its textual payload (top-level string or an inner text block) starts
 *     with "Error" or contains the substring `"error":true`.
 */
function isToolResultError(source: Record<string, unknown>): boolean {
  if (source.is_error === true) return true;
  return hasErrorSignalInContent(source.content);
}

function hasErrorSignalInContent(content: unknown): boolean {
  if (typeof content === "string") return textLooksLikeError(content);
  if (!Array.isArray(content)) return false;
  for (const block of content) {
    if (!isObjectBlock(block)) continue;
    if (block.is_error === true) return true;
    if (typeof block.text === "string" && textLooksLikeError(block.text)) return true;
  }
  return false;
}

function textLooksLikeError(text: string): boolean {
  return text.startsWith("Error") || text.includes('"error":true');
}

const INTERRUPT_PATTERNS = [/\[Request interrupted/i, /\[user interrupted/i];

function isInterruptMessage(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.toLowerCase() === "cancel") return true;
  for (const pattern of INTERRUPT_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }
  return false;
}

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

interface ManifestLookup {
  readonly byId: ReadonlyMap<string, SkillManifest>;
  readonly byName: ReadonlyMap<string, SkillManifest>;
}

function indexManifests(skills: readonly SkillManifest[]): ManifestLookup {
  const byId = new Map<string, SkillManifest>();
  const byName = new Map<string, SkillManifest>();
  for (const m of skills) {
    byId.set(m.id, m);
    if (typeof m.name === "string" && m.name.length > 0 && !byName.has(m.name)) {
      byName.set(m.name, m);
    }
  }
  return { byId, byName };
}

interface BaselineAccumulator {
  satSum: number;
  mulSum: number;
  effSum: number;
  readonly outcomes: { completed: number; partial: number; abandoned: number; unknown: number };
}

function aggregateBaseline(enriched: readonly EnrichedSummary[]): BaselineAccumulator {
  const acc: BaselineAccumulator = {
    satSum: 0,
    mulSum: 0,
    effSum: 0,
    outcomes: { completed: 0, partial: 0, abandoned: 0, unknown: 0 },
  };
  for (const { summary: s } of enriched) {
    acc.satSum += s.satisfactionScore;
    acc.mulSum += s.outcomeMultiplier;
    acc.effSum += s.effectiveScore;
    acc.outcomes[s.outcome] += 1;
  }
  return acc;
}

function buildBaseline(acc: BaselineAccumulator, sessionsAnalyzed: number): EfficacyBaseline {
  if (sessionsAnalyzed === 0) {
    return { satisfaction: 0, outcomeMultiplier: 0, effectiveScore: 0, sessionsScored: 0 };
  }
  return {
    satisfaction: acc.satSum / sessionsAnalyzed,
    outcomeMultiplier: acc.mulSum / sessionsAnalyzed,
    effectiveScore: acc.effSum / sessionsAnalyzed,
    sessionsScored: sessionsAnalyzed,
  };
}

function createAccumulator(skillKey: string, manifest: SkillManifest | null): Accumulator {
  return {
    skillId: manifest ? manifest.id : skillKey,
    displayName: manifest ? manifest.name : skillKey,
    known: manifest !== null,
    sessionsCount: 0,
    invocationsCount: 0,
    satisfactionSum: 0,
    outcomeMultiplierSum: 0,
    effectiveScoreSum: 0,
    outcomeBreakdown: { completed: 0, partial: 0, abandoned: 0, unknown: 0 },
  };
}

function accumulateSession(
  acc: Map<string, Accumulator>,
  lookup: ManifestLookup,
  session: SessionSummary,
  invocationsBySkillKey: ReadonlyMap<string, number>
): void {
  for (const rawSkillKey of session.skillIds) {
    const manifest = lookup.byId.get(rawSkillKey) ?? lookup.byName.get(rawSkillKey) ?? null;
    const bucketKey = manifest ? manifest.id : rawSkillKey;
    let bucket = acc.get(bucketKey);
    if (!bucket) {
      bucket = createAccumulator(rawSkillKey, manifest);
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

function accumulatorToRow(
  bucket: Accumulator,
  baselineEffective: number,
  minSessions: number
): SkillEfficacyRow {
  const avgSatisfaction = bucket.satisfactionSum / bucket.sessionsCount;
  const avgOutcomeMultiplier = bucket.outcomeMultiplierSum / bucket.sessionsCount;
  const avgEffectiveScore = bucket.effectiveScoreSum / bucket.sessionsCount;
  return {
    skillId: bucket.skillId,
    displayName: bucket.displayName,
    known: bucket.known,
    sessionsCount: bucket.sessionsCount,
    invocationsCount: bucket.invocationsCount,
    avgSatisfaction,
    avgOutcomeMultiplier,
    avgEffectiveScore,
    delta: avgEffectiveScore - baselineEffective,
    outcomeBreakdown: {
      completed: bucket.outcomeBreakdown.completed,
      partial: bucket.outcomeBreakdown.partial,
      abandoned: bucket.outcomeBreakdown.abandoned,
      unknown: bucket.outcomeBreakdown.unknown,
    },
    qualifying: bucket.sessionsCount >= minSessions,
  };
}

function buildReport(
  enriched: readonly EnrichedSummary[],
  skills: readonly SkillManifest[],
  minSessions: number
): SkillsEfficacyReport {
  const sessionsAnalyzed = enriched.length;
  const baseAcc = aggregateBaseline(enriched);
  const baseline = buildBaseline(baseAcc, sessionsAnalyzed);

  const lookup = indexManifests(skills);
  const acc = new Map<string, Accumulator>();
  let sessionsWithSkill = 0;

  for (const { summary: session, invocationsBySkillKey } of enriched) {
    if (session.skillIds.length === 0) continue;
    sessionsWithSkill += 1;
    accumulateSession(acc, lookup, session, invocationsBySkillKey);
  }

  const rows: SkillEfficacyRow[] = [];
  for (const bucket of acc.values()) {
    rows.push(accumulatorToRow(bucket, baseline.effectiveScore, minSessions));
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
    outcomeDistribution: baseAcc.outcomes,
    minSessionsForQualifying: minSessions,
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Test-only hook: clears the in-process session-summary cache. */
export function __clearSkillsEfficacyCacheForTests(): void {
  fileCache.clear();
}
