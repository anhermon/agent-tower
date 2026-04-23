"use client";

import type { ReplayCompactionEvent, ReplayTurn } from "@control-plane/core";
import dynamic from "next/dynamic";

// Defer recharts into a client-only chunk. The chart is below the fold and
// decorative, so CSR-only is acceptable and keeps recharts off the initial
// session-detail bundle.
const TokenAccumulationChart = dynamic(
  () => import("./token-accumulation-chart").then((m) => m.TokenAccumulationChart),
  {
    ssr: false,
    loading: () => (
      <div aria-busy="true" className="h-48 animate-pulse rounded-sm bg-white/[0.03]" />
    ),
  }
);

type Props = {
  readonly turns: readonly ReplayTurn[];
  readonly compactions: readonly ReplayCompactionEvent[];
};

export function TokenAccumulationChartLazy(props: Props) {
  return <TokenAccumulationChart {...props} />;
}
