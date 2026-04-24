import "server-only";

import { InMemoryEventBus, type EventEnvelope } from "@control-plane/events";

// Singleton event bus for the web app process
export const eventBus = new InMemoryEventBus<EventEnvelope>();
