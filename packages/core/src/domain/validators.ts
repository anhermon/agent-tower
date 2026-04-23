import { z } from "zod";

// ─── Base entry — every JSONL line has at least these ─────────────────────────
const baseEntry = z
  .object({
    type: z.string(),
    timestamp: z.string().datetime().optional(),
    uuid: z.string().optional(),
    sessionId: z.string().optional(),
  })
  .passthrough();

// ─── User message entry ──────────────────────────────────────────────────────
export const userEntrySchema = baseEntry
  .extend({
    type: z.literal("user"),
    message: z
      .object({
        role: z.literal("user"),
        content: z.union([z.string(), z.array(z.unknown())]),
      })
      .passthrough(),
  })
  .passthrough();

// ─── Assistant message entry ─────────────────────────────────────────────────
export const assistantEntrySchema = baseEntry
  .extend({
    type: z.literal("assistant"),
    message: z
      .object({
        role: z.literal("assistant"),
        model: z.string().optional(),
        content: z.union([z.string(), z.array(z.unknown())]),
        usage: z
          .object({
            input_tokens: z.number(),
            output_tokens: z.number(),
            cache_read_input_tokens: z.number().optional(),
            cache_creation_input_tokens: z.number().optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough(),
  })
  .passthrough();

// ─── Result entry ────────────────────────────────────────────────────────────
export const resultEntrySchema = baseEntry
  .extend({
    type: z.literal("result"),
  })
  .passthrough();

// ─── Summary / compaction entry ──────────────────────────────────────────────
export const summaryEntrySchema = baseEntry
  .extend({
    type: z.literal("summary"),
    summary: z.string(),
  })
  .passthrough();

// ─── Discriminated union of all known entry types ────────────────────────────
export const transcriptEntrySchema = z.discriminatedUnion("type", [
  userEntrySchema,
  assistantEntrySchema,
  resultEntrySchema,
  summaryEntrySchema,
]);

// ─── Public helpers ──────────────────────────────────────────────────────────

/** Parse a single raw JSONL object; returns a Zod SafeParseResult. */
export function parseTranscriptEntry(raw: unknown) {
  return transcriptEntrySchema.safeParse(raw);
}

/** Parse a batch of raw JSONL objects. */
export function parseTranscriptEntries(lines: readonly unknown[]) {
  return lines.map((line) => transcriptEntrySchema.safeParse(line));
}
