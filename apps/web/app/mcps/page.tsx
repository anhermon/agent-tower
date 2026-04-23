import { ModulePlaceholder } from "@/components/layout/module-placeholder";
import { getModuleByKey } from "@/lib/modules";

export default function McpsPage() {
  const module = getModuleByKey("mcps");

  return (
    <ModulePlaceholder
      module={module}
      description="Connector servers, tools, and resources exposed via the Model Context Protocol. Once wired, this module will manage active MCP servers, route tool calls by capability, discover advertised tools and resources, and surface server health."
      emptyTitle="No MCP servers"
      emptyDescription="MCP server registration, capability discovery, and health checks are deferred beyond Phase 1. This module is awaiting an MCP registry adapter — see the spec for the full scope."
      capabilities={[
        { label: "Servers", detail: "Awaiting adapter" },
        { label: "Tools exposed", detail: "Awaiting adapter" },
        { label: "Resources", detail: "Awaiting adapter" },
        { label: "Health", detail: "Awaiting adapter" },
      ]}
    />
  );
}
