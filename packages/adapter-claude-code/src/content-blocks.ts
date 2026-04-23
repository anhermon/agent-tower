/**
 * Type guards that narrow `ClaudeContentBlock` to a specific variant without
 * relying on discriminated-union narrowing on `block.type`.
 *
 * Why this file exists: `ClaudeContentBlock` ends with a catch-all variant
 * `{ readonly type: string; readonly [key: string]: ClaudeRawValue }` whose
 * `type: string` includes every literal (`"tool_use"`, `"tool_result"`,
 * etc.). TypeScript cannot eliminate the catch-all when you check
 * `block.type === "tool_use"`, so property access on the narrowed value
 * falls back through the index signature and gets reported as "unsafe
 * member access on `any`" by type-aware ESLint. These guards bypass the
 * discriminator and explicitly assert the specific variant shape so
 * downstream code can treat the value as strongly typed.
 *
 * Keep these guards free of behavior — they must mirror the property checks
 * used elsewhere in the adapter so tests can't drift.
 */

import type { ClaudeContentBlock } from "./types.js";

export type ClaudeTextBlock = Extract<ClaudeContentBlock, { readonly type: "text" }>;
export type ClaudeThinkingBlock = Extract<ClaudeContentBlock, { readonly type: "thinking" }>;
export type ClaudeToolUseBlock = Extract<ClaudeContentBlock, { readonly type: "tool_use" }>;
export type ClaudeToolResultBlock = Extract<ClaudeContentBlock, { readonly type: "tool_result" }>;

export function isTextBlock(block: ClaudeContentBlock): block is ClaudeTextBlock {
  return block.type === "text" && typeof (block as { text?: unknown }).text === "string";
}

export function isThinkingBlock(block: ClaudeContentBlock): block is ClaudeThinkingBlock {
  return (
    block.type === "thinking" && typeof (block as { thinking?: unknown }).thinking === "string"
  );
}

export function isToolUseBlock(block: ClaudeContentBlock): block is ClaudeToolUseBlock {
  return (
    block.type === "tool_use" &&
    typeof (block as { id?: unknown }).id === "string" &&
    typeof (block as { name?: unknown }).name === "string" &&
    "input" in block
  );
}

export function isToolResultBlock(block: ClaudeContentBlock): block is ClaudeToolResultBlock {
  return (
    block.type === "tool_result" &&
    typeof (block as { tool_use_id?: unknown }).tool_use_id === "string"
  );
}
