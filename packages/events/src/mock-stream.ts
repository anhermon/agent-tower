import {
  ControlPlaneEventType,
  EVENT_ENVELOPE_VERSION,
  type EventEnvelope,
  type EventMetadata,
  EventSourceKind,
  type EventStream,
  type EventType,
} from "./types.js";

export interface MockEventEnvelopeOptions<
  TType extends EventType = ControlPlaneEventType.AuditEntryRecorded,
  TPayload = Readonly<Record<string, unknown>>,
  TMetadata extends EventMetadata = EventMetadata,
> {
  readonly id?: string;
  readonly type?: TType;
  readonly payload?: TPayload;
  readonly occurredAt?: string;
  readonly sourceKind?: EventSourceKind;
  readonly sourceId?: string;
  readonly metadata?: TMetadata;
  readonly correlationId?: string;
  readonly causationId?: string;
}

export function createMockEventEnvelope<
  TType extends EventType = ControlPlaneEventType.AuditEntryRecorded,
  TPayload = Readonly<Record<string, unknown>>,
  TMetadata extends EventMetadata = EventMetadata,
>(
  options: MockEventEnvelopeOptions<TType, TPayload, TMetadata> = {}
): EventEnvelope<TType, TPayload, TMetadata> {
  const id = options.id ?? `event-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const event: EventEnvelope<TType, TPayload, TMetadata> = {
    id,
    type: options.type ?? (ControlPlaneEventType.AuditEntryRecorded as TType),
    version: EVENT_ENVELOPE_VERSION,
    occurredAt: options.occurredAt ?? new Date().toISOString(),
    source: {
      kind: options.sourceKind ?? EventSourceKind.System,
      id: options.sourceId ?? "mock",
    },
    payload: options.payload ?? ({} as TPayload),
  };

  return withOptionalEventFields(event, options);
}

function withOptionalEventFields<
  TType extends EventType,
  TPayload,
  TMetadata extends EventMetadata,
>(
  event: EventEnvelope<TType, TPayload, TMetadata>,
  options: MockEventEnvelopeOptions<TType, TPayload, TMetadata>
): EventEnvelope<TType, TPayload, TMetadata> {
  return {
    ...event,
    ...(options.metadata ? { metadata: options.metadata } : {}),
    ...(options.correlationId ? { correlationId: options.correlationId } : {}),
    ...(options.causationId ? { causationId: options.causationId } : {}),
  };
}

export function createMockEventStream<TEvent extends EventEnvelope>(
  events: readonly TEvent[]
): EventStream<TEvent> {
  // Reason: preserve the AsyncIterable contract without `async function*`
  // (which would require an `await` the body doesn't need). A plain sync
  // iterator is wrapped into an AsyncIterable via an inline adapter.
  const iter = events[Symbol.iterator]();
  const asyncIter: AsyncIterator<TEvent> = {
    next(): Promise<IteratorResult<TEvent>> {
      return Promise.resolve(iter.next());
    },
  };
  return {
    [Symbol.asyncIterator]() {
      return asyncIter;
    },
  };
}

export async function collectEventStream<TEvent>(
  stream: AsyncIterable<TEvent>
): Promise<readonly TEvent[]> {
  const events: TEvent[] = [];

  for await (const event of stream) {
    events.push(event);
  }

  return events;
}
