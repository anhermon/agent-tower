import { InMemoryEventBus } from "@control-plane/events";
import type { EventEnvelope } from "@control-plane/events";

// Singleton event bus for the web app process
export const eventBus = new InMemoryEventBus<EventEnvelope>();
