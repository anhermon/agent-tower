// Passthrough shim for `next/cache` used only during vitest runs.
// The real `unstable_cache` from Next.js caches results in the React cache
// infrastructure — which is not available in a plain Node/vitest context.
// This shim makes `unstable_cache` a transparent identity wrapper so wrapped
// functions behave identically to the originals in unit tests.
export function unstable_cache<T extends (...args: Parameters<T>) => Promise<ReturnType<T>>>(
  fn: T,
  _keyParts?: string[],
  _options?: { revalidate?: number; tags?: string[] }
): T {
  return fn;
}

export function revalidateTag(_tag: string): void {
  // no-op in tests
}

export function revalidatePath(_path: string): void {
  // no-op in tests
}
