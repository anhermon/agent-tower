import type {
  EventEnvelope,
  EventHandler,
  EventPublishOptions,
  EventSubscription,
  EventSubscriptionFilter,
  EventType,
} from "./types.js";

export interface EventBus<TEvent extends EventEnvelope = EventEnvelope> {
  publish(event: TEvent, options?: EventPublishOptions): Promise<void>;
  publishMany(events: readonly TEvent[], options?: EventPublishOptions): Promise<void>;
  subscribe(
    handler: EventHandler<TEvent>,
    filter?: EventSubscriptionFilter<TEvent["type"]>
  ): EventSubscription;
}

interface RegisteredSubscription<TEvent extends EventEnvelope> {
  readonly subscription: EventSubscription;
  readonly handler: EventHandler<TEvent>;
  readonly filter?: EventSubscriptionFilter<TEvent["type"]>;
}

export class InMemoryEventBus<TEvent extends EventEnvelope = EventEnvelope>
  implements EventBus<TEvent>
{
  private nextSubscriptionId = 1;
  private readonly subscriptions = new Map<string, RegisteredSubscription<TEvent>>();

  async publish(event: TEvent, options?: EventPublishOptions): Promise<void> {
    throwIfAborted(options);

    const handlers = Array.from(this.subscriptions.values()).filter((entry) =>
      eventMatchesFilter(event, entry.filter)
    );

    for (const entry of handlers) {
      throwIfAborted(options);
      await entry.handler(event);
    }
  }

  async publishMany(events: readonly TEvent[], options?: EventPublishOptions): Promise<void> {
    for (const event of events) {
      await this.publish(event, options);
    }
  }

  subscribe(
    handler: EventHandler<TEvent>,
    filter?: EventSubscriptionFilter<TEvent["type"]>
  ): EventSubscription {
    const id = String(this.nextSubscriptionId++);
    const subscription: EventSubscription = {
      id,
      unsubscribe: () => {
        this.subscriptions.delete(id);
      },
    };

    this.subscriptions.set(id, {
      subscription,
      handler,
      ...(filter ? { filter } : {}),
    });
    return subscription;
  }

  clear(): void {
    this.subscriptions.clear();
  }

  get subscriptionCount(): number {
    return this.subscriptions.size;
  }
}

export function eventMatchesFilter<TEvent extends EventEnvelope>(
  event: TEvent,
  filter?: EventSubscriptionFilter<EventType>
): boolean {
  if (!filter) {
    return true;
  }

  if (filter.types && !filter.types.includes(event.type)) {
    return false;
  }

  if (filter.sourceKinds && !filter.sourceKinds.includes(event.source.kind)) {
    return false;
  }

  if (filter.sourceIds && !filter.sourceIds.includes(event.source.id)) {
    return false;
  }

  return true;
}

function throwIfAborted(options?: EventPublishOptions): void {
  if (options?.signal?.aborted) {
    throw new DOMException("Event publish aborted.", "AbortError");
  }
}
