import { eventMatchesFilter } from "./bus.js";
import type { AsyncEventStream, EventEnvelope, EventSubscriptionFilter } from "./types.js";

export const EVENT_LOG_START_CURSOR = "0" as const;

export enum EventLogReadDirection {
  Forward = "forward",
  Backward = "backward",
}

export interface EventLogRecord<TEvent extends EventEnvelope = EventEnvelope> {
  readonly sequence: number;
  readonly cursor: string;
  readonly event: TEvent;
  readonly appendedAt: string;
}

export interface EventLogAppendResult<TEvent extends EventEnvelope = EventEnvelope> {
  readonly record: EventLogRecord<TEvent>;
}

export interface EventLogReadOptions<TEvent extends EventEnvelope = EventEnvelope> {
  readonly afterCursor?: string;
  readonly limit?: number;
  readonly direction?: EventLogReadDirection;
  readonly filter?: EventSubscriptionFilter<TEvent["type"]>;
}

export interface AppendOnlyEventLog<TEvent extends EventEnvelope = EventEnvelope> {
  append(event: TEvent): Promise<EventLogAppendResult<TEvent>>;
  appendMany(events: readonly TEvent[]): Promise<readonly EventLogAppendResult<TEvent>[]>;
  read(options?: EventLogReadOptions<TEvent>): Promise<readonly EventLogRecord<TEvent>[]>;
  stream(options?: EventLogReadOptions<TEvent>): AsyncEventStream<EventLogRecord<TEvent>>;
}

export class InMemoryAppendOnlyEventLog<TEvent extends EventEnvelope = EventEnvelope>
  implements AppendOnlyEventLog<TEvent>
{
  private readonly records: EventLogRecord<TEvent>[] = [];

  append(event: TEvent): Promise<EventLogAppendResult<TEvent>> {
    const sequence = this.records.length + 1;
    const record: EventLogRecord<TEvent> = {
      sequence,
      cursor: String(sequence),
      event,
      appendedAt: new Date().toISOString(),
    };

    this.records.push(record);
    return Promise.resolve({ record });
  }

  async appendMany(events: readonly TEvent[]): Promise<readonly EventLogAppendResult<TEvent>[]> {
    const results: EventLogAppendResult<TEvent>[] = [];

    for (const event of events) {
      results.push(await this.append(event));
    }

    return results;
  }

  read(options: EventLogReadOptions<TEvent> = {}): Promise<readonly EventLogRecord<TEvent>[]> {
    const afterSequence = cursorToSequence(options.afterCursor);
    const hasCursor = Boolean(options.afterCursor);
    const direction = options.direction ?? EventLogReadDirection.Forward;
    const orderedRecords =
      direction === EventLogReadDirection.Forward
        ? this.records
        : Array.from(this.records).reverse();

    const filtered = orderedRecords.filter((record) => {
      if (
        hasCursor &&
        direction === EventLogReadDirection.Forward &&
        record.sequence <= afterSequence
      ) {
        return false;
      }

      if (
        hasCursor &&
        direction === EventLogReadDirection.Backward &&
        record.sequence >= afterSequence
      ) {
        return false;
      }

      return eventMatchesFilter(record.event, options.filter);
    });

    return Promise.resolve(
      typeof options.limit === "number" ? filtered.slice(0, options.limit) : filtered
    );
  }

  async *stream(
    options: EventLogReadOptions<TEvent> = {}
  ): AsyncEventStream<EventLogRecord<TEvent>> {
    for (const record of await this.read(options)) {
      yield record;
    }
  }

  clear(): void {
    this.records.length = 0;
  }
}

function cursorToSequence(cursor?: string): number {
  if (!cursor || cursor === EVENT_LOG_START_CURSOR) {
    return 0;
  }

  const sequence = Number.parseInt(cursor, 10);
  return Number.isFinite(sequence) ? sequence : 0;
}
