import { describe, expect, it } from "vitest";
import {
  AGENT_AGNOSTIC_CAPABILITIES,
  CLAUDE_FIRST_CAPABILITIES,
  CONTROL_PLANE_CAPABILITIES,
  type ControlPlaneCapability,
  capabilitySet,
  DEFAULT_CONTROL_PLANE_CAPABILITIES,
} from "./capabilities.js";

describe("capability presets", () => {
  it("given_claude_first_and_agent_agnostic_presets__when_combined__then_defaults_include_both_sets", () => {
    expect(DEFAULT_CONTROL_PLANE_CAPABILITIES).toEqual([
      ...CLAUDE_FIRST_CAPABILITIES,
      ...AGENT_AGNOSTIC_CAPABILITIES,
    ]);
  });

  it("given_required_and_optional_capabilities__when_creating_a_set__then_the_shape_is_stable", () => {
    expect(
      capabilitySet(
        [CONTROL_PLANE_CAPABILITIES.SessionStreaming],
        [CONTROL_PLANE_CAPABILITIES.Replay]
      )
    ).toEqual({
      required: [CONTROL_PLANE_CAPABILITIES.SessionStreaming],
      optional: [CONTROL_PLANE_CAPABILITIES.Replay],
    });
  });

  it("given_every_capability_literal__when_enumerated__then_the_union_stays_exhaustive", () => {
    // A change in the capability union should force an update here — that's
    // the whole point of the exhaustive list below.
    const every: readonly ControlPlaneCapability[] = [
      "session.streaming",
      "session-analytics",
      "tool.calling",
      "mcp.client",
      "runtime.control",
      "channel.ingress",
      "channel.egress",
      "pricing",
      "replay",
      "webhooks",
      "tickets",
      "skills",
    ];
    expect(new Set(every)).toEqual(new Set(Object.values(CONTROL_PLANE_CAPABILITIES)));
    expect(every).toHaveLength(Object.values(CONTROL_PLANE_CAPABILITIES).length);
  });

  it("given_session_analytics_capability__when_present_in_defaults__then_consumers_can_rely_on_it", () => {
    expect(CONTROL_PLANE_CAPABILITIES.SessionAnalytics).toBe("session-analytics");
    expect(AGENT_AGNOSTIC_CAPABILITIES).toContain(CONTROL_PLANE_CAPABILITIES.SessionAnalytics);
    expect(DEFAULT_CONTROL_PLANE_CAPABILITIES).toContain(
      CONTROL_PLANE_CAPABILITIES.SessionAnalytics
    );
  });
});
