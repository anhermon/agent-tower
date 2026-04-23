---
name: agent-mascot
description: Rules and rig anatomy for the Clawd agent mascot (SVG + CSS). Body language, not floating signs — pose, arms, face, and props do the talking. Load when editing any of the agent mascot assets, animations, state mapping, or labels.
when_to_load: when modifying agent mascot assets or animations
---

# Agent Mascot (Clawd) — Skill

## Principle

**Body language, not signs.** Clawd communicates state through what it is
doing — not through floating icons, badges, or sparkles. If you are tempted
to add a "!" sticker above the head for permission, stop: raise the arm
instead. If you want a "Zzz" for sleeping, stop: close the eyes and slow
the breath.

The only visible overlay is the **companion mini-Clawd** for subagent
activity — and even that is a smaller copy of the same character working
beside the main one, not a badge.

## Rig anatomy

The character is an absolutely-positioned stack of SVG `<img>`s inside a
square frame. Each layer has a dedicated CSS `transform-origin` chosen so
CSS transforms pivot at the right SVG coordinate.

| z   | Part        | Role                                    | Origin        |
| --- | ----------- | --------------------------------------- | ------------- |
| 0   | shadow      | Grounding ellipse                       | 50% 87%       |
| 1   | body        | Blob silhouette + face patch            | 50% 68%       |
| 2   | leftArm     | Left (viewer) arm + paw                 | 28% 57%       |
| 3   | laptop      | Conditional prop for working/attention  | 50% 82%       |
| 4   | rightArm    | Right arm + paw (asking, celebrating)   | 72% 57%       |
| 5   | head        | Cream face patch, blush, antenna tuft   | 50% 47%       |
| 6   | eyes        | Variant: open/closed/happy/worried/wide | 50% 47%       |
| 6   | mouth       | Variant: neutral/smile/frown/o          | 50% 58%       |
| 7   | companion   | Subagent mini-Clawd (stacked up to 3)   | 72% 62%       |

Manifest: `apps/web/public/agents/mascot/v2/manifest.json`.
Character bible: `apps/web/public/agents/mascot/v2/character-bible.md`.

## State → motion map (keep this in sync)

| State / overlay            | Clawd does                                     | Eyes     | Mouth   | Laptop | Key animation(s)                                            |
| -------------------------- | ---------------------------------------------- | -------- | ------- | ------ | ----------------------------------------------------------- |
| `sleeping`                 | Slow breathing loop, head bob                  | closed   | neutral | —      | `clawd-breathe`, `clawd-head-bob`                           |
| `working`                  | Lean over laptop, tap-typing, focused          | open     | neutral | shown  | `clawd-type-left/right`, `clawd-head-focus-bob`, `clawd-blink` |
| `attention` + `permission` | Looks up, head tilts, right paw raised asking  | worried  | o       | shown  | `clawd-head-tilt-question`, `clawd-arm-raise-ask`           |
| `attention` + `compacting` | Rubs head with right paw, body sway            | worried  | neutral | shown  | `clawd-rub-head`, `clawd-yawn-stretch`                      |
| `done` / overlay `success` | Short hop, arms up, happy squint               | happy    | smile   | —      | `clawd-celebrate-jump/arm-left/arm-right`                   |
| `failed` / overlay `failure` | Slump + head-drop + short head-shake         | worried  | frown   | —      | `clawd-slump`, `clawd-headshake`                            |
| overlay `skillLoaded`      | Brief "aha" pulse, wide eyes                   | wide     | neutral | —      | `clawd-aha-pulse`                                           |
| overlay `subagent`         | Companion mini-Clawd fades in, stacks for >1   | —        | —       | —      | `clawd-companion-follow`                                    |

Overlay priority (keep in `agent-mascot-state-machine.ts`):
`failure > permission ≈ compacting > success > skillLoaded > subagent > none`.

## Fatigue scaling

Fatigue multiplies the loop duration via `--clawd-loop-rate`:

- `fresh` → 1.0
- `slightly_tired` → 1.15
- `tired` → 1.35 (eyes opacity drop to 0.82)
- `exhausted` → 1.6 (head droops + eyes opacity 0.68)

## Hard rules

1. **Frame size is sacred.** Mascot area is 88px (card) / 132px (detail).
   Animations must never push layout. Use `overflow: visible` only so arms
   don't clip during a raise — the `<div>` itself must stay square.
2. **All loops gated by `.is-looping`.** Transient overlays (success,
   failure, skillLoaded) run once. Looping base states and looping
   overlays (permission, compacting, subagent) require `.is-looping` to
   activate.
3. **`prefers-reduced-motion`** — kills every animation via the existing
   media query at the bottom of `globals.css`. Do not add new animations
   outside that block.
4. **No new runtime deps.** Pure SVG + CSS. No framer-motion, no Lottie,
   no Canvas, no Three.js.
5. **No vendor naming in `packages/core`.** The enum is locked
   (`AGENT_ANIMATION_BASE_STATES`, `AGENT_ANIMATION_OVERLAYS`,
   `AGENT_FATIGUE_LEVELS`). If you need a new state you change it there
   first with an ADR — do not patch it into the UI.
6. **Labels live in `agent-mascot-state-machine.ts`.** Every `role="img"`
   label must start with "Clawd" so e2e selectors work. If you rename the
   character, update:
   - `labelFor(...)` in `agent-mascot-state-machine.ts`
   - `apps/web/app/agents/agent-mascot.test.tsx`
   - `e2e/agents-data.spec.ts`
   - `character-bible.md`

## Files

- `apps/web/components/agents/agent-mascot.tsx` — rig composition + variant picking.
- `apps/web/components/agents/agent-mascot-state-machine.ts` — base + overlay reducer, labels.
- `apps/web/app/globals.css` — `@layer components` block with per-part rules and `@keyframes`.
- `apps/web/public/agents/mascot/v2/` — manifest, bible, and SVG parts.
- `apps/web/app/agents/agent-mascot.test.tsx` — label/dimension/optional-asset tests.
- `e2e/agents-data.spec.ts` — working/failed mascot assertions.
