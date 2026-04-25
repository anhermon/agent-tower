/**
 * Harness detector — scans well-known local paths to discover installed AI
 * coding assistant harnesses (Claude Code, Cline, Cursor, Continue, etc.).
 *
 * Pure read-only, no side effects at import time. `listDetectedHarnesses()`
 * is the sole entry point; the candidate table is built lazily on first call
 * so that importing this module never triggers I/O or `homedir()` evaluation.
 *
 * Safe to call on every page load; results are cheap (a few filesystem
 * `stat` calls) and can be cached by callers.
 */

import { access, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

// ─── Public types ────────────────────────────────────────────────────────────

export const HARNESS_KINDS = {
  ClaudeCode: "claude-code",
  Cline: "cline",
  Cursor: "cursor",
  Continue: "continue",
  Copilot: "copilot",
  Aider: "aider",
  Windsurf: "windsurf",
  Zed: "zed",
} as const;

export type HarnessKind = (typeof HARNESS_KINDS)[keyof typeof HARNESS_KINDS];

/** A detected AI coding assistant harness on the local system. */
export interface HarnessInfo {
  /** Stable programmatic identifier for the harness. */
  readonly kind: HarnessKind;
  /** Human-readable display name. */
  readonly displayName: string;
  /** The first indicator path that confirmed detection. */
  readonly detectedPath: string;
}

// ─── Internal candidate table ────────────────────────────────────────────────

interface DirectIndicator {
  readonly type: "path";
  /** Absolute path that must exist (file or directory). */
  readonly path: string;
}

interface PrefixIndicator {
  readonly type: "prefix";
  /** Directory to scan. */
  readonly dir: string;
  /** Entry name prefix to look for among direct children. */
  readonly prefix: string;
}

type Indicator = DirectIndicator | PrefixIndicator;

interface HarnessCandidate {
  readonly kind: HarnessKind;
  readonly displayName: string;
  readonly indicators: readonly Indicator[];
}

// Helper constructors — intentionally no module-level calls; all home-dir
// path construction is deferred to buildCandidates() below so that importing
// this module never triggers homedir() evaluation.

function h(...segments: string[]): string {
  return join(homedir(), ...segments);
}

function p(absolute: string): DirectIndicator {
  return { type: "path", path: absolute };
}

function pfx(dir: string, entryPrefix: string): PrefixIndicator {
  return { type: "prefix", dir, prefix: entryPrefix };
}

/**
 * Build the candidate table at call time (not at module load time).
 * Keeps the module side-effect–free at import.
 */
function buildCandidates(): readonly HarnessCandidate[] {
  return [
    {
      kind: HARNESS_KINDS.ClaudeCode,
      displayName: "Claude Code",
      indicators: [
        p(h(".claude")),
        p(h("AppData", "Roaming", "claude")), // Windows
        p(h(".config", "claude")),
      ],
    },
    {
      kind: HARNESS_KINDS.Cline,
      displayName: "Cline",
      indicators: [
        // VS Code (standard and insiders) extension directory
        pfx(h(".vscode", "extensions"), "saoudrizwan.claude-dev"),
        pfx(h(".vscode-insiders", "extensions"), "saoudrizwan.claude-dev"),
        // Cursor bundles VS Code extensions in the same tree
        pfx(h(".cursor", "extensions"), "saoudrizwan.claude-dev"),
      ],
    },
    {
      kind: HARNESS_KINDS.Cursor,
      displayName: "Cursor",
      indicators: [
        p(h(".cursor")),
        p(h("AppData", "Roaming", "Cursor", "User")), // Windows
        p(h("Library", "Application Support", "Cursor", "User")), // macOS
      ],
    },
    {
      kind: HARNESS_KINDS.Continue,
      displayName: "Continue",
      indicators: [
        p(h(".continue")),
        p(h(".continue", "config.json")),
        p(h("AppData", "Roaming", "Continue")), // Windows
      ],
    },
    {
      kind: HARNESS_KINDS.Copilot,
      displayName: "GitHub Copilot",
      indicators: [
        p(h(".config", "github-copilot")),
        p(h("AppData", "Roaming", "GitHub Copilot")), // Windows
        // VS Code extension
        pfx(h(".vscode", "extensions"), "github.copilot"),
        pfx(h(".vscode-insiders", "extensions"), "github.copilot"),
      ],
    },
    {
      kind: HARNESS_KINDS.Aider,
      displayName: "Aider",
      indicators: [
        p(h(".aider")),
        p(h(".aider.conf.yml")),
        p(h(".config", "aider")),
      ],
    },
    {
      kind: HARNESS_KINDS.Windsurf,
      displayName: "Windsurf",
      indicators: [
        p(h(".codeium")),
        p(h("AppData", "Roaming", "Windsurf", "User")), // Windows
        p(h("Library", "Application Support", "Windsurf", "User")), // macOS
      ],
    },
    {
      kind: HARNESS_KINDS.Zed,
      displayName: "Zed",
      indicators: [
        p(h(".config", "zed")),
        p(h("Library", "Application Support", "Zed")), // macOS
        p(h("AppData", "Roaming", "Zed")), // Windows
      ],
    },
  ];
}

// ─── Probe helpers ────────────────────────────────────────────────────────────

async function pathExists(absolute: string): Promise<boolean> {
  try {
    await access(absolute);
    return true;
  } catch {
    return false;
  }
}

async function findPrefixMatch(
  dir: string,
  entryPrefix: string
): Promise<string | null> {
  try {
    const entries = await readdir(dir);
    const match = entries.find((e) => e.startsWith(entryPrefix));
    return match ? join(dir, match) : null;
  } catch {
    return null;
  }
}

async function firstMatchingIndicator(
  indicators: readonly Indicator[]
): Promise<string | null> {
  for (const ind of indicators) {
    if (ind.type === "path") {
      if (await pathExists(ind.path)) return ind.path;
    } else {
      const found = await findPrefixMatch(ind.dir, ind.prefix);
      if (found) return found;
    }
  }
  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Scans well-known local filesystem paths and returns the harnesses that are
 * present on the current machine.
 *
 * Results are not cached — callers that need repeated access should memoize.
 */
export async function listDetectedHarnesses(): Promise<readonly HarnessInfo[]> {
  const candidates = buildCandidates();
  const results = await Promise.all(
    candidates.map(async (candidate) => {
      const detectedPath = await firstMatchingIndicator(candidate.indicators);
      if (!detectedPath) return null;
      return {
        kind: candidate.kind,
        displayName: candidate.displayName,
        detectedPath,
      } satisfies HarnessInfo;
    })
  );

  return results.filter((r): r is HarnessInfo => r !== null);
}
