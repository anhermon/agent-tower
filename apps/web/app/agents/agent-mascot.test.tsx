/* @vitest-environment jsdom */

import {
  AGENT_ANIMATION_BASE_STATES,
  AGENT_ANIMATION_OVERLAYS,
  AGENT_FATIGUE_LEVELS,
  AGENT_STATUSES,
  type AgentAnimationBaseState,
  type AgentAnimationSnapshot,
  type AgentState,
} from "@control-plane/core";
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { AgentMascot, type MascotManifest } from "@/components/agents/agent-mascot";

const AGENT_ID = "claude-code:-Users-agent-card";
const PROJECT_ID = "-Users-agent-card";
const SESSION_ID = "33333333-4444-5555-6666-777777777777";

describe("AgentMascot", () => {
  afterEach(cleanup);

  it.each([
    AGENT_ANIMATION_BASE_STATES.Sleeping,
    AGENT_ANIMATION_BASE_STATES.Working,
    AGENT_ANIMATION_BASE_STATES.Attention,
    AGENT_ANIMATION_BASE_STATES.Done,
    AGENT_ANIMATION_BASE_STATES.Failed,
  ])("given_%s_base_state__when_rendered__then_accessible_label_and_dimensions_are_stable", (baseState) => {
    render(<AgentMascot agentState={agentState()} snapshot={snapshot(baseState)} />);

    const mascot = screen.getByRole("img", {
      name: `Clawd is ${baseState}`,
    });

    expect(mascot.getAttribute("data-base-state")).toBe(baseState);
    expect(mascot.className).toContain("agent-mascot--card");
  });

  it("given_reduced_motion__when_working__then_looping_class_is_disabled", () => {
    render(
      <AgentMascot
        agentState={agentState({ activeSessionIds: [SESSION_ID] })}
        snapshot={snapshot(AGENT_ANIMATION_BASE_STATES.Working)}
        reducedMotion
      />
    );

    const mascot = screen.getByRole("img", { name: "Clawd is working" });
    expect(mascot.className).not.toContain("is-looping");
    expect(mascot.className).toContain("agent-mascot--reduced-motion");
  });

  it("given_missing_optional_assets__when_overlay_is_present__then_base_parts_render_without_crashing", () => {
    const { container } = render(
      <AgentMascot
        agentState={agentState({ activeSessionIds: [SESSION_ID] })}
        snapshot={{
          ...snapshot(AGENT_ANIMATION_BASE_STATES.Attention),
          overlay: AGENT_ANIMATION_OVERLAYS.Permission,
          fatigueLevel: AGENT_FATIGUE_LEVELS.Tired,
        }}
        assetManifest={manifestWithoutOptionalAssets}
      />
    );

    const mascot = screen.getByRole("img", {
      name: "Clawd needs permission",
    });
    expect(mascot.getAttribute("data-overlay")).toBe(AGENT_ANIMATION_OVERLAYS.Permission);
    // Base parts: shadow, body, leftArm, rightArm, head, eyes, mouth.
    // The laptop prop is gated on `props.laptop` being defined, and this
    // manifest intentionally omits it, so we expect exactly 7 <img>s.
    expect(container.querySelectorAll("img")).toHaveLength(7);
  });
});

function agentState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    agentId: AGENT_ID,
    status: AGENT_STATUSES.Available,
    activeSessionIds: [],
    ...overrides,
  };
}

function snapshot(baseState: AgentAnimationBaseState): AgentAnimationSnapshot {
  return {
    agentId: AGENT_ID,
    projectId: PROJECT_ID,
    baseState,
    overlay: AGENT_ANIMATION_OVERLAYS.None,
    fatigueLevel: AGENT_FATIGUE_LEVELS.Fresh,
    activeSessionIds: baseState === AGENT_ANIMATION_BASE_STATES.Working ? [SESSION_ID] : [],
    subagentCount: 0,
    lastEventAt: "2026-04-23T10:00:00.000Z",
  };
}

const manifestWithoutOptionalAssets: MascotManifest = {
  name: "Test Clawd",
  parts: {
    shadow: "/shadow.svg",
    body: "/body.svg",
    head: "/head.svg",
    leftArm: "/left-arm.svg",
    rightArm: "/right-arm.svg",
  },
  eyes: {
    open: "/eyes-open.svg",
    closed: "/eyes-closed.svg",
    happy: "/eyes-happy.svg",
    worried: "/eyes-worried.svg",
    wide: "/eyes-wide.svg",
  },
  mouths: {
    neutral: "/mouth-neutral.svg",
    smile: "/mouth-smile.svg",
    frown: "/mouth-frown.svg",
    o: "/mouth-o.svg",
  },
};
