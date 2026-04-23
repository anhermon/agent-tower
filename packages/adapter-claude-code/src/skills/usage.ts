import { readFile } from "node:fs/promises";
import type { DateRange } from "@control-plane/core";
import { resolveDataRoot } from "../data-root.js";
import { type ClaudeSessionFile, listSessionFiles } from "../reader.js";
import { listSkillsOrEmpty, type SkillManifest } from "./manifests.js";

/**
 * Extracts Skill-tool invocation telemetry from locally stored Claude Code
 * JSONL sessions and joins the results against the discovered
 * {@link SkillManifest} catalogue.
 *
 * Read-only: nothing on disk is mutated and no network is touched. If no data
 * root is configured the result is `{ok: false, reason: "unconfigured"}`.
 */

export interface SkillUsageStats {
  readonly skillId: string;
  readonly displayName: string;
  readonly known: boolean;
  readonly invocationCount: number;
  readonly firstInvokedAt: string | null;
  readonly lastInvokedAt: string | null;
  readonly sizeBytes: number;
  readonly approxTokens: number;
  readonly bytesInjected: number;
  readonly tokensInjected: number;
  readonly perProject: readonly { readonly cwd: string; readonly count: number }[];
  readonly perHourOfDay: readonly number[];
  readonly perDayOfWeek: readonly number[];
  readonly perDay: readonly { readonly date: string; readonly count: number }[];
}

export interface SkillsUsageReport {
  readonly totals: {
    readonly totalInvocations: number;
    readonly distinctSkills: number;
    readonly knownSkills: number;
    readonly unknownSkills: number;
    readonly totalBytesInjected: number;
    readonly totalTokensInjected: number;
    readonly sessionsScanned: number;
    readonly filesScanned: number;
    readonly firstInvokedAt: string | null;
    readonly lastInvokedAt: string | null;
  };
  readonly perSkill: readonly SkillUsageStats[];
  readonly perHourOfDay: readonly number[];
  readonly perDayOfWeek: readonly number[];
  readonly perDay: readonly { readonly date: string; readonly count: number }[];
}

export type ListSkillsUsageResult =
  | { readonly ok: true; readonly report: SkillsUsageReport }
  | { readonly ok: false; readonly reason: "unconfigured" | "error"; readonly message?: string };

interface RawInvocation {
  readonly skillKey: string;
  readonly timestamp: string | null;
  readonly sessionId: string | null;
  readonly cwd: string | null;
}

interface ScanResult {
  readonly invocations: readonly RawInvocation[];
  readonly filesScanned: number;
}

interface CacheEntry {
  readonly key: string;
  readonly scan: ScanResult;
}

let scanCache: CacheEntry | null = null;

export async function computeSkillsUsage(options?: {
  readonly skills?: readonly SkillManifest[];
  readonly range?: DateRange;
}): Promise<ListSkillsUsageResult> {
  const resolved = resolveDataRoot();
  if (!resolved) {
    return { ok: false, reason: "unconfigured" };
  }

  try {
    const files = await listSessionFiles({ directory: resolved.directory });
    const scan = await scanWithCache(files);

    let skills: readonly SkillManifest[];
    if (options?.skills) {
      skills = options.skills;
    } else {
      const list = await listSkillsOrEmpty();
      skills = list.ok ? list.skills : [];
    }

    // Filter invocations by range AFTER the scan cache so the cache is reused
    // across range changes. Pre-filtering keeps `buildReport` simple.
    const filteredScan = options?.range ? filterScanByRange(scan, options.range) : scan;
    const report = buildReport(filteredScan, skills);
    return { ok: true, report };
  } catch (error) {
    return { ok: false, reason: "error", message: errorMessage(error) };
  }
}

function filterScanByRange(scan: ScanResult, range: DateRange): ScanResult {
  const invocations = scan.invocations.filter((inv) => {
    if (!inv.timestamp) return false;
    const day = inv.timestamp.slice(0, 10);
    return day >= range.from && day <= range.to;
  });
  return { invocations, filesScanned: scan.filesScanned };
}

async function scanWithCache(files: readonly ClaudeSessionFile[]): Promise<ScanResult> {
  const sortedKeyParts = files.map((file) => `${file.filePath}:${file.modifiedAt}`).sort();
  const cacheKey = sortedKeyParts.join("|");

  if (scanCache && scanCache.key === cacheKey) {
    return scanCache.scan;
  }

  const invocations: RawInvocation[] = [];
  let filesScanned = 0;
  for (const file of files) {
    filesScanned += 1;
    const fromFile = await readInvocationsFromFile(file.filePath);
    for (const inv of fromFile) invocations.push(inv);
  }

  const scan: ScanResult = { invocations, filesScanned };
  scanCache = { key: cacheKey, scan };
  return scan;
}

async function readInvocationsFromFile(filePath: string): Promise<readonly RawInvocation[]> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    return [];
  }

  const results: RawInvocation[] = [];
  const lines = raw.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;

    const entry = parsed as Record<string, unknown>;
    if (entry.type !== "assistant") continue;

    const message = entry.message;
    if (!message || typeof message !== "object") continue;
    const content = (message as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;

    const timestamp = typeof entry.timestamp === "string" ? entry.timestamp : null;
    const sessionId = typeof entry.sessionId === "string" ? entry.sessionId : null;
    const cwd = typeof entry.cwd === "string" ? entry.cwd : null;

    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const blk = block as Record<string, unknown>;
      if (blk.type !== "tool_use" || blk.name !== "Skill") continue;
      const input = blk.input;
      if (!input || typeof input !== "object") continue;
      const skill = (input as Record<string, unknown>).skill;
      if (typeof skill !== "string") continue;
      const trimmedSkill = skill.trim();
      if (trimmedSkill.length === 0) continue;
      results.push({ skillKey: trimmedSkill, timestamp, sessionId, cwd });
    }
  }
  return results;
}

interface SkillBucket {
  skillId: string;
  displayName: string;
  known: boolean;
  sizeBytes: number;
  invocationCount: number;
  firstInvokedAt: string | null;
  lastInvokedAt: string | null;
  perProject: Map<string, number>;
  perHourOfDay: number[];
  perDayOfWeek: number[];
  perDay: Map<string, number>;
}

function buildReport(scan: ScanResult, skills: readonly SkillManifest[]): SkillsUsageReport {
  const byId = new Map<string, SkillManifest>();
  const byName = new Map<string, SkillManifest>();
  for (const s of skills) {
    byId.set(s.id, s);
    if (typeof s.name === "string" && s.name.length > 0) {
      if (!byName.has(s.name)) byName.set(s.name, s);
    }
  }

  const buckets = new Map<string, SkillBucket>();
  const sessions = new Set<string>();
  const totalPerHour = new Array<number>(24).fill(0);
  const totalPerDow = new Array<number>(7).fill(0);
  const totalPerDay = new Map<string, number>();
  let totalFirst: string | null = null;
  let totalLast: string | null = null;

  for (const inv of scan.invocations) {
    const manifest = byId.get(inv.skillKey) ?? byName.get(inv.skillKey) ?? null;
    const bucketKey = manifest ? manifest.id : inv.skillKey;
    let bucket = buckets.get(bucketKey);
    if (!bucket) {
      bucket = {
        skillId: manifest ? manifest.id : inv.skillKey,
        displayName: manifest ? manifest.name : inv.skillKey,
        known: manifest !== null,
        sizeBytes: manifest ? manifest.sizeBytes : 0,
        invocationCount: 0,
        firstInvokedAt: null,
        lastInvokedAt: null,
        perProject: new Map(),
        perHourOfDay: new Array<number>(24).fill(0),
        perDayOfWeek: new Array<number>(7).fill(0),
        perDay: new Map(),
      };
      buckets.set(bucketKey, bucket);
    }

    bucket.invocationCount += 1;

    if (inv.timestamp) {
      const date = new Date(inv.timestamp);
      if (!Number.isNaN(date.getTime())) {
        const hour = date.getUTCHours();
        const dow = date.getUTCDay();
        const dayKey = date.toISOString().slice(0, 10);

        bucket.perHourOfDay[hour] = (bucket.perHourOfDay[hour] ?? 0) + 1;
        bucket.perDayOfWeek[dow] = (bucket.perDayOfWeek[dow] ?? 0) + 1;
        bucket.perDay.set(dayKey, (bucket.perDay.get(dayKey) ?? 0) + 1);

        totalPerHour[hour] = (totalPerHour[hour] ?? 0) + 1;
        totalPerDow[dow] = (totalPerDow[dow] ?? 0) + 1;
        totalPerDay.set(dayKey, (totalPerDay.get(dayKey) ?? 0) + 1);

        if (!bucket.firstInvokedAt || inv.timestamp < bucket.firstInvokedAt) {
          bucket.firstInvokedAt = inv.timestamp;
        }
        if (!bucket.lastInvokedAt || inv.timestamp > bucket.lastInvokedAt) {
          bucket.lastInvokedAt = inv.timestamp;
        }
        if (!totalFirst || inv.timestamp < totalFirst) totalFirst = inv.timestamp;
        if (!totalLast || inv.timestamp > totalLast) totalLast = inv.timestamp;
      }
    }

    if (inv.cwd) {
      bucket.perProject.set(inv.cwd, (bucket.perProject.get(inv.cwd) ?? 0) + 1);
    }
    if (inv.sessionId) {
      sessions.add(inv.sessionId);
    }
  }

  const perSkill: SkillUsageStats[] = [];
  let totalInvocations = 0;
  let totalBytesInjected = 0;
  let totalTokensInjected = 0;
  let knownSkills = 0;
  let unknownSkills = 0;

  for (const bucket of buckets.values()) {
    const approxTokens = bucket.sizeBytes > 0 ? Math.ceil(bucket.sizeBytes / 4) : 0;
    const bytesInjected = bucket.invocationCount * bucket.sizeBytes;
    const tokensInjected = bucket.invocationCount * approxTokens;

    totalInvocations += bucket.invocationCount;
    totalBytesInjected += bytesInjected;
    totalTokensInjected += tokensInjected;
    if (bucket.known) knownSkills += 1;
    else unknownSkills += 1;

    const perProject = Array.from(bucket.perProject.entries())
      .map(([cwd, count]) => ({ cwd, count }))
      .sort((a, b) => b.count - a.count || a.cwd.localeCompare(b.cwd));

    const perDay = Array.from(bucket.perDay.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    perSkill.push({
      skillId: bucket.skillId,
      displayName: bucket.displayName,
      known: bucket.known,
      invocationCount: bucket.invocationCount,
      firstInvokedAt: bucket.firstInvokedAt,
      lastInvokedAt: bucket.lastInvokedAt,
      sizeBytes: bucket.sizeBytes,
      approxTokens,
      bytesInjected,
      tokensInjected,
      perProject,
      perHourOfDay: bucket.perHourOfDay.slice(),
      perDayOfWeek: bucket.perDayOfWeek.slice(),
      perDay,
    });
  }

  perSkill.sort(
    (a, b) =>
      b.invocationCount - a.invocationCount ||
      a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" })
  );

  const perDayTotal = Array.from(totalPerDay.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totals: {
      totalInvocations,
      distinctSkills: buckets.size,
      knownSkills,
      unknownSkills,
      totalBytesInjected,
      totalTokensInjected,
      sessionsScanned: sessions.size,
      filesScanned: scan.filesScanned,
      firstInvokedAt: totalFirst,
      lastInvokedAt: totalLast,
    },
    perSkill,
    perHourOfDay: totalPerHour,
    perDayOfWeek: totalPerDow,
    perDay: perDayTotal,
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Test-only hook: clears the in-process scan cache. */
export function __clearSkillsUsageCacheForTests(): void {
  scanCache = null;
}
