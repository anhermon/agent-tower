import type { JsonObject } from "../domain/common.js";

export interface AdapterContext {
  readonly requestId?: string;
  readonly actorId?: string;
  readonly deadlineAt?: string;
  readonly metadata?: JsonObject;
}

export interface AdapterHealth {
  readonly status: "healthy" | "degraded" | "unhealthy";
  readonly checkedAt: string;
  readonly message?: string;
  readonly details?: JsonObject;
}

export interface AdapterLifecycle {
  readonly health?: (context?: AdapterContext) => Promise<AdapterHealth>;
  readonly dispose?: () => Promise<void>;
}

export interface Subscription {
  readonly unsubscribe: () => Promise<void>;
}
