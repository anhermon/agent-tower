import { ModulePlaceholder } from "@/components/layout/module-placeholder";
import { getModuleByKey } from "@/lib/modules";

export default function ReplayPage() {
  const module = getModuleByKey("replay");

  return (
    <ModulePlaceholder
      module={module}
      description="Event replay controls and deterministic trace inspection. Once wired, this module will reconstruct reasoning-visible timelines from normalized session turns, tool calls, outputs, and adapter-specific metadata — and let operators scrub, branch, and re-run frames."
      emptyTitle="No replay records"
      emptyDescription="Trace reconstruction and deterministic replay are deferred beyond Phase 1. This module is awaiting an append-only event log source — see the spec for the full scope."
      capabilities={[
        { label: "Traces", detail: "Awaiting adapter" },
        { label: "Frames", detail: "Awaiting adapter" },
        { label: "Branches", detail: "Awaiting adapter" },
        { label: "Source", detail: "Awaiting adapter" },
      ]}
    />
  );
}
