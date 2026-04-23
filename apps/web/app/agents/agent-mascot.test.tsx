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

  it("given_reduced_motion__when_working__then_raf_loop_is_disabled", () => {
    render(
      <AgentMascot
        agentState={agentState({ activeSessionIds: [SESSION_ID] })}
        snapshot={snapshot(AGENT_ANIMATION_BASE_STATES.Working)}
        reducedMotion
      />
    );

    const mascot = screen.getByRole("img", { name: "Clawd is working" });
    expect(mascot.getAttribute("data-reduced-motion")).toBe("true");
    expect(mascot.className).toContain("agent-mascot--reduced-motion");
    // Frame must stay at 0 when the RAF loop is not installed.
    expect(mascot.getAttribute("data-frame")).toBe("0");
    // Legacy looping class is no longer used by the sprite renderer.
    expect(mascot.className).not.toContain("is-looping");
  });

  it("given_bogus_atlas_url__when_overlay_is_present__then_role_and_label_still_render", () => {
    render(
      <AgentMascot
        agentState={agentState({ activeSessionIds: [SESSION_ID] })}
        snapshot={{
          ...snapshot(AGENT_ANIMATION_BASE_STATES.Attention),
          overlay: AGENT_ANIMATION_OVERLAYS.Permission,
          fatigueLevel: AGENT_FATIGUE_LEVELS.Tired,
        }}
        assetManifest={manifestWithBogusAtlas}
      />
    );

    const mascot = screen.getByRole("img", {
      name: "Clawd needs permission",
    });
    expect(mascot.getAttribute("data-overlay")).toBe(AGENT_ANIMATION_OVERLAYS.Permission);
    // Component remains renderable even when the atlas URL is invalid; the
    // sprite layer is still in the DOM so the card slot keeps stable
    // dimensions.
    expect(mascot.querySelector('[data-testid="agent-mascot-sprite"]')).toBeTruthy();
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

const manifestWithBogusAtlas: MascotManifest = {
  version: 3,
  name: "Test Clawd",
  renderer: "sprite-sheet",
  atlas: {
    url: "/this/url/does/not/exist.png",
    width: 2016,
    height: 2016,
    cols: 6,
    rows: 6,
    cellWidth: 336,
    cellHeight: 336,
  },
  animations: {
    sleeping: { row: 0, frames: 6, fps: 3, loop: true },
    waking: { row: 1, frames: 6, fps: 2, loop: false, loops: 1 },
    working: { row: 2, frames: 6, fps: 8, loop: true },
    attention_permission: { row: 3, frames: 6, fps: 8, loop: true },
    attention_compacting: { row: 3, frames: 6, fps: 6, loop: true },
    done: { row: 4, frames: 6, fps: 8, loop: false },
    failed: { row: 5, frames: 6, fps: 8, loop: false },
    skill_loaded: { row: 4, frames: 6, fps: 10, loop: false },
  },
};
