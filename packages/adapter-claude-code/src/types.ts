/**
 * Raw Claude Code JSONL transcript shapes.
 *
 * These types describe the subset of the on-disk format that the adapter
 * normalizes into canonical control-plane types. Unknown fields are preserved
 * under the raw metadata bag so drill-downs can inspect the original payload.
 */

export type ClaudeRawValue =
  | string
  | number
  | boolean
  | null
  | ClaudeRawValue[]
  | { [key: string]: ClaudeRawValue };

export type ClaudeRawRecord = Readonly<Record<string, ClaudeRawValue>>;

export interface ClaudeMessageUsage {
  readonly input_tokens?: number;
  readonly output_tokens?: number;
  readonly cache_creation_input_tokens?: number;
  readonly cache_read_input_tokens?: number;
}

export type ClaudeContentBlock =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "thinking"; readonly thinking: string; readonly signature?: string }
  | {
      readonly type: "tool_use";
      readonly id: string;
      readonly name: string;
      readonly input: ClaudeRawValue;
    }
  | {
      readonly type: "tool_result";
      readonly tool_use_id: string;
      readonly is_error?: boolean;
      readonly content?: ClaudeRawValue;
    }
  | { readonly type: string; readonly [key: string]: ClaudeRawValue };

export type ClaudeMessageContent = string | readonly ClaudeContentBlock[];

export interface ClaudeMessagePayload {
  readonly role: "user" | "assistant" | "system";
  readonly content: ClaudeMessageContent;
  readonly model?: string;
  readonly usage?: ClaudeMessageUsage;
}

export type ClaudeTranscriptEntry =
  | ClaudeUserEntry
  | ClaudeAssistantEntry
  | ClaudeSystemEntry
  | ClaudeSummaryEntry
  | ClaudeAttachmentEntry
  | ClaudeUnknownEntry;

interface ClaudeBaseEntry {
  readonly uuid?: string;
  readonly parentUuid?: string | null;
  readonly sessionId?: string;
  readonly timestamp?: string;
  readonly cwd?: string;
  readonly version?: string;
  readonly gitBranch?: string;
  readonly userType?: string;
  readonly entrypoint?: string;
}

export interface ClaudeUserEntry extends ClaudeBaseEntry {
  readonly type: "user";
  readonly message: ClaudeMessagePayload & { readonly role: "user" };
}

export interface ClaudeAssistantEntry extends ClaudeBaseEntry {
  readonly type: "assistant";
  readonly message: ClaudeMessagePayload & { readonly role: "assistant" };
  readonly requestId?: string;
}

export interface ClaudeSystemEntry extends ClaudeBaseEntry {
  readonly type: "system";
  readonly message?: ClaudeMessagePayload & { readonly role: "system" };
  readonly content?: string;
}

export interface ClaudeSummaryEntry extends ClaudeBaseEntry {
  readonly type: "summary";
  readonly summary?: string;
}

export interface ClaudeAttachmentEntry extends ClaudeBaseEntry {
  readonly type: "attachment";
  readonly attachment?: ClaudeRawRecord;
}

export interface ClaudeUnknownEntry extends ClaudeBaseEntry {
  readonly type: string;
}
