import type { AdapterContext, AdapterLifecycle } from "./common.js";
import type { JsonValue } from "../domain/common.js";
import type {
  McpResourceContent,
  McpResourceDescriptor,
  McpServerDescriptor,
  McpToolDescriptor,
} from "../domain/mcps.js";
import type { ToolResult } from "../domain/tools.js";

export interface McpToolCallRequest {
  readonly serverId: string;
  readonly toolName: string;
  readonly input: JsonValue;
  readonly sessionId?: string;
}

export interface McpAdapter extends AdapterLifecycle {
  readonly describeServer: (
    serverId: string,
    context?: AdapterContext
  ) => Promise<McpServerDescriptor>;
  readonly listTools: (
    serverId: string,
    context?: AdapterContext
  ) => Promise<readonly McpToolDescriptor[]>;
  readonly callTool: (request: McpToolCallRequest, context?: AdapterContext) => Promise<ToolResult>;
  readonly listResources: (
    serverId: string,
    context?: AdapterContext
  ) => Promise<readonly McpResourceDescriptor[]>;
  readonly readResource: (
    descriptor: McpResourceDescriptor,
    context?: AdapterContext
  ) => Promise<McpResourceContent>;
}
