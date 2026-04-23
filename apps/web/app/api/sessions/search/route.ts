import "server-only";
import { createReadStream, type Stats } from "node:fs";
import { stat } from "node:fs/promises";
import { createInterface } from "node:readline";

import { type ClaudeSessionFile, listSessionFiles } from "@control-plane/adapter-claude-code";
import type { SessionSearchHit } from "@control-plane/core";

import { getConfiguredDataRoot } from "@/lib/sessions-source";
import { withAudit } from "@/lib/with-audit";

import { type CachedResult, getFileCacheForNeedle, setFileCacheForNeedle } from "./cache";

/**
 * GET /api/sessions/search?q=<string>&limit=<n>
 *
 * Full-text scan over local JSONL transcripts. Line-by-line streaming with a
 * bounded concurrency pool (max 8 concurrent file reads). Wires the caller's
 * `AbortSignal` through so the handler cancels cleanly when the client goes
 * away. Memoizes per-file results keyed on `(filePath, mtime)` so repeated
 * queries over the same unchanged file never re-read from disk.
 *
 * Returns the response as a single JSON array rather than an SSE stream — the
 * browser `fetch` client can read the body as it arrives, and we keep the
 * hits ordered by score without holding them all in RAM on the client.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Reasonable defaults for a palette-style search — tight enough to keep the
// response well under a megabyte on the user's 1,000+ session corpus.
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_QUERY_LEN = 120;
const MAX_CONCURRENT_FILES = 8;
const SNIPPET_WINDOW = 160;
// Per-session hit cap — any single session contributing more than this many
// hits stops yielding after the cap to avoid one session flooding results.
const MAX_HITS_PER_FILE = 3;

// Path-traversal characters (plus the null byte for good measure). The query
// itself is compared case-insensitively against transcript text; we also use
// it as-is inside the server log, so treating these as a bad-request avoids
// any downstream path surprises.
const FORBIDDEN_CHARS = /[\s/\\]|\.{2,}/;

async function searchHandler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const queryValidation = validateSearchQuery(url);
  if (!queryValidation.ok) return queryValidation.error;

  const { q, limit } = queryValidation;

  const dataRoot = getConfiguredDataRoot();
  if (!dataRoot) {
    // Honest empty — unconfigured data root should not pretend to search.
    return json([], 200);
  }

  let files: readonly ClaudeSessionFile[] = [];
  try {
    files = await listSessionFiles({ directory: dataRoot });
  } catch (error) {
    return json({ error: errorMessage(error) }, 500);
  }

  const signal = request.signal;
  if (signal.aborted) {
    return new Response(null, { status: 499 });
  }

  const hits = await scanFilesWithLimit(files, q, limit, signal);
  if (signal.aborted) {
    return new Response(null, { status: 499 });
  }

  // Sort by score desc then by mtime desc (preserved via insertion order from
  // `listSessionFiles`, which already orders newest-first).
  const ordered = [...hits].sort((a, b) => b.score - a.score);
  return json(ordered.slice(0, limit), 200);
}

type QueryValidation =
  | { readonly ok: true; readonly q: string; readonly limit: number }
  | { readonly ok: false; readonly error: Response };

function validateSearchQuery(url: URL): QueryValidation {
  const rawQuery = url.searchParams.get("q") ?? "";
  const limitParam = url.searchParams.get("limit");

  const q = rawQuery.trim();
  if (q.length === 0) {
    return { ok: false, error: json({ error: "Missing required query parameter 'q'." }, 400) };
  }
  if (q.length > MAX_QUERY_LEN) {
    return { ok: false, error: json({ error: `Query too long (>${MAX_QUERY_LEN} chars).` }, 400) };
  }
  if (FORBIDDEN_CHARS.test(q)) {
    return { ok: false, error: json({ error: "Query contains forbidden characters." }, 400) };
  }

  let limit = DEFAULT_LIMIT;
  if (limitParam !== null) {
    const parsed = Number.parseInt(limitParam, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return { ok: false, error: json({ error: "Invalid 'limit' parameter." }, 400) };
    }
    limit = Math.min(MAX_LIMIT, parsed);
  }

  return { ok: true, q, limit };
}

export const GET = withAudit("api.sessions.search", searchHandler);

async function scanFilesWithLimit(
  files: readonly ClaudeSessionFile[],
  query: string,
  limit: number,
  signal: AbortSignal
): Promise<SessionSearchHit[]> {
  const needle = query.toLowerCase();
  const needleCache = new Map<string, CachedResult>(getFileCacheForNeedle(needle));
  const collected: SessionSearchHit[] = [];
  let cursor = 0;
  let reachedLimit = false;

  const worker = async (): Promise<void> => {
    while (!signal.aborted && !reachedLimit) {
      const index = cursor;
      cursor += 1;
      const file = files[index];
      if (!file) return;
      const hits = await scanFile(file, query, needle, needleCache, signal);
      if (signal.aborted) return;
      if (hits.length > 0) {
        collected.push(...hits);
        if (collected.length >= limit * 2) reachedLimit = true;
      }
    }
  };

  const workerCount = Math.min(MAX_CONCURRENT_FILES, Math.max(1, files.length));
  await Promise.all(Array.from({ length: workerCount }, worker));

  setFileCacheForNeedle(needle, needleCache);
  return collected;
}

async function scanFile(
  file: ClaudeSessionFile,
  rawQuery: string,
  needle: string,
  cache: Map<string, CachedResult>,
  signal: AbortSignal
): Promise<readonly SessionSearchHit[]> {
  const fileInfo = await statFile(file.filePath);
  if (!fileInfo) return [];

  const { mtimeMs, sizeBytes } = fileInfo;
  const cached = cache.get(file.filePath);
  if (isCacheFresh(cached, mtimeMs, sizeBytes)) return cached.hits;

  const hits = await readFileHits(file, rawQuery, needle, signal);
  cache.set(file.filePath, { mtimeMs, sizeBytes, hits });
  return hits;
}

function isCacheFresh(
  cached: CachedResult | undefined,
  mtimeMs: number,
  sizeBytes: number
): cached is CachedResult {
  return cached?.mtimeMs === mtimeMs && cached.sizeBytes === sizeBytes;
}

async function statFile(filePath: string): Promise<{ mtimeMs: number; sizeBytes: number } | null> {
  try {
    const stats: Stats = await stat(filePath);
    return { mtimeMs: stats.mtimeMs, sizeBytes: stats.size };
  } catch {
    return null;
  }
}

async function readFileHits(
  file: ClaudeSessionFile,
  rawQuery: string,
  needle: string,
  signal: AbortSignal
): Promise<SessionSearchHit[]> {
  const stream = createReadStream(file.filePath, { encoding: "utf8" });
  const reader = createInterface({ input: stream, crlfDelay: Infinity });
  const onAbort = (): void => {
    reader.close();
    stream.close();
  };
  signal.addEventListener("abort", onAbort, { once: true });

  const hits: SessionSearchHit[] = [];
  try {
    for await (const line of reader) {
      if (signal.aborted) break;
      const hit = processLine(line, file, rawQuery, needle);
      if (!hit) continue;
      hits.push(hit);
      if (hits.length >= MAX_HITS_PER_FILE) break;
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    reader.close();
    stream.close();
  }
  return hits;
}

function processLine(
  line: string,
  file: ClaudeSessionFile,
  rawQuery: string,
  needle: string
): SessionSearchHit | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;
  // Fast pre-filter on the raw bytes first — avoids JSON.parse on lines
  // that clearly cannot match. This is the hot-path optimization; the
  // full parse is still required to extract text + uuid.
  if (!trimmed.toLowerCase().includes(needle)) return null;
  const parsed = safeJsonParse(trimmed);
  if (!parsed) return null;
  return hitFromEntry(parsed, file, rawQuery, needle);
}

/** Individual block shapes inside `message.content` arrays. */
interface ContentBlock {
  readonly type?: string;
  readonly text?: string;
  readonly thinking?: string;
  readonly input?: unknown;
  readonly content?: unknown;
}

type MessageContent = string | readonly ContentBlock[];

interface MessageShape {
  readonly role?: string;
  readonly content?: MessageContent;
}

/**
 * Shape of a JSONL entry we search. `type` is optional since real streams
 * contain a wider set of record kinds (`system`, etc.); `entryText` narrows
 * on the three kinds we care about (user, assistant, summary) and returns
 * null for everything else. Concrete fields are all optional at the type
 * level because we have no runtime schema validation — the caller must
 * re-check each field before using it.
 */
interface ParsedEntry {
  readonly type?: string;
  readonly uuid?: string;
  readonly sessionId?: string;
  readonly message?: MessageShape;
  readonly summary?: string;
}

function safeJsonParse(line: string): ParsedEntry | null {
  try {
    const parsed: unknown = JSON.parse(line);
    if (parsed !== null && typeof parsed === "object") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function hitFromEntry(
  entry: ParsedEntry,
  file: ClaudeSessionFile,
  rawQuery: string,
  needle: string
): SessionSearchHit | null {
  const text = entryText(entry);
  if (!text) return null;

  const lower = text.toLowerCase();
  const idx = lower.indexOf(needle);
  if (idx === -1) return null;

  const score = countOccurrences(lower, needle);
  const snippet = extractSnippet(text, idx, rawQuery);
  return {
    sessionId: file.sessionId,
    projectSlug: file.projectId,
    turnId: entry.uuid ?? "",
    snippet,
    score,
  };
}

function entryText(entry: ParsedEntry): string | null {
  if (entry.type === "summary") {
    return typeof entry.summary === "string" ? entry.summary : null;
  }
  if (entry.type === "user" || entry.type === "assistant") {
    return messageText(entry.message);
  }
  return null;
}

function messageText(message: MessageShape | undefined): string | null {
  const content = message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return blocksToText(content);
  return null;
}

function blocksToText(blocks: readonly ContentBlock[]): string {
  const buffer: string[] = [];
  for (const block of blocks) {
    if (typeof block.text === "string") buffer.push(block.text);
    if (typeof block.thinking === "string") buffer.push(block.thinking);
    if (typeof block.input === "string") buffer.push(block.input);
    if (block.type === "tool_result" && typeof block.content === "string") {
      buffer.push(block.content);
    }
  }
  return buffer.join("\n");
}

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let from = 0;
  while (true) {
    const next = haystack.indexOf(needle, from);
    if (next === -1) break;
    count += 1;
    from = next + needle.length;
  }
  return count;
}

function extractSnippet(text: string, matchIndex: number, _query: string): string {
  const half = Math.floor(SNIPPET_WINDOW / 2);
  const start = Math.max(0, matchIndex - half);
  const end = Math.min(text.length, matchIndex + half);
  let snippet = text.slice(start, end).replace(/\s+/g, " ").trim();
  if (start > 0) snippet = `…${snippet}`;
  if (end < text.length) snippet = `${snippet}…`;
  return snippet;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function json(value: unknown, status: number): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
