import type { JsonObject, JsonValue, MetadataCarrier } from "./common.js";
import type { ToolDescriptor } from "./tools.js";

export const MCP_SERVER_STATUSES = {
  Unknown: "unknown",
  Connecting: "connecting",
  Connected: "connected",
  Disconnected: "disconnected",
  Error: "error",
} as const;

export type McpServerStatus = (typeof MCP_SERVER_STATUSES)[keyof typeof MCP_SERVER_STATUSES];

export interface McpServerDescriptor extends MetadataCarrier {
  readonly id: string;
  readonly name: string;
  readonly status: McpServerStatus;
  readonly transport: McpTransport;
  readonly capabilities: readonly string[];
}

export type McpTransport =
  | { readonly kind: "stdio"; readonly command: string; readonly args?: readonly string[] }
  | { readonly kind: "http"; readonly url: string; readonly headers?: JsonObject };

export interface McpToolDescriptor extends ToolDescriptor {
  readonly serverId: string;
}

export interface McpResourceDescriptor extends MetadataCarrier {
  readonly serverId: string;
  readonly uri: string;
  readonly name?: string;
  readonly mimeType?: string;
}

export interface McpResourceContent {
  readonly descriptor: McpResourceDescriptor;
  readonly value: JsonValue;
}
