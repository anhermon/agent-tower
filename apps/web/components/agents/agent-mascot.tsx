"use client";

import {
  AGENT_ANIMATION_BASE_STATES,
  AGENT_ANIMATION_OVERLAYS,
  AGENT_FATIGUE_LEVELS,
  type AgentAnimationSnapshot,
  type AgentFatigueLevel,
  type AgentState,
} from "@control-plane/core";
import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import mascotManifest from "@/public/agents/mascot/v3/manifest.json";
import { type AgentMascotVisualState, useAgentMascotState } from "./agent-mascot-state-machine";

type MascotSize = "card" | "detail";

/**
 * v3 sprite-sheet manifest contract.
 *
 * The renderer is intentionally dumb: it looks up an animation key, reads
 * `{ row, frames, fps, loop, loops? }`, and steps a CSS background-position
 * through the cells of that row on the atlas. All row semantics live in
 * `public/agents/mascot/v3/character-bible.md`.
 */
export interface MascotManifest {
  readonly version: number;
  readonly name: string;
  readonly renderer: "sprite-sheet";
  readonly atlas: {
    readonly url: string;
    readonly width: number;
    readonly height: number;
    readonly cols: number;
    readonly rows: number;
    readonly cellWidth: number;
    readonly cellHeight: number;
  };
  readonly animations: Record<AnimationKey, AnimationConfig>;
}

export interface AnimationConfig {
  readonly row: number;
  readonly frames: number;
  readonly fps: number;
  readonly loop: boolean;
  readonly loops?: number;
}

type AnimationKey =
  | "sleeping"
  | "waking"
  | "working"
  | "attention_permission"
  | "attention_compacting"
  | "done"
  | "failed"
  | "skill_loaded";

type AgentMascotProps = {
  readonly agentState: AgentState;
  readonly snapshot?: AgentAnimationSnapshot;
  readonly size?: MascotSize;
  readonly className?: string;
  readonly reducedMotion?: boolean;
  readonly assetManifest?: MascotManifest;
};

const defaultManifest = mascotManifest as MascotManifest;

const CARD_SIZE_PX = 88;
const DETAIL_SIZE_PX = 132;
const COMPANION_SCALE = 0.45;
const MAX_COMPANION_STACKS = 3;

const FATIGUE_MODIFIERS: Record<
  AgentFatigueLevel,
  { readonly fpsMul: number; readonly opacity: number; readonly filter: string }
> = {
  [AGENT_FATIGUE_LEVELS.Fresh]: { fpsMul: 1.0, opacity: 1.0, filter: "none" },
  [AGENT_FATIGUE_LEVELS.SlightlyTired]: { fpsMul: 0.85, opacity: 1.0, filter: "none" },
  [AGENT_FATIGUE_LEVELS.Tired]: { fpsMul: 0.7, opacity: 0.88, filter: "none" },
  [AGENT_FATIGUE_LEVELS.Exhausted]: { fpsMul: 0.55, opacity: 0.75, filter: "saturate(0.7)" },
};

export function AgentMascot({
  agentState,
  snapshot,
  size = "card",
  className,
  reducedMotion = false,
  assetManifest,
}: AgentMascotProps) {
  const manifest = assetManifest ?? defaultManifest;
  const visual = useAgentMascotState({ snapshot, agentState });

  const animationKey = pickAnimation(visual);
  const anim = manifest.animations[animationKey] ?? manifest.animations.sleeping;
  const { cols, rows } = manifest.atlas;
  const renderedSize = size === "detail" ? DETAIL_SIZE_PX : CARD_SIZE_PX;

  const fatigue = FATIGUE_MODIFIERS[visual.fatigueLevel];
  const effectiveFps = Math.max(1, anim.fps * fatigue.fpsMul);

  const frame = useSpriteFrame({
    animationKey,
    fps: effectiveFps,
    frames: anim.frames,
    loop: anim.loop,
    reducedMotion,
  });

  const subagentCount = visual.subagentCount;
  const companionStacks = Math.min(subagentCount, MAX_COMPANION_STACKS);
  const overflowCompanionCount = subagentCount > MAX_COMPANION_STACKS ? subagentCount : 0;

  return (
    <div
      role="img"
      aria-label={visual.label}
      data-base-state={visual.baseState}
      data-overlay={visual.overlay}
      data-fatigue={visual.fatigueLevel}
      data-animation={animationKey}
      data-frame={frame}
      data-reduced-motion={reducedMotion ? "true" : "false"}
      style={{
        position: "relative",
        display: "inline-block",
        width: renderedSize,
        height: renderedSize,
        flex: "0 0 auto",
        overflow: "visible",
        isolation: "isolate",
      }}
      className={cn(
        "agent-mascot",
        `agent-mascot--${size}`,
        `agent-mascot--${visual.baseState}`,
        `agent-mascot--overlay-${visual.overlay}`,
        `agent-mascot--fatigue-${visual.fatigueLevel}`,
        reducedMotion && "agent-mascot--reduced-motion",
        className
      )}
    >
      <SpriteLayer
        atlasUrl={manifest.atlas.url}
        cols={cols}
        rows={rows}
        renderedSize={renderedSize}
        row={anim.row}
        frame={frame}
        opacity={fatigue.opacity}
        filter={fatigue.filter}
        zIndex={1}
      />
      {companionStacks > 0
        ? Array.from({ length: companionStacks }).map((_, index) => (
            <CompanionSprite
              key={`companion-${index}`}
              atlasUrl={manifest.atlas.url}
              cols={cols}
              rows={rows}
              renderedSize={renderedSize}
              row={manifest.animations.working.row}
              frame={frame % manifest.animations.working.frames}
              index={index}
            />
          ))
        : null}
      {overflowCompanionCount > 0 ? (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            right: -2,
            bottom: 2,
            zIndex: 8,
            minWidth: 18,
            height: 18,
            padding: "0 4px",
            display: "grid",
            placeItems: "center",
            borderRadius: 999,
            border: "1px solid rgb(255 255 255 / 0.72)",
            background: "rgb(var(--color-canvas) / 0.86)",
            color: "rgb(var(--color-cyan))",
            fontSize: 11,
            fontWeight: 700,
            lineHeight: 1,
            boxShadow: "0 2px 6px rgb(0 0 0 / 0.25)",
          }}
        >
          {overflowCompanionCount}
        </span>
      ) : null}
    </div>
  );
}

/** One stepped background-position layer. Stateless — all state lives above. */
function SpriteLayer({
  atlasUrl,
  cols,
  rows,
  renderedSize,
  row,
  frame,
  opacity,
  filter,
  zIndex,
}: {
  readonly atlasUrl: string;
  readonly cols: number;
  readonly rows: number;
  readonly renderedSize: number;
  readonly row: number;
  readonly frame: number;
  readonly opacity: number;
  readonly filter: string;
  readonly zIndex: number;
}) {
  // We scale the full atlas down so one cell == renderedSize.
  const bgW = cols * renderedSize;
  const bgH = rows * renderedSize;
  const bgX = -frame * renderedSize;
  const bgY = -row * renderedSize;

  return (
    <div
      aria-hidden="true"
      data-testid="agent-mascot-sprite"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        backgroundImage: `url(${atlasUrl})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${bgW}px ${bgH}px`,
        backgroundPosition: `${bgX}px ${bgY}px`,
        imageRendering: "pixelated",
        opacity,
        filter,
        zIndex,
        pointerEvents: "none",
      }}
    />
  );
}

function CompanionSprite({
  atlasUrl,
  cols,
  rows,
  renderedSize,
  row,
  frame,
  index,
}: {
  readonly atlasUrl: string;
  readonly cols: number;
  readonly rows: number;
  readonly renderedSize: number;
  readonly row: number;
  readonly frame: number;
  readonly index: number;
}) {
  const companionSize = Math.round(renderedSize * COMPANION_SCALE);
  const bgW = cols * companionSize;
  const bgH = rows * companionSize;
  const bgX = -frame * companionSize;
  const bgY = -row * companionSize;

  // Fan out to the right of the main sprite. index 0 is closest.
  const offsetX = renderedSize * 0.08 + index * companionSize * 0.55;
  const offsetY = renderedSize * 0.45 + index * 4;

  return (
    <div
      aria-hidden="true"
      data-companion-index={index}
      style={{
        position: "absolute",
        left: offsetX,
        top: offsetY,
        width: companionSize,
        height: companionSize,
        backgroundImage: `url(${atlasUrl})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${bgW}px ${bgH}px`,
        backgroundPosition: `${bgX}px ${bgY}px`,
        imageRendering: "pixelated",
        zIndex: 7,
        pointerEvents: "none",
        opacity: 0.92,
      }}
    />
  );
}

/**
 * Drives the current frame index for a given animation at `fps`. Resets on
 * animation change. Holds on last frame when `loop` is false. Freezes at 0
 * under `prefers-reduced-motion` (no RAF loop installed).
 */
function useSpriteFrame({
  animationKey,
  fps,
  frames,
  loop,
  reducedMotion,
}: {
  readonly animationKey: string;
  readonly fps: number;
  readonly frames: number;
  readonly loop: boolean;
  readonly reducedMotion: boolean;
}): number {
  const [frame, setFrame] = useState(0);
  const frameRef = useRef(0);
  const lastAdvanceRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  // Reset on animation change so rows always start at frame 0.
  // biome-ignore lint/correctness/useExhaustiveDependencies: animationKey is the intentional trigger; the body only resets refs.
  useEffect(() => {
    frameRef.current = 0;
    lastAdvanceRef.current = null;
    setFrame(0);
  }, [animationKey]);

  useEffect(() => {
    if (reducedMotion) return;
    if (typeof window === "undefined") return;
    if (typeof window.requestAnimationFrame !== "function") return;

    const frameDurationMs = 1000 / fps;

    const tick = (timestamp: number) => {
      if (lastAdvanceRef.current === null) lastAdvanceRef.current = timestamp;
      const elapsed = timestamp - lastAdvanceRef.current;
      if (elapsed >= frameDurationMs) {
        const steps = Math.floor(elapsed / frameDurationMs);
        lastAdvanceRef.current = timestamp - (elapsed - steps * frameDurationMs);
        const next = frameRef.current + steps;
        if (loop) {
          frameRef.current = next % frames;
        } else {
          frameRef.current = Math.min(next, frames - 1);
        }
        setFrame(frameRef.current);
      }
      rafRef.current = window.requestAnimationFrame(tick);
    };

    rafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [fps, frames, loop, reducedMotion]);

  return frame;
}

/**
 * Map the canonical visual state to a manifest animation key. Priority:
 * overlays that have their own row > transient overlays > base state.
 */
function pickAnimation(visual: AgentMascotVisualState): AnimationKey {
  const overlay = visual.overlay;
  const baseState = visual.baseState;

  if (overlay === AGENT_ANIMATION_OVERLAYS.Permission) return "attention_permission";
  if (overlay === AGENT_ANIMATION_OVERLAYS.Compacting) return "attention_compacting";
  if (overlay === AGENT_ANIMATION_OVERLAYS.SkillLoaded) return "skill_loaded";
  if (overlay === AGENT_ANIMATION_OVERLAYS.Success) return "done";
  if (overlay === AGENT_ANIMATION_OVERLAYS.Failure) return "failed";

  if (baseState === AGENT_ANIMATION_BASE_STATES.Sleeping) return "sleeping";
  if (baseState === AGENT_ANIMATION_BASE_STATES.Working) return "working";
  if (baseState === AGENT_ANIMATION_BASE_STATES.Attention) return "attention_permission";
  if (baseState === AGENT_ANIMATION_BASE_STATES.Done) return "done";
  if (baseState === AGENT_ANIMATION_BASE_STATES.Failed) return "failed";

  return "sleeping";
}

// Re-export for test utilities that want to exercise the animation picker.
export const __mascotInternalsForTesting = { pickAnimation };
