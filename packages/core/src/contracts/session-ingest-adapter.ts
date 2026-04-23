import type { AdapterContext, AdapterLifecycle } from "./common.js";
import type { DomainEventEnvelope, EventCursor } from "../domain/events.js";
import type { SessionDescriptor, SessionTurn } from "../domain/sessions.js";

export interface SessionIngestBatch {
  readonly session: SessionDescriptor;
  readonly turns?: readonly SessionTurn[];
  readonly events?: readonly DomainEventEnvelope[];
  readonly cursor?: EventCursor;
}

export interface SessionIngestResult {
  readonly sessionId: string;
  readonly acceptedTurnIds: readonly string[];
  readonly acceptedEventIds: readonly string[];
  readonly cursor?: EventCursor;
}

export interface SessionIngestAdapter extends AdapterLifecycle {
  readonly ingest: (
    batch: SessionIngestBatch,
    context?: AdapterContext
  ) => Promise<SessionIngestResult>;
}
