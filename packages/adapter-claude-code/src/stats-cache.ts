import { readFile, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Raw shape of `~/.claude/stats-cache.json` as emitted by the Claude Code
 * runtime. We don't re-type the internal structure here — the cache is
 * opt-in, and the analytics fold still works without it. Consumers that want
 * a typed view should treat this as `unknown` at the boundary and validate.
 */
export type ClaudeStatsCache = Readonly<Record<string, unknown>>;

/**
 * Attempt to read a Claude Code `stats-cache.json` file at the given path.
 * Returns `undefined` when the file is absent or unreadable — callers are
 * expected to fall back to a full JSONL scan rather than fabricating data.
 */
export async function readStatsCache(filePath: string): Promise<ClaudeStatsCache | undefined> {
  try {
    const s = await stat(filePath);
    if (!s.isFile()) return undefined;
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      return parsed as ClaudeStatsCache;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/** Conventional stats-cache path alongside a Claude Code data root. */
export function statsCachePath(dataRoot: string): string {
  return path.join(path.dirname(dataRoot), "stats-cache.json");
}
