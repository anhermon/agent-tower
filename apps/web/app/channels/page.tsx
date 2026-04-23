import { ModulePlaceholder } from "@/components/layout/module-placeholder";
import { getModuleByKey } from "@/lib/modules";

export default function ChannelsPage() {
  const module = getModuleByKey("channels");

  return (
    <ModulePlaceholder
      module={module}
      description="External message routes — Slack, Discord, WhatsApp, Telegram, GitHub, Bitbucket, and Jira listeners. Once wired, this module will define fan-out rules, map incoming events to sessions and replay traces, and surface delivery health per channel."
      emptyTitle="No channels connected"
      emptyDescription="Listener registration, fan-out rules, and credential management are deferred beyond Phase 1. This module is awaiting per-channel adapters — see the spec for the full scope."
      capabilities={[
        { label: "Connected", detail: "Awaiting adapter" },
        { label: "Routes", detail: "Awaiting adapter" },
        { label: "Messages in", detail: "Awaiting adapter" },
        { label: "Delivery health", detail: "Awaiting adapter" },
      ]}
    />
  );
}
