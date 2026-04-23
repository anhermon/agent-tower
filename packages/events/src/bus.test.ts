import { describe, expect, it } from "vitest";
import { InMemoryEventBus } from "./bus.js";
import { createMockEventEnvelope } from "./mock-stream.js";
import { ControlPlaneEventType, EventSourceKind } from "./types.js";

describe("InMemoryEventBus", () => {
  it("given_a_filtered_subscription__when_events_are_published__then_only_matching_events_are_delivered", async () => {
    const bus = new InMemoryEventBus();
    const delivered: string[] = [];

    bus.subscribe(
      (event) => {
        delivered.push(event.id);
      },
      {
        types: [ControlPlaneEventType.WebhookReceived],
        sourceKinds: [EventSourceKind.Webhook],
      }
    );

    await bus.publish(
      createMockEventEnvelope({
        id: "event-webhook",
        type: ControlPlaneEventType.WebhookReceived,
        sourceKind: EventSourceKind.Webhook,
      })
    );
    await bus.publish(
      createMockEventEnvelope({
        id: "event-session",
        type: ControlPlaneEventType.SessionStarted,
        sourceKind: EventSourceKind.Session,
      })
    );

    expect(delivered).toEqual(["event-webhook"]);
  });
});
