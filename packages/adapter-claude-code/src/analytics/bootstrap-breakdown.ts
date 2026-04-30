/**
 * Bootstrap breakdown — parse the initial `system` prompt entry to identify
 * which context components were injected into the session's context window:
 * CLAUDE.md files, AGENTS.md files, injected skill text, and the raw system
 * instructions preamble.
 *
 * Pure fold: no I/O, no clocks. Inputs flow in, the canonical output flows
 * out. The adapter is responsible for loading `entries` from disk.
 *
 * Token estimation uses the 4-chars-per-token heuristic (sufficient for
 * planning "what ate my context window?" — not for billing accuracy).
 */

import type { ClaudeSystemEntry, ClaudeTranscriptEntry } from "../types.js";

/** Rough estimation: 1 token ≈ 4 characters (ASCII / English prose). */
const CHARS_PER_TOKEN = 4;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** The kind of bootstrapped component detected in the system prompt. */
export type BootstrapComponentKind =
  | "claude_md" // Contents of /path/to/CLAUDE.md
  | "agents_md" // Contents of /path/to/AGENTS.md
  | "skill" // Inline skill text (# Skill Name header pattern)
  | "system_preamble" // Everything before the first "Contents of" block
  | "other_md"; // Any other markdown file injected via "Contents of"

export interface BootstrapComponent {
  /** Category of the injected component. */
  readonly kind: BootstrapComponentKind;
  /**
   * Human-readable label. For `*_md` kinds this is the file path (as injected
   * by Claude Code). For `skill` it is the skill name. For `system_preamble`
   * it is "System preamble".
   */
  readonly name: string;
  /** Raw byte count of the component's text content. */
  readonly sizeBytes: number;
  /** Estimated token count (`sizeBytes / CHARS_PER_TOKEN`, rounded up). */
  readonly estimatedTokens: number;
  /**
   * First 200 characters of the component text, trimmed. Lets callers show a
   * preview without shipping the entire content in the output payload.
   */
  readonly excerpt: string;
}

export interface BootstrapBreakdown {
  readonly sessionId: string;
  /**
   * Total byte length of the system prompt text (sum of all components).
   * `0` when no system entry was found.
   */
  readonly systemPromptBytes: number;
  /**
   * Estimated token count for the full system prompt.
   * `0` when no system entry was found.
   */
  readonly estimatedSystemPromptTokens: number;
  /** Ordered list of identified components, largest first. */
  readonly components: readonly BootstrapComponent[];
  /**
   * `true` when a system entry was found but its content could not be parsed
   * into components (e.g. it was empty or had an unexpected shape).
   */
  readonly parseFailed: boolean;
}

export interface BootstrapBreakdownOptions {
  readonly sessionId?: string;
}

// ─── Pattern matching ─────────────────────────────────────────────────────────

/**
 * Claude Code injects file contents using this header pattern:
 *   "Contents of /absolute/path/to/file.md (optional annotation):\n\n"
 *
 * The regex captures the full file path (group 1). The colon + newlines
 * following it are consumed so the remaining content begins at the next line.
 */
const CONTENTS_OF_HEADER_RE = /Contents of ([^\n(]+?)(?:\s*\([^)]*\))?\s*:\s*\n(?:\n|(?=\S))/g;

/** Matches Claude Code "skill" section header pattern emitted by the harness. */
const SKILL_HEADER_RE = /^#\s+([^\n]+Skill[^\n]*)\n/im;

interface RawSection {
  readonly header: string | null; // file path, or null for preamble
  readonly content: string;
}

interface HeaderPosition {
  readonly start: number;
  readonly end: number;
  readonly filePath: string;
}

/**
 * Split the system prompt text into labelled sections. Uses a single pass
 * with the global regex to collect all header positions, then slices the text
 * between them.
 */
function splitIntoSections(text: string): RawSection[] {
  const headerPositions: HeaderPosition[] = [];
  CONTENTS_OF_HEADER_RE.lastIndex = 0;

  let m: RegExpExecArray | null;
  while ((m = CONTENTS_OF_HEADER_RE.exec(text)) !== null) {
    // Group 1 is guaranteed to exist because the regex has a required capture.
    const filePath = (m[1] ?? "").trim();
    headerPositions.push({
      start: m.index,
      end: m.index + m[0].length,
      filePath,
    });
  }

  if (headerPositions.length === 0) {
    // No "Contents of" markers — treat the whole text as a preamble.
    return text.trim().length > 0 ? [{ header: null, content: text }] : [];
  }

  const sections: RawSection[] = [];

  // Preamble: text before the first header.
  const firstHeader = headerPositions[0];
  if (firstHeader !== undefined) {
    const preamble = text.slice(0, firstHeader.start);
    if (preamble.trim().length > 0) {
      sections.push({ header: null, content: preamble });
    }
  }

  // Each header's body runs from its end until the next header's start (or EOF).
  for (let i = 0; i < headerPositions.length; i++) {
    const pos = headerPositions[i];
    if (pos === undefined) continue;
    const nextPos = headerPositions[i + 1];
    const bodyEnd = nextPos !== undefined ? nextPos.start : text.length;
    sections.push({ header: pos.filePath, content: text.slice(pos.end, bodyEnd) });
  }

  return sections;
}

// ─── Component classification ─────────────────────────────────────────────────

function classifySection(section: RawSection): BootstrapComponent {
  const content = section.content;
  const sizeBytes = Buffer.byteLength(content, "utf8");
  const estimatedTokens = estimateTokens(content);
  const excerpt = content.slice(0, 200).trim();

  if (section.header === null) {
    // Check if the preamble contains a skill header.
    const skillMatch = SKILL_HEADER_RE.exec(content);
    if (skillMatch !== null) {
      const skillName = (skillMatch[1] ?? "").trim();
      return {
        kind: "skill",
        name: skillName || "Unknown skill",
        sizeBytes,
        estimatedTokens,
        excerpt,
      };
    }
    return {
      kind: "system_preamble",
      name: "System preamble",
      sizeBytes,
      estimatedTokens,
      excerpt,
    };
  }

  const filePath = section.header;
  const baseName = filePath.split("/").pop() ?? filePath;
  const lowerBase = baseName.toLowerCase();

  if (lowerBase === "claude.md") {
    return { kind: "claude_md", name: filePath, sizeBytes, estimatedTokens, excerpt };
  }
  if (lowerBase === "agents.md") {
    return { kind: "agents_md", name: filePath, sizeBytes, estimatedTokens, excerpt };
  }
  return { kind: "other_md", name: filePath, sizeBytes, estimatedTokens, excerpt };
}

// ─── System entry extraction ───────────────────────────────────────────────────

/**
 * Extract the system prompt text from a `system` transcript entry.
 * Claude Code uses two shapes:
 *  - `entry.message.content` (string) — the message payload form
 *  - `entry.content` (string) — the flat content field form
 */
function extractSystemContent(entry: ClaudeSystemEntry): string | null {
  // Flat content field (most common in init entries).
  if (typeof entry.content === "string" && entry.content.trim().length > 0) {
    return entry.content;
  }
  // Message payload form.
  const msgContent = entry.message?.content;
  if (typeof msgContent === "string" && msgContent.trim().length > 0) {
    return msgContent;
  }
  return null;
}

/**
 * Find the first system entry that contains a non-empty system prompt. Claude
 * Code also emits `system` entries for `turn_duration` events (which have no
 * content) — skip those.
 */
function findBootstrapEntry(entries: readonly ClaudeTranscriptEntry[]): ClaudeSystemEntry | null {
  for (const entry of entries) {
    if (entry.type !== "system") continue;
    const sys = entry as ClaudeSystemEntry;
    const content = extractSystemContent(sys);
    if (content !== null) return sys;
  }
  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute a breakdown of the bootstrapped context injected into the session's
 * system prompt. Returns a `BootstrapBreakdown` regardless of whether a system
 * entry is found — callers can check `systemPromptBytes === 0` to detect the
 * no-system-entry case and `parseFailed` for unexpected parse failures.
 */
export function computeBootstrapBreakdown(
  entries: readonly ClaudeTranscriptEntry[],
  options: BootstrapBreakdownOptions = {}
): BootstrapBreakdown {
  const sessionId = options.sessionId ?? entries[0]?.sessionId ?? "unknown";

  const bootstrapEntry = findBootstrapEntry(entries);
  if (!bootstrapEntry) {
    return {
      sessionId,
      systemPromptBytes: 0,
      estimatedSystemPromptTokens: 0,
      components: [],
      parseFailed: false,
    };
  }

  const rawContent = extractSystemContent(bootstrapEntry);
  if (rawContent === null) {
    return {
      sessionId,
      systemPromptBytes: 0,
      estimatedSystemPromptTokens: 0,
      components: [],
      parseFailed: true,
    };
  }

  const systemPromptBytes = Buffer.byteLength(rawContent, "utf8");
  const estimatedSystemPromptTokens = estimateTokens(rawContent);

  const rawSections = splitIntoSections(rawContent);
  if (rawSections.length === 0) {
    return {
      sessionId,
      systemPromptBytes,
      estimatedSystemPromptTokens,
      components: [],
      parseFailed: true,
    };
  }

  const components = rawSections
    .map(classifySection)
    .filter((c) => c.sizeBytes > 0)
    .sort((a, b) => b.sizeBytes - a.sizeBytes);

  return {
    sessionId,
    systemPromptBytes,
    estimatedSystemPromptTokens,
    components,
    parseFailed: false,
  };
}
