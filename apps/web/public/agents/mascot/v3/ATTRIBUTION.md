# Attribution

## clawd-code-sprite-atlas.png

- Source: `~/workspace/agent-companion/peon-pet/renderer/assets/clawd-code-sprite-atlas.png`
- Authored by the same repository owner (Angel Hermon). Local re-use; no external license applies.
- Atlas: 2016 x 2016 PNG, 6 cols x 6 rows, 336 x 336 px per cell.

## Row semantics (locked — do not re-shuffle)

| Row | Pose      | Maps to control-plane state                 |
| --- | --------- | ------------------------------------------- |
| 0   | sleeping  | `baseState=sleeping`                        |
| 1   | waking    | reserved (sleeping -> working bridge)       |
| 2   | typing    | `baseState=working`                         |
| 3   | alarmed   | `overlay=permission` / `overlay=compacting` |
| 4   | celebrate | `baseState=done` / `overlay=skillLoaded`    |
| 5   | annoyed   | `baseState=failed` / `overlay=failure`      |
