import { ModulePlaceholder } from "@/components/layout/module-placeholder";
import { getModuleByKey } from "@/lib/modules";
import { listMcpServers } from "@/lib/mcps-source";

export default async function McpsPage() {
  const mod = getModuleByKey("mcps");
  // Phase 1 — deferred. The result is always { ok: false, reason: "deferred" }.
  // TODO(Phase 2): await listMcpServers(); switch on result.ok to render
  // result.servers and result.tools via components/mcps/ instead of the
  // placeholder below.
  await listMcpServers();

  return (
    <ModulePlaceholder
      module={mod}
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
