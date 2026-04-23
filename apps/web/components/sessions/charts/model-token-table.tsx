import type { ModelCostBreakdown } from "@control-plane/core";

import { formatCost, formatTokens } from "@/lib/format";

interface Props {
  readonly models: readonly ModelCostBreakdown[];
}

function shortModel(m: string): string {
  if (m.includes("opus-4-7")) return "claude-opus-4.7";
  if (m.includes("opus-4-6")) return "claude-opus-4.6";
  if (m.includes("opus-4-5")) return "claude-opus-4.5";
  if (m.includes("sonnet-4-6")) return "claude-sonnet-4.6";
  if (m.includes("sonnet-4-5")) return "claude-sonnet-4.5";
  if (m.includes("haiku-4-5")) return "claude-haiku-4.5";
  if (m.includes("haiku-4-6")) return "claude-haiku-4.6";
  return m;
}

export function ModelTokenTable({ models }: Props) {
  if (models.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-sm border border-dashed border-line/60 text-sm text-muted">
        No per-model usage recorded yet
      </div>
    );
  }
  const totals = models.reduce(
    (acc, m) => ({
      input: acc.input + m.usage.inputTokens,
      output: acc.output + m.usage.outputTokens,
      cacheWrite: acc.cacheWrite + m.usage.cacheCreationInputTokens,
      cacheRead: acc.cacheRead + m.usage.cacheReadInputTokens,
      cost: acc.cost + m.estimatedCostUsd,
    }),
    { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, cost: 0 }
  );

  const headers = ["Model", "Input", "Output", "Cache W", "Cache R", "Cost"];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px] font-mono">
        <thead>
          <tr className="border-b border-line/70">
            {headers.map((h) => (
              <th
                key={h}
                scope="col"
                className={`eyebrow py-2 ${h === "Model" ? "text-left" : "text-right"}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {models.map((m) => (
            <tr key={m.model} className="border-b border-line/30 hover:bg-soft/30">
              <td className="py-2 text-ink/80">{shortModel(m.model)}</td>
              <td className="py-2 text-right text-info">{formatTokens(m.usage.inputTokens)}</td>
              <td className="py-2 text-right" style={{ color: "#d97706" }}>
                {formatTokens(m.usage.outputTokens)}
              </td>
              <td className="py-2 text-right" style={{ color: "#a78bfa" }}>
                {formatTokens(m.usage.cacheCreationInputTokens)}
              </td>
              <td className="py-2 text-right text-ok">
                {formatTokens(m.usage.cacheReadInputTokens)}
              </td>
              <td className="py-2 text-right font-bold" style={{ color: "#d97706" }}>
                {formatCost(m.estimatedCostUsd)}
              </td>
            </tr>
          ))}
          <tr className="border-t border-line/60 font-bold">
            <td className="py-2 text-muted">TOTAL</td>
            <td className="py-2 text-right text-info">{formatTokens(totals.input)}</td>
            <td className="py-2 text-right" style={{ color: "#d97706" }}>
              {formatTokens(totals.output)}
            </td>
            <td className="py-2 text-right" style={{ color: "#a78bfa" }}>
              {formatTokens(totals.cacheWrite)}
            </td>
            <td className="py-2 text-right text-ok">{formatTokens(totals.cacheRead)}</td>
            <td className="py-2 text-right" style={{ color: "#d97706" }}>
              {formatCost(totals.cost)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
