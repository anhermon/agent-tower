import type { HarnessAdapter } from "./contracts/harness-adapter.js";
import type { SessionAnalyticsFilter } from "./contracts/session-analytics-adapter.js";
import type { SessionUsageSummary } from "./domain/sessions.js";

/**
 * Plug-in registry for harness adapters.
 *
 * Registering a new harness takes one file: implement `HarnessAdapter` and
 * call `registry.register(new MyHarnessAdapter(dataRoot))`. The registry
 * auto-discovers sessions from all registered harnesses in parallel and tags
 * each `SessionUsageSummary` with `harness: descriptor.kind`.
 *
 * Usage:
 *   const registry = new AdapterRegistry();
 *   registry.register(new ClaudeCodeHarnessAdapter(dataRoot));
 *   registry.register(new CodexHarnessAdapter(codexRoot));
 *   const sessions = await registry.listAllSessionSummaries();
 */
export class AdapterRegistry {
  private readonly adapters = new Map<string, HarnessAdapter>();

  /**
   * Register a harness adapter. Calling `register` twice with the same
   * `descriptor.kind` replaces the previous adapter.
   */
  register(adapter: HarnessAdapter): this {
    this.adapters.set(adapter.descriptor.kind, adapter);
    return this;
  }

  /** Remove a previously registered adapter by kind. No-op if not found. */
  unregister(kind: string): this {
    this.adapters.delete(kind);
    return this;
  }

  /** Retrieve a registered adapter by kind, or undefined if not found. */
  get(kind: string): HarnessAdapter | undefined {
    return this.adapters.get(kind);
  }

  /** All registered adapters in insertion order. */
  list(): readonly HarnessAdapter[] {
    return [...this.adapters.values()];
  }

  /** True if any adapters are registered. */
  get isEmpty(): boolean {
    return this.adapters.size === 0;
  }

  /**
   * Scan all registered harness roots in parallel and return a merged,
   * harness-tagged session list. Each returned summary carries
   * `harness: descriptor.kind`. Adapter-level errors are swallowed so one
   * broken harness does not suppress results from healthy ones.
   */
  async listAllSessionSummaries(
    filter?: SessionAnalyticsFilter
  ): Promise<readonly SessionUsageSummary[]> {
    if (this.adapters.size === 0) return [];

    const chunks = await Promise.all(
      [...this.adapters.values()].map(async (adapter): Promise<readonly SessionUsageSummary[]> => {
        try {
          const summaries = await adapter.listSessionSummaries(filter);
          return summaries.map((s) => ({ ...s, harness: adapter.descriptor.kind }));
        } catch {
          return [];
        }
      })
    );

    return chunks.flat();
  }
}
