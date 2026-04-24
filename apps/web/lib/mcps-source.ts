import type { McpServerDescriptor, McpToolDescriptor } from "@control-plane/core";

/**
 * Server-only data derivation for the MCPs module.
 *
 * Phase 1 — deferred. No live MCP adapter is wired. This module exists so
 * that future work can replace the `{ ok: false, reason: "deferred" }` branch
 * with a real `McpAdapter` call without restructuring the page or the result
 * type.
 *
 * Resolution order (once wired):
 *   1. Adapter advertises `McpClient` capability → call `describeServer` /
 *      `listTools`.
 *   2. Capability absent → return `{ ok: false, reason: "unavailable" }`.
 *   3. Adapter error → return `{ ok: false, reason: "error", message }`.
 */

export type ListMcpServersResult =
  | {
      readonly ok: true;
      readonly servers: readonly McpServerDescriptor[];
      readonly tools: readonly McpToolDescriptor[];
    }
  | {
      readonly ok: false;
      readonly reason: "deferred" | "unavailable" | "error";
      readonly message?: string;
    };

/**
 * Returns the current MCP server inventory.
 *
 * In Phase 1 this always resolves to `{ ok: false, reason: "deferred" }`.
 * When an {@link McpAdapter} is registered, replace this stub with real
 * capability-gated calls.
 */
// eslint-disable-next-line @typescript-eslint/require-await -- Phase 1 stub; real implementation will use await
export async function listMcpServers(): Promise<ListMcpServersResult> {
  // Phase 1: deferred. No adapter is wired.
  return { ok: false, reason: "deferred" };
}
