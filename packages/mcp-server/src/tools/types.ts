/**
 * Common tool-definition shape used by every registered MCP tool.
 *
 * Keeping this decoupled from the MCP SDK makes each tool's `handler`
 * independently unit-testable: tests call `handler(input)` directly, with no
 * transport and no server instance. The `server.ts` entry is the only place
 * that bridges these definitions to the SDK.
 */
export interface JsonSchemaObject {
  readonly type: "object";
  readonly properties?: Readonly<Record<string, unknown>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
  readonly [key: string]: unknown;
}

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonSchemaObject;
  readonly handler: (input: unknown) => Promise<ToolResult>;
}

export type ToolResult =
  | { readonly ok: true; readonly [key: string]: unknown }
  | { readonly ok: false; readonly reason: string; readonly message?: string };

/** Uniform error wrapper. Returned instead of throwing. */
export function errorResult(error: unknown): ToolResult {
  return {
    ok: false,
    reason: "error",
    message: error instanceof Error ? error.message : String(error),
  };
}

/** Read-only object guard; returns an empty object when input is not a record. */
export function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
