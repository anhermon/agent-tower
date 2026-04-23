# Clawd — Agent Mascot (v3)

## Identity

**Clawd** is the agent mascot for the control-plane dashboard. He is a pixel-art
character sitting at a desk with a laptop, communicating agent harness state
through full-body pose and facial expression. He is _not_ a floating sign, a
status badge, or a marketing icon — he is a character.

## Art style

- **Pixel-art sprite-sheet** — single atlas PNG.
- Atlas is `/agents/mascot/v3/clawd-code-sprite-atlas.png`, 2016x2016.
- 6 columns x 6 rows, 336x336 px per cell.
- Each row is a full 6-frame pose cycle.

## Render path

- `<div role="img">` with the atlas as `background-image`.
- `background-size` scales the full 2016x2016 atlas proportionally down so a
  single cell fills the card slot.
- `background-position` is stepped to the current frame cell (no interpolation).
- `image-rendering: pixelated` on every sprite layer — nearest-neighbor upscale.
- A single `requestAnimationFrame` loop advances the current row's frame index
  at the configured fps. Reset the frame index on state change.
- `prefers-reduced-motion: reduce` freezes on frame 0 of the active row; the
  RAF loop is not installed at all in that mode.

## State -> row map (canonical)

| Control-plane state   | Atlas row | Frames | FPS | Loop | Notes                                   |
| --------------------- | --------- | ------ | --- | ---- | --------------------------------------- |
| `baseState=sleeping`  | 0         | 6      | 3   | yes  | Breathing / head bob.                   |
| `baseState=working`   | 2         | 6      | 8   | yes  | Typing cycle.                           |
| `overlay=permission`  | 3         | 6      | 8   | yes  | Alarmed — hold loop while waiting.      |
| `overlay=compacting`  | 3         | 6      | 6   | yes  | Slower alarmed — stretching/reorg feel. |
| `baseState=done`      | 4         | 6      | 8   | no   | Celebrate — hold on frame 5.            |
| `overlay=skillLoaded` | 4         | 6      | 10  | no   | Short burst (~600ms), then settle.      |
| `baseState=failed`    | 5         | 6      | 8   | no   | Annoyed — hold on frame 5.              |

## Subagent overlay

`subagentCount > 0` renders up to 3 smaller sprite copies beside the main
mascot, each stepping through the same typing row. 4+ subagents collapse to a
pill with the overflow count.

## Fatigue

Fatigue does not change the row. It modulates FPS and opacity on the main
sprite layer:

| Level            | FPS multiplier | Opacity | Filter          |
| ---------------- | -------------- | ------- | --------------- |
| `fresh`          | 1.00           | 1.00    | none            |
| `slightly_tired` | 0.85           | 1.00    | none            |
| `tired`          | 0.70           | 0.88    | none            |
| `exhausted`      | 0.55           | 0.75    | `saturate(0.7)` |

## Hard rules (from the reference Sprite Debug Procedure)

- If a pose looks wrong, suspect the atlas mapping — do not paper over it by
  hacking `frameSequence` or cherry-picking frames.
- Keep nearest-neighbor filtering. No mipmaps. No smoothing. No drop shadows
  applied to the sprite layer.
- Do not add a second rendering path. One atlas, one RAF loop, one stepped
  background-position.
- Labels come from `agent-mascot-state-machine.ts` (`Clawd is ...`). Do not
  duplicate label strings in the sprite component.
