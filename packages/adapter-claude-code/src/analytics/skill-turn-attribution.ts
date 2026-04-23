import { detectSkillsFromEntry } from "../skills/detect.js";

import type { ClaudeTranscriptEntry } from "../types.js";

/**
 * Pure fold: for each turn in a session, enumerate which skills were invoked
 * on that turn and the cumulative set of skills active up to and including
 * that turn. Lets downstream tooling answer "was skill X active when the
 * waste happened?" without re-scanning the transcript.
 *
 * A "skill invocation" reuses the shared detector in `skills/detect.ts` — the
 * assistant emitted a `tool_use` block with `name === "Skill"` and a non-empty
 * `input.skill`. Plain `<command-name>` markers inside user prose are NOT
 * counted: the Claude Code harness routes `/slash` commands through the
 * `Skill` tool, and only the tool call is authoritative.
 */

export interface SkillAttributionEntry {
  readonly turnIndex: number;
  /** Skills whose invocation marker appears in this turn, in order, deduped. */
  readonly skillsActivatedOnThisTurn: readonly string[];
  /** Union of all skills invoked up to and including this turn, sorted. */
  readonly skillsActiveCumulative: readonly string[];
}

export interface SkillTurnAttribution {
  readonly sessionId: string;
  readonly entries: readonly SkillAttributionEntry[];
}

export interface SkillTurnAttributionFoldOptions {
  readonly sessionId?: string;
}

export function computeSkillTurnAttribution(
  entries: readonly ClaudeTranscriptEntry[],
  options: SkillTurnAttributionFoldOptions = {}
): SkillTurnAttribution {
  const sessionId =
    options.sessionId ?? firstDefined(entries, (entry) => entry.sessionId) ?? "unknown";

  const rows: SkillAttributionEntry[] = [];
  const cumulative = new Set<string>();
  let turnIndex = 0;

  for (const entry of entries) {
    // Skip non-turn entries so `turnIndex` stays aligned with the timeline
    // produced by `turn-timeline.ts` (both iterate user/assistant only).
    if (entry.type !== "user" && entry.type !== "assistant") {
      continue;
    }

    const detected = detectSkillsFromEntry(entry);
    const seenThisTurn = new Set<string>();
    const onThisTurn: string[] = [];
    for (const key of detected) {
      if (seenThisTurn.has(key)) continue;
      seenThisTurn.add(key);
      onThisTurn.push(key);
      cumulative.add(key);
    }

    rows.push({
      turnIndex,
      skillsActivatedOnThisTurn: onThisTurn,
      skillsActiveCumulative: Array.from(cumulative).sort(),
    });
    turnIndex += 1;
  }

  return { sessionId, entries: rows };
}

function firstDefined<R>(
  entries: readonly ClaudeTranscriptEntry[],
  pick: (entry: ClaudeTranscriptEntry) => R | undefined | null
): R | undefined {
  for (const e of entries) {
    const v = pick(e);
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}
