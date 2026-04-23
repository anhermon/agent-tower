import "server-only";
import type { SessionSearchHit } from "@control-plane/core";

/**
 * Mtime-keyed cache for the search route. Kept in its own module so the route
 * file only exports Next.js-approved symbols (GET handler + route-config).
 * Tests import `__clearSearchCacheForTests` directly from this file.
 */

export interface CachedResult {
  readonly mtimeMs: number;
  readonly sizeBytes: number;
  readonly hits: readonly SessionSearchHit[];
}

const cache = new Map<string, Map<string, CachedResult>>();

export function getFileCacheForNeedle(needle: string): Map<string, CachedResult> {
  const existing = cache.get(needle);
  if (existing) return existing;
  const next = new Map<string, CachedResult>();
  cache.set(needle, next);
  return next;
}

export function setFileCacheForNeedle(needle: string, map: Map<string, CachedResult>): void {
  cache.set(needle, map);
}

export function __clearSearchCacheForTests(): void {
  cache.clear();
}
