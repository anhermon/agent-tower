# Skills module — local contract

Owns `/skills` and `/skills/[id]`. The UI half; data derivation lives under
`apps/web/lib/skills-*-source.ts` and presentational atoms under
`apps/web/components/skills/`. Full product spec: [`docs/modules/skills.md`](../../../../docs/modules/skills.md).

## Read First
- `page.tsx` — composes three stacked sections in order: **Invocation telemetry**, **Session outcome delta**, **Discovered skills**.
- `[id]/page.tsx` — per-skill manifest view + per-skill usage block.
- `../../lib/skills-source.ts` — `SKILL.md` catalogue discovery (frontmatter + body).
- `../../lib/skills-usage-source.ts` — invocation telemetry from Claude JSONL (counts, heatmaps, token cost).
- `../../lib/skills-efficacy-source.ts` — session outcome classifier + satisfaction heuristic + per-skill delta vs. baseline.

## Data flow

```
resolveDataRoot()  ──►  listSessionFiles()  ──►  skills-usage-source ─┐
                                              │                       ├─► page.tsx → client components
                                              └──► skills-efficacy-source ┘
listSkillsOrEmpty() (SKILL.md catalogue) ─────────────────────────────┘
```

All three sources are called in parallel from `page.tsx` with `Promise.all`.

## Local Conventions
- **Server-only lib, client-only components.** `lib/*-source.ts` files touch `node:fs`; `components/skills/*.tsx` are `"use client"` and receive serializable props only.
- **Strip `body`/`frontmatter` before the client boundary.** `SkillGridItem` is the narrow shape passed to `<SkillGrid>`. Never pass a full `SkillManifest` into a client component — a single SKILL.md body can be multi-MB and bloat the RSC flight payload past the browser's ability to render. Use `toGridItem()` in `page.tsx`.
- **Join skill ids on `id` first, frontmatter `name` second.** Both sources do this. `input.skill` from the JSONL is a slug that usually matches `SkillManifest.id`.
- **UTC for all time bucketing.** Hour-of-day, day-of-week, and `YYYY-MM-DD` day keys are all UTC. Do not switch to local time — Playwright fixtures assume UTC.
- **Empty-state parity.** Any ok=false from either source degrades only its own section; the catalogue below keeps rendering.

## Efficacy heuristic (summary)
- Session outcome ∈ `{completed: 1.0, partial: 0.7, abandoned: 0.3, unknown: 0.6}` based on orphan tool_use, tool-error rate, interrupts, turn count.
- Satisfaction score ∈ [0, 1] from positive/correction/interrupt keywords and tool-error rate. Starts at 0.6.
- `effectiveScore = satisfaction × outcomeMultiplier`. Baseline = mean across ALL scored sessions. Per-skill `delta = avg(effectiveScore | skill invoked) − baseline`.
- Qualifying threshold: ≥3 sessions. Full classification rules in `skills-efficacy-source.ts`.

## Sharp Edges
- `computeSkillsUsage()` and `computeSkillsEfficacy()` each maintain an in-process cache keyed on `(filePath, mtime)` of every JSONL file. Mutating a transcript mid-session requires a page reload to invalidate.
- The detail-page per-skill lookup falls back to matching `SkillManifest.name` when `id` doesn't hit — some skills carry slugs that match the frontmatter name rather than their directory path.
- Stripping `body`/`frontmatter` from `SkillGridItem` is load-bearing for browser rendering. If a future column needs `body`, derive a summary on the server and expose it as a new narrow field — never widen the prop.
- No backwards-compat shims for OpenCode's SQLite/LLM pipeline. Outcome + satisfaction here are Claude-JSONL heuristics; they do not call out to an LLM.

## Deliberately out of scope for this slice
- Writes, CRUD, or activation state. Phase 1 is read-only.
- A real tokenizer — `approxTokens = ceil(sizeBytes / 4)` is the shipping approximation.
- Per-skill LLM-generated narratives. Current narratives are rule-based (`skills-efficacy-narratives.tsx`).
