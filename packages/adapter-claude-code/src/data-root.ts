import { existsSync, statSync } from "node:fs";
import * as os from "node:os";
import path from "node:path";

/**
 * Data-root resolution shared across readers of the Claude Code on-disk
 * layout. Resolution order:
 *   1. `CLAUDE_CONTROL_PLANE_DATA_ROOT` environment variable (explicit).
 *   2. `~/.claude/projects` if it exists (conventional Claude Code location).
 *   3. `null` → callers render an empty state with configuration guidance.
 *
 * No writes, no network, no ambient defaults beyond the documented fallback.
 */

export const CLAUDE_DATA_ROOT_ENV = "CLAUDE_CONTROL_PLANE_DATA_ROOT";

export type DataRootOrigin = "env" | "default" | null;

export interface ResolvedDataRoot {
  readonly directory: string;
  readonly origin: Exclude<DataRootOrigin, null>;
}

export function resolveDataRoot(): ResolvedDataRoot | null {
  const raw = process.env[CLAUDE_DATA_ROOT_ENV];
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.length > 0) {
      return { directory: trimmed, origin: "env" };
    }
  }

  const fallback = path.join(os.homedir(), ".claude", "projects");
  if (isExistingDirectory(fallback)) {
    return { directory: fallback, origin: "default" };
  }

  return null;
}

export function getConfiguredDataRoot(): string | null {
  return resolveDataRoot()?.directory ?? null;
}

function isExistingDirectory(target: string): boolean {
  try {
    return existsSync(target) && statSync(target).isDirectory();
  } catch {
    return false;
  }
}
