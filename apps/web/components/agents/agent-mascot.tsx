"use client";

import React from "react";

import {
  AGENT_ANIMATION_BASE_STATES,
  AGENT_ANIMATION_OVERLAYS,
  type AgentAnimationSnapshot,
  type AgentState,
} from "@control-plane/core";

import { cn } from "@/lib/utils";

import { type AgentMascotVisualState, useAgentMascotState } from "./agent-mascot-state-machine";

export interface MascotManifest {
  readonly name: string;
  readonly parts: {
    readonly shadow: string;
    readonly body: string;
    readonly head: string;
    readonly leftArm: string;
    readonly rightArm: string;
    readonly laptop?: string;
  };
  readonly eyes: {
    readonly open: string;
    readonly closed: string;
    readonly happy: string;
    readonly worried: string;
    readonly wide: string;
  };
  readonly mouths: {
    readonly neutral: string;
    readonly smile: string;
    readonly frown: string;
    readonly o: string;
  };
}

const DEFAULT_MASCOT_MANIFEST: MascotManifest = {
  name: "Clawd",
  parts: {
    shadow: "/agent-mascot/shadow.svg",
    body: "/agent-mascot/body.svg",
    head: "/agent-mascot/head.svg",
    leftArm: "/agent-mascot/left-arm.svg",
    rightArm: "/agent-mascot/right-arm.svg",
    laptop: "/agent-mascot/laptop.svg",
  },
  eyes: {
    open: "/agent-mascot/eyes-open.svg",
    closed: "/agent-mascot/eyes-closed.svg",
    happy: "/agent-mascot/eyes-happy.svg",
    worried: "/agent-mascot/eyes-worried.svg",
    wide: "/agent-mascot/eyes-wide.svg",
  },
  mouths: {
    neutral: "/agent-mascot/mouth-neutral.svg",
    smile: "/agent-mascot/mouth-smile.svg",
    frown: "/agent-mascot/mouth-frown.svg",
    o: "/agent-mascot/mouth-o.svg",
  },
};

function pickEyeSrc(m: MascotManifest, v: AgentMascotVisualState): string {
  if (v.overlay === AGENT_ANIMATION_OVERLAYS.Permission) return m.eyes.worried;
  if (v.overlay === AGENT_ANIMATION_OVERLAYS.Success) return m.eyes.happy;
  if (v.overlay === AGENT_ANIMATION_OVERLAYS.Failure) return m.eyes.worried;
  switch (v.baseState) {
    case AGENT_ANIMATION_BASE_STATES.Sleeping:
      return m.eyes.closed;
    case AGENT_ANIMATION_BASE_STATES.Failed:
      return m.eyes.worried;
    case AGENT_ANIMATION_BASE_STATES.Done:
      return m.eyes.happy;
    case AGENT_ANIMATION_BASE_STATES.Attention:
      return m.eyes.wide;
    default:
      return m.eyes.open;
  }
}

function pickMouthSrc(m: MascotManifest, v: AgentMascotVisualState): string {
  if (v.overlay === AGENT_ANIMATION_OVERLAYS.Permission) return m.mouths.o;
  if (v.overlay === AGENT_ANIMATION_OVERLAYS.Success) return m.mouths.smile;
  if (v.overlay === AGENT_ANIMATION_OVERLAYS.Failure) return m.mouths.frown;
  switch (v.baseState) {
    case AGENT_ANIMATION_BASE_STATES.Sleeping:
      return m.mouths.neutral;
    case AGENT_ANIMATION_BASE_STATES.Done:
      return m.mouths.smile;
    case AGENT_ANIMATION_BASE_STATES.Failed:
      return m.mouths.frown;
    case AGENT_ANIMATION_BASE_STATES.Attention:
      return m.mouths.o;
    default:
      return m.mouths.neutral;
  }
}

interface AgentMascotProps {
  readonly agentState: AgentState;
  readonly snapshot: AgentAnimationSnapshot;
  readonly reducedMotion?: boolean;
  readonly assetManifest?: MascotManifest;
}

export function AgentMascot({
  agentState,
  snapshot,
  reducedMotion,
  assetManifest,
}: AgentMascotProps) {
  const manifest = assetManifest ?? DEFAULT_MASCOT_MANIFEST;
  const visible = useAgentMascotState({ snapshot, agentState });
  const eyeSrc = pickEyeSrc(manifest, visible);
  const mouthSrc = pickMouthSrc(manifest, visible);
  const hasLaptop = Boolean(manifest.parts.laptop);
  const looping =
    visible.baseState === AGENT_ANIMATION_BASE_STATES.Working && (reducedMotion ? false : true);

  return (
    <div className="agent-mascot__frame">
      <div
        role="img"
        aria-label={visible.label}
        data-base-state={visible.baseState}
        data-overlay={visible.overlay}
        className={cn(
          "agent-mascot",
          "agent-mascot--card",
          looping && "is-looping",
          reducedMotion && "agent-mascot--reduced-motion"
        )}
      >
        <img className="agent-mascot__shadow" src={manifest.parts.shadow} alt="" />
        <img className="agent-mascot__body" src={manifest.parts.body} alt="" />
        <img className="agent-mascot__left-arm" src={manifest.parts.leftArm} alt="" />
        <img className="agent-mascot__right-arm" src={manifest.parts.rightArm} alt="" />
        <img className="agent-mascot__head" src={manifest.parts.head} alt="" />
        <img className="agent-mascot__eyes" src={eyeSrc} alt="" />
        <img className="agent-mascot__mouth" src={mouthSrc} alt="" />
        {hasLaptop ? (
          <img className="agent-mascot__laptop" src={manifest.parts.laptop!} alt="" />
        ) : null}
      </div>
    </div>
  );
}
