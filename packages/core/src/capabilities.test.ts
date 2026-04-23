import { describe, expect, it } from "vitest";
import {
  AGENT_AGNOSTIC_CAPABILITIES,
  CLAUDE_FIRST_CAPABILITIES,
  CONTROL_PLANE_CAPABILITIES,
  DEFAULT_CONTROL_PLANE_CAPABILITIES,
  capabilitySet
} from "./capabilities.js";

describe("capability presets", () => {
  it("given_claude_first_and_agent_agnostic_presets__when_combined__then_defaults_include_both_sets", () => {
    expect(DEFAULT_CONTROL_PLANE_CAPABILITIES).toEqual([
      ...CLAUDE_FIRST_CAPABILITIES,
      ...AGENT_AGNOSTIC_CAPABILITIES
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
      optional: [CONTROL_PLANE_CAPABILITIES.Replay]
    });
  });
});
