import { AttributionTable } from "@/components/token-optimizer/attribution-table";
import { ToolGrid } from "@/components/token-optimizer/tool-grid";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/state";
import { getModuleByKey } from "@/lib/modules";
import { computeAttribution, listTools } from "@/lib/token-optimizer-source";

export const dynamic = "force-dynamic";

export default async function TokenOptimizerPage() {
  const mod = getModuleByKey("token-optimizer");

  const [tools, attribution] = await Promise.all([listTools(), computeAttribution()]);

  return (
    <section>
      <div className="mb-6">
        <p className="eyebrow">Module</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-ink md:text-[34px]">
            {mod.label}
          </h1>
          <Badge state={mod.status} />
        </div>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">{mod.description}</p>
      </div>

      <div className="mb-10">
        <div className="mb-4">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">Optimization tools</h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Toggle and tag each tool to track attribution.
          </p>
        </div>
        {tools.length === 0 ? (
          <EmptyState
            title="No tools registered"
            description="No token optimization tools are registered in the tool fleet."
          />
        ) : (
          <ToolGrid initialTools={tools} />
        )}
      </div>

      <div className="mt-10 border-t border-line/60 pt-8">
        <div className="mb-4">
          <h2 className="text-2xl font-semibold tracking-tight text-ink">
            Token attribution report
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            Estimated token savings per tool derived from session transcripts.
          </p>
        </div>
        {attribution.totalSessionsAnalyzed === 0 ? (
          <EmptyState
            title="No sessions analyzed"
            description="No Claude Code session transcripts were found. Set CLAUDE_CONTROL_PLANE_DATA_ROOT or create ~/.claude/projects to enable attribution analysis."
          />
        ) : (
          <AttributionTable report={attribution} />
        )}
      </div>
    </section>
  );
}
