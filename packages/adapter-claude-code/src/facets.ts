import { readFile, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Shape of a per-session facet record from `~/.claude/usage-data/facets/*`.
 * Kept permissive — facets are LLM-authored and vary in structure between
 * Claude Code releases. We preserve unknown fields under `metadata` in any
 * consumer that surfaces them.
 */
export type ClaudeSessionFacet = Readonly<Record<string, unknown>>;

/**
 * Reads a single facet file. Returns `undefined` when missing or unparseable
 * — never throws, because every facet is strictly optional enrichment.
 */
export async function readSessionFacet(filePath: string): Promise<ClaudeSessionFacet | undefined> {
  try {
    const s = await stat(filePath);
    if (!s.isFile()) return undefined;
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as ClaudeSessionFacet;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Given a Claude Code data root and a session id, compute the conventional
 * facet file path. The root is typically `~/.claude/projects`, so the facets
 * directory is a sibling: `~/.claude/usage-data/facets/<sessionId>.json`.
 */
export function facetPathForSession(dataRoot: string, sessionId: string): string {
  const parent = path.dirname(dataRoot);
  return path.join(parent, "usage-data", "facets", `${sessionId}.json`);
}
