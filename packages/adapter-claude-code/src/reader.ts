import { createReadStream } from "node:fs";
import { open, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";

import type {
  ClaudeAssistantEntry,
  ClaudeContentBlock,
  ClaudeSummaryEntry,
  ClaudeTranscriptEntry,
  ClaudeUserEntry,
} from "./types.js";

/**
 * Read-only, explicit-root local filesystem reader for Claude Code transcripts.
 *
 * The reader never mutates on-disk data and never touches files outside the
 * configured root. Parse failures on a single line are reported on the result,
 * not thrown, so a corrupted line does not abort the rest of the transcript.
 */

export interface ClaudeCodeDataRoot {
  readonly directory: string;
}

export interface ClaudeSessionFile {
  readonly sessionId: string;
  readonly projectId: string;
  readonly filePath: string;
  readonly sizeBytes: number;
  readonly modifiedAt: string;
}

export interface ReadTranscriptResult {
  readonly entries: readonly ClaudeTranscriptEntry[];
  readonly malformedLines: readonly number[];
}

const JSONL_EXTENSION = ".jsonl";

export async function listSessionFiles(
  root: ClaudeCodeDataRoot
): Promise<readonly ClaudeSessionFile[]> {
  const projects = await safeReadDir(root.directory);
  const results: ClaudeSessionFile[] = [];

  for (const projectName of projects) {
    const projectPath = path.join(root.directory, projectName);
    const projectStat = await safeStat(projectPath);
    if (!projectStat?.isDirectory()) {
      continue;
    }

    const files = await safeReadDir(projectPath);
    for (const fileName of files) {
      if (!fileName.endsWith(JSONL_EXTENSION)) {
        continue;
      }
      const filePath = path.join(projectPath, fileName);
      const fileStat = await safeStat(filePath);
      if (!fileStat?.isFile()) {
        continue;
      }

      results.push({
        sessionId: fileName.slice(0, -JSONL_EXTENSION.length),
        projectId: projectName,
        filePath,
        sizeBytes: fileStat.size,
        modifiedAt: fileStat.mtime.toISOString(),
      });
    }
  }

  results.sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : -1));
  return results;
}

export async function readTranscriptFile(filePath: string): Promise<ReadTranscriptResult> {
  const entries: ClaudeTranscriptEntry[] = [];
  const malformedLines: number[] = [];

  const stream = createReadStream(filePath, { encoding: "utf8" });
  const lineReader = createInterface({ input: stream, crlfDelay: Infinity });

  let lineNumber = 0;
  try {
    for await (const rawLine of lineReader) {
      lineNumber += 1;
      const trimmed = rawLine.trim();
      if (trimmed.length === 0) {
        continue;
      }

      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (parsed && typeof parsed === "object" && "type" in parsed) {
          entries.push(parsed as ClaudeTranscriptEntry);
        } else {
          malformedLines.push(lineNumber);
        }
      } catch {
        malformedLines.push(lineNumber);
      }
    }
  } finally {
    lineReader.close();
    stream.close();
  }

  return { entries, malformedLines };
}

export interface TranscriptPreview {
  readonly title: string | null;
  readonly firstUserText: string | null;
  readonly summary: string | null;
  readonly model: string | null;
  readonly firstTimestamp: string | null;
  readonly turnCountLowerBound: number;
}

interface PreviewState {
  firstUserText: string | null;
  summary: string | null;
  model: string | null;
  firstTimestamp: string | null;
  turnCountLowerBound: number;
}

function parsePreviewLine(trimmed: string): ClaudeTranscriptEntry | null {
  try {
    return JSON.parse(trimmed) as ClaudeTranscriptEntry;
  } catch {
    return null;
  }
}

function updatePreviewState(state: PreviewState, parsed: ClaudeTranscriptEntry): void {
  updateTurnCount(state, parsed);
  updateFirstTimestamp(state, parsed);
  updateModel(state, parsed);
  updateSummary(state, parsed);
  updateFirstUserText(state, parsed);
}

function updateTurnCount(state: PreviewState, parsed: ClaudeTranscriptEntry): void {
  if (parsed.type === "user" || parsed.type === "assistant") {
    state.turnCountLowerBound += 1;
  }
}

function updateFirstTimestamp(state: PreviewState, parsed: ClaudeTranscriptEntry): void {
  if (!state.firstTimestamp && typeof parsed.timestamp === "string") {
    state.firstTimestamp = parsed.timestamp;
  }
}

function updateModel(state: PreviewState, parsed: ClaudeTranscriptEntry): void {
  if (!state.model && parsed.type === "assistant") {
    const m = (parsed as ClaudeAssistantEntry).message?.model;
    if (typeof m === "string" && m.length > 0) state.model = m;
  }
}

function updateSummary(state: PreviewState, parsed: ClaudeTranscriptEntry): void {
  if (!state.summary && parsed.type === "summary") {
    const s = (parsed as ClaudeSummaryEntry).summary;
    if (typeof s === "string" && s.trim().length > 0) state.summary = s.trim();
  }
}

function updateFirstUserText(state: PreviewState, parsed: ClaudeTranscriptEntry): void {
  if (!state.firstUserText && parsed.type === "user") {
    state.firstUserText = extractFirstUserText((parsed as ClaudeUserEntry).message?.content);
  }
}

/** Returns true if the caller should break (stop reading). */
function processPreviewLine(
  rawLine: string,
  lineNumber: number,
  maxLines: number,
  state: PreviewState
): boolean {
  if (lineNumber > maxLines && state.firstUserText !== null) return true;
  const trimmed = rawLine.trim();
  if (trimmed.length === 0) return false;
  const parsed = parsePreviewLine(trimmed);
  if (!parsed) return false;
  updatePreviewState(state, parsed);
  return !!(state.firstUserText && state.summary && state.model && lineNumber >= 8);
}

/**
 * Peeks at the head of a transcript to extract a human-friendly title without
 * reading the full file. Stops after finding a title or after `maxLines`.
 */
export async function readTranscriptPreview(
  filePath: string,
  options: { readonly maxLines?: number } = {}
): Promise<TranscriptPreview> {
  const maxLines = Math.max(1, options.maxLines ?? 40);
  const state: PreviewState = {
    firstUserText: null,
    summary: null,
    model: null,
    firstTimestamp: null,
    turnCountLowerBound: 0,
  };

  const stream = createReadStream(filePath, { encoding: "utf8" });
  const reader = createInterface({ input: stream, crlfDelay: Infinity });
  let lineNumber = 0;

  try {
    for await (const rawLine of reader) {
      lineNumber += 1;
      if (processPreviewLine(rawLine, lineNumber, maxLines, state)) break;
    }
  } finally {
    reader.close();
    stream.close();
  }

  const title = state.summary ?? state.firstUserText ?? null;
  return {
    title,
    firstUserText: state.firstUserText,
    summary: state.summary,
    model: state.model,
    firstTimestamp: state.firstTimestamp,
    turnCountLowerBound: state.turnCountLowerBound,
  };
}

export interface TranscriptTail {
  readonly role: "user" | "assistant";
  readonly text: string;
}

/**
 * Reads the last ~`windowBytes` of a JSONL transcript and returns the most
 * recent user or assistant text block. Skips tool_use / tool_result blocks
 * so the excerpt reflects actual conversation turns.
 *
 * Intended for live event enrichment: cheap (single pread + parse of a bounded
 * tail window) and tolerant (returns null on any error or missing text).
 */
export async function readTranscriptTail(
  filePath: string,
  options: { readonly windowBytes?: number; readonly maxChars?: number } = {}
): Promise<TranscriptTail | null> {
  const windowBytes = Math.max(1024, options.windowBytes ?? 32_768);
  const maxChars = Math.max(20, options.maxChars ?? 200);

  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(filePath, "r");
    const st = await handle.stat();
    const size = st.size;
    if (size === 0) return null;
    const readLen = Math.min(size, windowBytes);
    const start = size - readLen;
    const buf = Buffer.alloc(readLen);
    await handle.read(buf, 0, readLen, start);
    const text = buf.toString("utf8");
    const lines = (start === 0 ? text : text.slice(text.indexOf("\n") + 1)).split("\n");
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const trimmed = lines[i]!.trim();
      if (trimmed.length === 0) continue;
      let parsed: ClaudeTranscriptEntry;
      try {
        parsed = JSON.parse(trimmed) as ClaudeTranscriptEntry;
      } catch {
        continue;
      }
      const tail = pickTailFromEntry(parsed, maxChars);
      if (tail) return tail;
    }
    return null;
  } catch {
    return null;
  } finally {
    if (handle) {
      try {
        await handle.close();
      } catch {
        // swallow
      }
    }
  }
}

function pickTailFromEntry(entry: ClaudeTranscriptEntry, maxChars: number): TranscriptTail | null {
  if (entry.type === "user") {
    const content = (entry as ClaudeUserEntry).message?.content;
    const text = extractLastUserText(content);
    if (text) return { role: "user", text: truncateTail(text, maxChars) };
    return null;
  }
  if (entry.type === "assistant") {
    const content = (entry as ClaudeAssistantEntry).message?.content;
    const text = extractAssistantText(content);
    if (text) return { role: "assistant", text: truncateTail(text, maxChars) };
    return null;
  }
  return null;
}

function extractLastUserText(
  content: ClaudeUserEntry["message"]["content"] | undefined
): string | null {
  if (typeof content === "string") return sanitizeTailText(content);
  if (!Array.isArray(content)) return null;
  for (let i = content.length - 1; i >= 0; i -= 1) {
    const block = content[i]!;
    const text = pickText(block);
    if (text) {
      const cleaned = sanitizeTailText(text);
      if (cleaned) return cleaned;
    }
  }
  return null;
}

function extractAssistantText(
  content: ClaudeAssistantEntry["message"]["content"] | undefined
): string | null {
  if (typeof content === "string") return sanitizeTailText(content);
  if (!Array.isArray(content)) return null;
  for (let i = content.length - 1; i >= 0; i -= 1) {
    const block = content[i]!;
    const text = pickText(block);
    if (text) {
      const cleaned = sanitizeTailText(text);
      if (cleaned) return cleaned;
    }
  }
  return null;
}

function sanitizeTailText(text: string): string | null {
  let stripped = text.replace(NOISE_TAG_BLOCK, " ");
  stripped = stripped.replace(NOISE_SELF_CLOSING, " ");
  stripped = stripped.replace(STRAY_TAG, " ");
  const collapsed = stripped.replace(/\s+/g, " ").trim();
  return collapsed.length === 0 ? null : collapsed;
}

function truncateTail(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

function extractFirstUserText(
  content: ClaudeUserEntry["message"]["content"] | undefined
): string | null {
  const candidates: string[] = [];
  if (typeof content === "string") {
    candidates.push(content);
  } else if (Array.isArray(content)) {
    for (const block of content as ClaudeContentBlock[]) {
      const text = pickText(block);
      if (text) candidates.push(text);
    }
  }
  for (const raw of candidates) {
    const cleaned = sanitizeTitleCandidate(raw);
    if (cleaned) return cleaned;
  }
  return null;
}

function pickText(block: ClaudeContentBlock): string | null {
  if (block.type === "text" && typeof block.text === "string" && block.text.trim().length > 0) {
    return block.text;
  }
  return null;
}

const NOISE_TAG_NAME = "(?:local-command-[a-z-]+|command-[a-z-]+|system-reminder|ide-[a-z-]+)";
const NOISE_TAG_BLOCK = new RegExp(`<(${NOISE_TAG_NAME})\\b[^>]*>[\\s\\S]*?</\\1>`, "gi");
const NOISE_SELF_CLOSING = new RegExp(`<${NOISE_TAG_NAME}\\b[^/>]*/>`, "gi");
const STRAY_TAG = /<\/?[a-z][^>]*>/gi;

function sanitizeTitleCandidate(text: string): string | null {
  let stripped = text.replace(NOISE_TAG_BLOCK, " ");
  stripped = stripped.replace(NOISE_SELF_CLOSING, " ");
  stripped = stripped.replace(STRAY_TAG, " ");
  const firstLine = stripped
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .find((line) => line.length > 0);
  if (!firstLine || firstLine.length < 2) return null;
  if (/^(ping|hi|hey|hello|test|ok)$/i.test(firstLine)) return null;
  return firstLine.length <= 160 ? firstLine : `${firstLine.slice(0, 159).trimEnd()}…`;
}

async function safeReadDir(directory: string): Promise<readonly string[]> {
  try {
    return await readdir(directory);
  } catch {
    return [];
  }
}

async function safeStat(target: string) {
  try {
    return await stat(target);
  } catch {
    return null;
  }
}
