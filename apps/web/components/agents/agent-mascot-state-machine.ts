"use client";

import {
  AGENT_ANIMATION_BASE_STATES,
  AGENT_ANIMATION_OVERLAYS,
  AGENT_FATIGUE_LEVELS,
  AGENT_STATUSES,
  type AgentAnimationBaseState,
  type AgentAnimationOverlay,
  type AgentAnimationSnapshot,
  type AgentFatigueLevel,
  type AgentState,
} from "@control-plane/core";
import { useEffect, useMemo, useState } from "react";

const TRANSIENT_OVERLAY_MS: Record<AgentAnimationOverlay, number> = {
  [AGENT_ANIMATION_OVERLAYS.None]: 0,
  [AGENT_ANIMATION_OVERLAYS.Success]: 1_600,
  [AGENT_ANIMATION_OVERLAYS.Failure]: 1_800,
  [AGENT_ANIMATION_OVERLAYS.Permission]: 0,
  [AGENT_ANIMATION_OVERLAYS.Compacting]: 0,
  [AGENT_ANIMATION_OVERLAYS.SkillLoaded]: 1_400,
  [AGENT_ANIMATION_OVERLAYS.Subagent]: 0,
};

const OVERLAY_PRIORITY: Record<AgentAnimationOverlay, number> = {
  [AGENT_ANIMATION_OVERLAYS.None]: 0,
  [AGENT_ANIMATION_OVERLAYS.Subagent]: 1,
  [AGENT_ANIMATION_OVERLAYS.SkillLoaded]: 2,
  [AGENT_ANIMATION_OVERLAYS.Success]: 3,
  [AGENT_ANIMATION_OVERLAYS.Permission]: 4,
  [AGENT_ANIMATION_OVERLAYS.Compacting]: 4,
  [AGENT_ANIMATION_OVERLAYS.Failure]: 5,
};

export interface AgentMascotVisualState {
  readonly baseState: AgentAnimationBaseState;
  readonly overlay: AgentAnimationOverlay;
  readonly fatigueLevel: AgentFatigueLevel;
  readonly activeSessionIds: readonly string[];
  readonly subagentCount: number;
  readonly label: string;
  readonly eventKey: string;
}

export function useAgentMascotState({
  snapshot,
  agentState,
}: {
  readonly snapshot?: AgentAnimationSnapshot;
  readonly agentState: AgentState;
}): AgentMascotVisualState {
  const incoming = useMemo(() => toVisualState(snapshot, agentState), [snapshot, agentState]);
  const [visible, setVisible] = useState<AgentMascotVisualState>(incoming);

  useEffect(() => {
    setVisible((current) => {
      if (current.eventKey === incoming.eventKey) return current;
      const currentLocked = TRANSIENT_OVERLAY_MS[current.overlay] > 0;
      const incomingInterrupts =
        OVERLAY_PRIORITY[incoming.overlay] >= OVERLAY_PRIORITY[current.overlay];
      if (currentLocked && !incomingInterrupts) return current;
      return incoming;
    });

    const timeoutMs = TRANSIENT_OVERLAY_MS[incoming.overlay];
    if (timeoutMs <= 0) return;

    const timer = setTimeout(() => {
      setVisible((current) => {
        if (current.eventKey !== incoming.eventKey) return current;
        return settleTransient(incoming);
      });
    }, timeoutMs);

    return () => clearTimeout(timer);
  }, [incoming]);

  return visible;
}

export function toVisualState(
  snapshot: AgentAnimationSnapshot | undefined,
  agentState: AgentState
): AgentMascotVisualState {
  if (snapshot) {
    return {
      baseState: snapshot.baseState,
      overlay: snapshot.overlay,
      fatigueLevel: snapshot.fatigueLevel,
      activeSessionIds: snapshot.activeSessionIds,
      subagentCount: snapshot.subagentCount,
      label: labelFor(snapshot.baseState, snapshot.overlay),
      eventKey: `${snapshot.lastEventAt}:${snapshot.baseState}:${snapshot.overlay}:${snapshot.subagentCount}`,
    };
  }

  const baseState = fallbackBaseState(agentState);
  const overlay =
    agentState.status === AGENT_STATUSES.Error
      ? AGENT_ANIMATION_OVERLAYS.Failure
      : AGENT_ANIMATION_OVERLAYS.None;
  return {
    baseState,
    overlay,
    fatigueLevel: AGENT_FATIGUE_LEVELS.Fresh,
    activeSessionIds: agentState.activeSessionIds,
    subagentCount: 0,
    label: labelFor(baseState, overlay),
    eventKey: `fallback:${agentState.agentId}:${agentState.status}:${agentState.activeSessionIds.join(",")}`,
  };
}

function settleTransient(state: AgentMascotVisualState): AgentMascotVisualState {
  const baseState =
    state.activeSessionIds.length > 0
      ? AGENT_ANIMATION_BASE_STATES.Working
      : AGENT_ANIMATION_BASE_STATES.Sleeping;
  return {
    ...state,
    baseState,
    overlay:
      state.subagentCount > 0 ? AGENT_ANIMATION_OVERLAYS.Subagent : AGENT_ANIMATION_OVERLAYS.None,
    label: labelFor(
      baseState,
      state.subagentCount > 0 ? AGENT_ANIMATION_OVERLAYS.Subagent : AGENT_ANIMATION_OVERLAYS.None
    ),
    eventKey: `${state.eventKey}:settled`,
  };
}

function fallbackBaseState(agentState: AgentState): AgentAnimationBaseState {
  if (agentState.status === AGENT_STATUSES.Error) return AGENT_ANIMATION_BASE_STATES.Failed;
  if (agentState.activeSessionIds.length > 0) return AGENT_ANIMATION_BASE_STATES.Working;
  return AGENT_ANIMATION_BASE_STATES.Sleeping;
}

function labelFor(baseState: AgentAnimationBaseState, overlay: AgentAnimationOverlay): string {
  if (overlay === AGENT_ANIMATION_OVERLAYS.Permission) {
    return "Clawd needs permission";
  }
  if (overlay === AGENT_ANIMATION_OVERLAYS.Compacting) {
    return "Clawd is compacting context";
  }
  if (overlay === AGENT_ANIMATION_OVERLAYS.Failure) {
    return "Clawd is failed";
  }
  if (overlay === AGENT_ANIMATION_OVERLAYS.Success) {
    return "Clawd is done";
  }
  return `Clawd is ${baseState}`;
}
