import type { TokenAttributionReport } from "@control-plane/core";

interface AttributionTableProps {
  report: TokenAttributionReport;
}

export function AttributionTable({ report }: AttributionTableProps) {
  const { rows, totalEstimatedSavings } = report;

  const totalSessions = rows.reduce((sum, r) => sum + r.sessionsObserved, 0);
  const totalToolCalls = rows.reduce((sum, r) => sum + r.toolCallsObserved, 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line/60 text-left text-xs text-muted">
            <th className="pb-2 pr-4 font-medium">Tool</th>
            <th className="pb-2 pr-4 font-medium">Sessions</th>
            <th className="pb-2 pr-4 font-medium">Tool Calls</th>
            <th className="pb-2 pr-4 font-medium text-right">Est. Savings (tokens)</th>
            <th className="pb-2 pr-4 font-medium text-right">% Reduction</th>
            <th className="pb-2 font-medium">Evidence</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line/40">
          {rows.map((row) => (
            <tr key={row.toolId} className="text-ink/90">
              <td className="py-2 pr-4 font-medium text-ink">{row.toolName}</td>
              <td className="py-2 pr-4 tabular-nums text-muted">{row.sessionsObserved}</td>
              <td className="py-2 pr-4 tabular-nums text-muted">{row.toolCallsObserved}</td>
              <td className="py-2 pr-4 tabular-nums text-right">
                {row.estimatedTokensSaved.toLocaleString()}
              </td>
              <td className="py-2 pr-4 tabular-nums text-right text-muted">
                {row.percentReduction > 0 ? `${row.percentReduction.toFixed(2)}%` : "—"}
              </td>
              <td className="py-2 max-w-xs text-xs leading-5 text-muted">{row.evidence}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-line/60 text-xs font-medium text-muted">
            <td className="pt-2 pr-4 text-ink">Totals</td>
            <td className="pt-2 pr-4 tabular-nums">{totalSessions}</td>
            <td className="pt-2 pr-4 tabular-nums">{totalToolCalls}</td>
            <td className="pt-2 pr-4 tabular-nums text-right">
              {totalEstimatedSavings.toLocaleString()}
            </td>
            <td className="pt-2 pr-4" />
            <td className="pt-2" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
