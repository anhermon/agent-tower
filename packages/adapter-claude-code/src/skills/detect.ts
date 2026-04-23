import type { ClaudeContentBlock, ClaudeTranscriptEntry } from "../types.js";

/**
 * Shared detection logic for "a skill was invoked on this turn". Both
 * {@link ./usage.ts} (cross-session invocation counts) and
 * {@link ../analytics/skill-turn-attribution.ts} (per-turn attribution) call
 * this so the "what counts as a skill invocation?" definition lives in exactly
 * one place.
 *
 * A skill invocation is an assistant `tool_use` block whose `name === "Skill"`
 * and whose `input.skill` is a non-empty string. Everything else (user
 * messages, `<command-name>` markers in prose, etc.) is intentionally ignored:
 * the Claude Code harness routes `/slash` commands through the `Skill` tool,
 * and that tool call is the single authoritative signal.
 */

/** Extract the skill key (trimmed) from a single content block, or null. */
export function detectSkillFromBlock(block: ClaudeContentBlock | undefined | null): string | null {
  if (!block || typeof block !== "object") return null;
  if (block.type !== "tool_use") return null;
  const blk = block as {
    readonly type: "tool_use";
    readonly name?: unknown;
    readonly input?: unknown;
  };
  if (blk.name !== "Skill") return null;
  const input = blk.input;
  if (!input || typeof input !== "object") return null;
  const skill = (input as { readonly skill?: unknown }).skill;
  if (typeof skill !== "string") return null;
  const trimmed = skill.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Extract every skill key invoked on a single transcript entry. Only
 * `assistant` entries carry `tool_use` blocks in Claude Code; other entry
 * types return an empty list.
 */
export function detectSkillsFromEntry(entry: ClaudeTranscriptEntry): readonly string[] {
  if (entry.type !== "assistant") return [];
  const message = (entry as { readonly message?: unknown }).message;
  if (!message || typeof message !== "object") return [];
  const content = (message as { readonly content?: unknown }).content;
  if (!Array.isArray(content)) return [];
  const keys: string[] = [];
  for (const block of content) {
    const key = detectSkillFromBlock(block as ClaudeContentBlock);
    if (key) keys.push(key);
  }
  return keys;
}
