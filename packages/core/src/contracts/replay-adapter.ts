import type { DomainEventEnvelope } from "../domain/events.js";
import type { ReplayFrame, ReplayRequest, ReplayResult } from "../domain/replay.js";
import type { AdapterContext, AdapterLifecycle, Subscription } from "./common.js";

export interface ReplayAdapter extends AdapterLifecycle {
  readonly prepare: (
    request: ReplayRequest,
    context?: AdapterContext
  ) => Promise<readonly DomainEventEnvelope[]>;
  readonly replay: (
    request: ReplayRequest,
    context?: AdapterContext
  ) => Promise<ReplayResult>;
  readonly subscribeFrames?: (
    requestId: string,
    onFrame: (frame: ReplayFrame) => Promise<void>,
    context?: AdapterContext
  ) => Promise<Subscription>;
}
