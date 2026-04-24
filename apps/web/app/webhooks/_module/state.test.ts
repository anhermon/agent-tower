import { describe, expect, it } from "vitest";

import {
  createDefaultWebhookDraft,
  createObservedWebhookEvent,
  filterObservedWebhookEvents,
  registerWebhookIntegration,
  switchWebhookDraftProvider,
  toggleWebhookDraftEvent,
  validateWebhookDraft,
} from "./state";
import { WEBHOOK_PROVIDER_IDS } from "./types";

describe("webhook workbench state", () => {
  it("given_default_draft__when_validated__then_it_can_register_without_agent_handoff", () => {
    const draft = createDefaultWebhookDraft();

    expect(draft.providerId).toBe(WEBHOOK_PROVIDER_IDS.GitHub);
    expect(draft.routeMode).toBe("normalize_and_queue");
    expect(validateWebhookDraft(draft)).toEqual({ ok: true, message: null });
  });

  it("given_provider_switch__when_slack_is_selected__then_event_selection_is_provider_specific", () => {
    const githubDraft = createDefaultWebhookDraft();
    const slackDraft = switchWebhookDraftProvider(githubDraft, WEBHOOK_PROVIDER_IDS.Slack);

    expect(slackDraft.providerId).toBe(WEBHOOK_PROVIDER_IDS.Slack);
    expect(slackDraft.selectedEventIds).toEqual(["message.channels", "app_mention.created"]);
    expect(slackDraft.routeMode).toBe(githubDraft.routeMode);
  });

  it("given_no_selected_events__when_validated__then_registration_is_blocked", () => {
    const draft = createDefaultWebhookDraft();
    const [firstEvent] = draft.selectedEventIds;

    const withoutFirst = toggleWebhookDraftEvent(draft, firstEvent);
    const withoutAny = toggleWebhookDraftEvent(withoutFirst, draft.selectedEventIds[1]);

    expect(validateWebhookDraft(withoutAny)).toEqual({
      ok: false,
      message: "Select at least one event.",
    });
  });

  it("given_registered_integration__when_test_event_is_created__then_timeline_has_route_detail", () => {
    const integration = registerWebhookIntegration({
      draft: createDefaultWebhookDraft(),
      sequence: 1,
      now: new Date("2026-04-24T10:00:00.000Z"),
    });

    const event = createObservedWebhookEvent({
      integration,
      eventId: integration.selectedEventIds[0],
      sequence: 1,
      now: new Date("2026-04-24T10:01:00.000Z"),
    });

    expect(event.providerLabel).toBe("GitHub");
    expect(event.status).toBe("routed");
    expect(event.timeline.map((step) => step.label)).toEqual([
      "Received provider event",
      "Verified registration",
      "Matched route",
      "Queued canonical event",
    ]);
    expect(event.payload).toMatchObject({
      provider: "github",
      receiver: "/api/webhooks/github",
    });
  });

  it("given_observed_events__when_filtered__then_provider_status_and_query_are_applied", () => {
    const github = registerWebhookIntegration({
      draft: createDefaultWebhookDraft(WEBHOOK_PROVIDER_IDS.GitHub),
      sequence: 1,
      now: new Date("2026-04-24T10:00:00.000Z"),
    });
    const slack = registerWebhookIntegration({
      draft: createDefaultWebhookDraft(WEBHOOK_PROVIDER_IDS.Slack),
      sequence: 2,
      now: new Date("2026-04-24T10:00:00.000Z"),
    });
    const events = [
      createObservedWebhookEvent({
        integration: github,
        eventId: github.selectedEventIds[0],
        sequence: 1,
        now: new Date("2026-04-24T10:01:00.000Z"),
      }),
      createObservedWebhookEvent({
        integration: { ...slack, enabled: false },
        eventId: slack.selectedEventIds[0],
        sequence: 2,
        now: new Date("2026-04-24T10:02:00.000Z"),
      }),
    ];

    const filtered = filterObservedWebhookEvents(events, {
      providerId: WEBHOOK_PROVIDER_IDS.Slack,
      status: "failed",
      query: "channel",
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.providerLabel).toBe("Slack");
    expect(filtered[0]?.status).toBe("failed");
  });
});
