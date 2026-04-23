# Skills Module

The Skills module is a read-only registry view of locally discovered
skill manifests. Phase 1 reads `SKILL.md` files from one or more roots
on disk, parses YAML frontmatter, and renders a grid plus a per-skill
detail page. The module is agent-agnostic at the UI boundary — every
skill is rendered through canonical fields, not vendor-specific ones.
Rationale: [ADR-0002](../architecture/decisions/0002-agent-agnostic-core.md).

## What's live today

- **Discovery from the local filesystem.** `apps/web/lib/skills-source.ts`
  resolves roots in this order:
  1. `CONTROL_PLANE_SKILLS_ROOTS` env var (OS path-separator list).
  2. `~/.claude/skills` if it exists.
  3. Otherwise no roots → module renders the empty state.
- **Parsing rules** (server-side only, per the "server-only filesystem
  access" rule in root `CLAUDE.md`):
  - Each `SKILL.md` under a root becomes one `SkillManifest`.
  - Frontmatter is parsed with `yaml`; invalid YAML falls through to
    body-only rendering.
  - `id` — root-relative slug joined by `/`.
  - `name` — frontmatter `name`, else humanized last path segment.
  - `description` — frontmatter `description`, else first paragraph
    after the first `#` heading.
  - `summary` — first sentence of `description`.
  - `triggers` — quoted phrases extracted from sentences starting with
    `Trigger on` / `Trigger when` / `Trigger proactively`.
- **Caching.** In-process manifest cache keyed on file path + mtime.
- **Routes.**
  - `GET /skills` — grid with a summary strip (total / roots scanned /
    with description / with triggers) and a per-root chip list.
  - `GET /skills/[id]` — manifest detail: description, trigger chips,
    raw frontmatter, and the markdown body.
- **Empty/error rendering** uses `EmptyState` and `ErrorState` from
  `apps/web/components/ui/state.tsx`.

## Canonical model

Types consumed from `@control-plane/core` (see
`packages/core/src/domain/skills.ts`):

- `SkillDescriptor` — id, name, version, `SkillStatus`
  (`draft` | `active` | `deprecated` | `disabled`), `SkillSource`,
  optional capabilities and `configurationSchema`.
- `SkillSource` + `SKILL_SOURCE_KINDS`
  (`local` | `git` | `registry` | `inline`).
- `SkillActivation` — per-agent enablement, configuration, and
  `activatedAt` stamp.

The Phase 1 `SkillManifest` shape is a UI-side superset that carries
filesystem provenance; later slices will normalize onto
`SkillDescriptor` when an adapter surface is added.

## Adapter capabilities

- Depends on `CONTROL_PLANE_CAPABILITIES.Skills` from
  `packages/core/src/capabilities.ts`.
- Phase 1 bypasses the adapter layer and reads the filesystem directly;
  when a real skills adapter lands, a missing `skills` capability will
  degrade the UI to the same empty state per
  [ADR-0002](../architecture/decisions/0002-agent-agnostic-core.md).

## Empty / degraded states

- No roots resolved → `EmptyState` "No skills roots" naming the
  `CONTROL_PLANE_SKILLS_ROOTS` env var and the `~/.claude/skills`
  fallback.
- Roots configured but no `SKILL.md` found → `EmptyState` "No skills
  discovered".
- Filesystem read throws → `ErrorState` with the underlying message.
- Detail page with unknown id → `EmptyState` "Skill not found".

## Usage telemetry (local-only)

`apps/web/lib/skills-usage-source.ts` derives invocation telemetry by
scanning the same local Claude Code JSONL transcripts the Sessions
module uses — no external pipeline. For each assistant entry it
extracts `tool_use` blocks where `name === "Skill"`, reads
`input.skill` as the skill id, and joins against the discovered
`SkillManifest` list by `id` first and frontmatter `name` second.

Surfaced stats per skill:

- `invocationCount` — total Skill tool-use blocks seen.
- `firstInvokedAt` / `lastInvokedAt`.
- `perProject` — invocations grouped by the session's `cwd`.
- `perHourOfDay` (length 24, UTC) and `perDayOfWeek` (length 7, UTC).
- `perDay` — time series of daily counts.
- `sizeBytes` + `approxTokens` (`ceil(sizeBytes / 4)`) from the
  matched `SKILL.md`.
- Derived cost: `bytesInjected = count * sizeBytes`,
  `tokensInjected = count * approxTokens`.

Routes:

- `GET /skills` renders a usage dashboard beneath the existing grid:
  - Stat strip (total invocations, distinct skills, sessions scanned,
    tokens injected, time span).
  - Per-day timeline.
  - Top-skills bar chart with a metric toggle (`invocations`,
    `size`, `composite tokens injected`).
  - Heatmaps (hour-of-day, day-of-week, and per-skill × hour).
  - Unknown-invocations notice when a session referenced a skill id
    that isn't present in any configured root.
- `GET /skills/[id]` adds a `Usage` block: invocations, tokens/bytes
  injected, last-invoked stamp, per-hour heatmap, and per-project
  breakdown for that specific skill.

Caching mirrors `skills-source.ts`: the usage report is memoized on
the sorted `(filePath, mtime)` tuple of all JSONL files so reloading
`/skills` is cheap when the transcript directory hasn't changed.

Requires `CLAUDE_CONTROL_PLANE_DATA_ROOT` or `~/.claude/projects` to
resolve; otherwise the usage section renders an unconfigured empty
state while the manifest grid above continues to render.

## Deliberately out of scope for Phase 1

Per [ADR-0001](../architecture/decisions/0001-phase-1-skeleton.md):

- Skill CRUD (create/edit/delete on disk or via a registry).
- Per-agent assignment (`SkillActivation`) and rollout state.
- Non-local `SkillSource` kinds (`git`, `registry`, `inline`) — Phase 1
  only discovers `local`.
- Skill validation/linting beyond frontmatter parse tolerance.
- Writes of any kind (`packages/storage` is in-memory only per
  [ADR-0003](../architecture/decisions/0003-local-first-storage.md)).
- Token counts are byte-based approximations (`ceil(sizeBytes / 4)`);
  a proper tokenizer integration and per-invocation token accounting
  from `message.usage` are future work.
