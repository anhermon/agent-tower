import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { agentsListTool } from "./tools/agents-list.js";
import { controlPlaneAuditTool } from "./tools/audit.js";
import { healthTool } from "./tools/health.js";
import { sessionsShowTool } from "./tools/sessions-show.js";
import { sessionsTopTool } from "./tools/sessions-top.js";
import { sessionsWasteTool } from "./tools/sessions-waste.js";
import { skillsEfficacyTool } from "./tools/skills-efficacy.js";
import { skillsHousekeepTool } from "./tools/skills-housekeep.js";
import { skillsTopTool } from "./tools/skills-top.js";
import { skillsUsageTool } from "./tools/skills-usage.js";

import type { ToolDefinition } from "./tools/types.js";

export const REGISTERED_TOOLS: readonly ToolDefinition[] = [
  healthTool,
  sessionsTopTool,
  sessionsShowTool,
  sessionsWasteTool,
  skillsTopTool,
  skillsUsageTool,
  skillsEfficacyTool,
  skillsHousekeepTool,
  agentsListTool,
  controlPlaneAuditTool,
];

export interface CreateServerOptions {
  readonly name?: string;
  readonly version?: string;
}

/**
 * Builds a low-level MCP `Server` with every control-plane tool registered.
 *
 * The caller is responsible for attaching a transport (e.g. stdio) and
 * invoking `connect()`. Tool handlers are imported directly from
 * `@control-plane/adapter-claude-code` and return read-only payloads.
 */
export function createServer(options: CreateServerOptions = {}): Server {
  const server = new Server(
    {
      name: options.name ?? "@control-plane/mcp-server",
      version: options.version ?? "0.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  const byName = new Map<string, ToolDefinition>();
  for (const tool of REGISTERED_TOOLS) byName.set(tool.name, tool);

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: REGISTERED_TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = byName.get(name);
    if (!tool) {
      const errorPayload = {
        ok: false as const,
        reason: "unknown_tool",
        message: `No tool registered with name ${name}`,
      };
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(errorPayload),
          },
        ],
      };
    }

    const result = await tool.handler(args ?? {});
    return {
      isError: result.ok === false,
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result),
        },
      ],
    };
  });

  return server;
}

export { agentsListTool } from "./tools/agents-list.js";
export { controlPlaneAuditTool } from "./tools/audit.js";
export { healthTool } from "./tools/health.js";
export { sessionsShowTool } from "./tools/sessions-show.js";
export { sessionsTopTool } from "./tools/sessions-top.js";
export { sessionsWasteTool } from "./tools/sessions-waste.js";
export { skillsEfficacyTool } from "./tools/skills-efficacy.js";
export { skillsHousekeepTool } from "./tools/skills-housekeep.js";
export { skillsTopTool } from "./tools/skills-top.js";
export { skillsUsageTool } from "./tools/skills-usage.js";
export type { JsonSchemaObject, ToolDefinition, ToolResult } from "./tools/types.js";
