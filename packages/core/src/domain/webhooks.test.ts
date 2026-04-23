import { describe, expect, it } from "vitest";

import {
  WEBHOOK_EVENT_TYPES,
  type WebhookDelivery,
  type WebhookEventType,
  type WebhookSubscription,
} from "./webhooks.js";

describe("webhook canonical types", () => {
  it("given_the_event_type_enum__when_reading_its_keys__then_every_documented_event_is_present", () => {
    const expected: readonly WebhookEventType[] = [
      "agent.changed",
      "session.changed",
      "session.turn_created",
      "tool_call.changed",
      "cost.recorded",
      "ticket.changed",
      "replay.completed",
    ];
    // Values should be exactly the documented set — no more, no less.
    expect(new Set(Object.values(WEBHOOK_EVENT_TYPES))).toEqual(new Set(expected));
  });

  it("given_a_subscription_without_a_display_name__when_typed__then_the_value_is_accepted", () => {
    const subscription: WebhookSubscription = {
      id: "sub-1",
      url: "https://example.test/hook",
      eventTypes: [WEBHOOK_EVENT_TYPES.SessionChanged],
      enabled: true,
      createdAt: "2026-04-23T10:00:00.000Z",
    };
    expect(subscription.displayName).toBeUndefined();
    expect(subscription.eventTypes).toHaveLength(1);
  });

  it("given_a_subscription_with_display_name_and_secret_ref__when_typed__then_the_fields_survive", () => {
    const subscription: WebhookSubscription = {
      id: "sub-2",
      displayName: "Staging: session updates",
      url: "https://staging.example.test/hook",
      eventTypes: [WEBHOOK_EVENT_TYPES.SessionChanged, WEBHOOK_EVENT_TYPES.SessionTurnCreated],
      enabled: false,
      secretRef: "env:STAGING_WEBHOOK_SECRET",
      createdAt: "2026-04-23T10:00:00.000Z",
    };
    expect(subscription.displayName).toBe("Staging: session updates");
    expect(subscription.secretRef).toBe("env:STAGING_WEBHOOK_SECRET");
  });

  it("given_a_delivery__when_typed__then_status_is_one_of_the_allowed_literals", () => {
    const delivery: WebhookDelivery = {
      id: "del-1",
      subscriptionId: "sub-1",
      eventType: WEBHOOK_EVENT_TYPES.SessionChanged,
      attemptedAt: "2026-04-23T10:00:00.000Z",
      status: "delivered",
      responseStatus: 200,
    };
    expect(delivery.status).toBe("delivered");
  });
});
