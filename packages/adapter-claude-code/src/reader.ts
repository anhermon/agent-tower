import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
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

    await collectJsonlFiles(projectPath, projectName, results);
  }

  results.sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : -1));
  return results;
}

async function collectJsonlFiles(
  directory: string,
  projectId: string,
  results: ClaudeSessionFile[]
): Promise<void> {
  const entries = await safeReadDir(directory);

  for (const entryName of entries) {
    const entryPath = path.join(directory, entryName);
    const entryStat = await safeStat(entryPath);

    if (entryStat?.isDirectory()) {
      await collectJsonlFiles(entryPath, projectId, results);
    } else if (entryStat?.isFile() && entryName.endsWith(JSONL_EXTENSION)) {
      results.push({
        sessionId: entryName.slice(0, -JSONL_EXTENSION.length),
        projectId,
        filePath: entryPath,
        sizeBytes: entryStat.size,
        modifiedAt: entryStat.mtime.toISOString(),
      });
    }
  }
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

/**
 * Peeks at the head of a transcript to extract a human-friendly title without
 * reading the full file. Stops after finding a title or after `maxLines`.
 */
// eslint-disable-next-line complexity, sonarjs/cognitive-complexity -- preview extraction reads multiple entry types; branching follows the Claude JSONL format
export async function readTranscriptPreview(
  filePath: string,
  options: { readonly maxLines?: number } = {}
): Promise<TranscriptPreview> {
  const maxLines = Math.max(1, options.maxLines ?? 40);
  let firstUserText: string | null = null;
  let summary: string | null = null;
  let model: string | null = null;
  let firstTimestamp: string | null = null;
  let turnCountLowerBound = 0;

  const stream = createReadStream(filePath, { encoding: "utf8" });
  const reader = createInterface({ input: stream, crlfDelay: Infinity });
  let lineNumber = 0;

  try {
    for await (const rawLine of reader) {
      lineNumber += 1;
      if (lineNumber > maxLines && firstUserText !== null) break;
      const trimmed = rawLine.trim();
      if (trimmed.length === 0) continue;

      let parsed: ClaudeTranscriptEntry;
      try {
        parsed = JSON.parse(trimmed) as ClaudeTranscriptEntry;
      } catch {
        continue;
      }

      if (parsed.type === "user" || parsed.type === "assistant") {
        turnCountLowerBound += 1;
      }
      if (!firstTimestamp && typeof parsed.timestamp === "string") {
        firstTimestamp = parsed.timestamp;
      }
      if (!model && parsed.type === "assistant") {
        const m = (parsed as ClaudeAssistantEntry).message?.model;
        if (typeof m === "string" && m.length > 0) model = m;
      }
      if (!summary && parsed.type === "summary") {
        const s = (parsed as ClaudeSummaryEntry).summary;
        if (typeof s === "string" && s.trim().length > 0) summary = s.trim();
      }
      if (!firstUserText && parsed.type === "user") {
        firstUserText = extractFirstUserText((parsed as ClaudeUserEntry).message?.content);
      }

      if (firstUserText && summary && model && lineNumber >= 8) break;
    }
  } finally {
    reader.close();
    stream.close();
  }

  const title = summary ?? firstUserText ?? null;
  return {
    title,
    firstUserText,
    summary,
    model,
    firstTimestamp,
    turnCountLowerBound,
  };
}

function extractFirstUserText(
  content: ClaudeUserEntry["message"]["content"] | undefined
): string | null {
  const candidates: string[] = [];
  if (typeof content === "string") {
    candidates.push(content);
  } else if (Array.isArray(content)) {
    for (const block of content) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- block comes from parsed JSON; pickText narrows it at runtime
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
