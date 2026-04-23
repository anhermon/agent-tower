import type { AdapterContext, AdapterLifecycle } from "./common.js";
import type { CostEstimate, CostLineItem, PricingRule, UsageMetric } from "../domain/costs.js";

export interface PricingQuoteRequest {
  readonly sourceId: string;
  readonly sourceType: CostLineItem["sourceType"];
  readonly runtime?: string;
  readonly model?: string;
  readonly usage: readonly UsageMetric[];
}

export interface PricingAdapter extends AdapterLifecycle {
  readonly listRules: (context?: AdapterContext) => Promise<readonly PricingRule[]>;
  readonly estimate: (
    request: PricingQuoteRequest,
    context?: AdapterContext
  ) => Promise<CostEstimate>;
  readonly record: (
    estimate: CostEstimate,
    context?: AdapterContext
  ) => Promise<readonly CostLineItem[]>;
}
