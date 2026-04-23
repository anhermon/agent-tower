import { computeSkillsUsage, type SkillUsageStats } from "@control-plane/adapter-claude-code";
import { resolveOrExplain } from "../data-root.js";
import { parseFlags, readEnumFlag, readIntFlag } from "../flags.js";
import { bold, renderTable, resolveOutputMode, writeJson, writeLine } from "../output.js";

type SortBy = "invocations" | "size" | "bytes-injected" | "tokens-injected";
const SORT_BY: readonly SortBy[] = ["invocations", "size", "bytes-injected", "tokens-injected"];

export async function runSkillsTop(argv: readonly string[]): Promise<number> {
  const { values } = parseFlags<{
    json?: boolean;
    pretty?: boolean;
    by?: string;
    limit?: string;
  }>(argv, {
    json: { type: "boolean" },
    pretty: { type: "boolean" },
    by: { type: "string" },
    limit: { type: "string" },
  });

  const mode = resolveOutputMode(values);
  const sortBy = readEnumFlag<SortBy>(values.by, SORT_BY, "invocations", "by");
  const limit = readIntFlag(values.limit, 10, "limit");

  const resolved = resolveOrExplain(mode);
  if (!resolved) return 1;

  const result = await computeSkillsUsage();
  if (!result.ok) {
    if (mode.json) {
      writeJson({ ok: false, reason: result.reason, message: result.message });
      return 1;
    }
    writeLine(
      `Failed to compute skills usage: ${result.reason}${result.message ? ` — ${result.message}` : ""}`
    );
    return 1;
  }

  const sorted = [...result.report.perSkill].sort((a, b) => compareSkills(a, b, sortBy));
  const sliced = sorted.slice(0, Math.max(1, limit));

  if (mode.json) {
    writeJson({ ok: true, skills: sliced });
    return 0;
  }

  writeLine(bold(`Top ${sliced.length} skills by ${sortBy}`));
  writeLine("");
  if (sliced.length === 0) {
    writeLine("No skill invocations found.");
    return 0;
  }
  const rows = sliced.map((s) => [
    s.displayName,
    s.known ? "known" : "unknown",
    String(s.invocationCount),
    String(s.sizeBytes),
    String(s.bytesInjected),
    String(s.tokensInjected),
  ]);
  writeLine(
    renderTable(
      ["skill", "status", "invocations", "size_bytes", "bytes_injected", "tokens_injected"],
      rows
    )
  );
  return 0;
}

function compareSkills(a: SkillUsageStats, b: SkillUsageStats, by: SortBy): number {
  switch (by) {
    case "size":
      return b.sizeBytes - a.sizeBytes;
    case "bytes-injected":
      return b.bytesInjected - a.bytesInjected;
    case "tokens-injected":
      return b.tokensInjected - a.tokensInjected;
    default:
      return b.invocationCount - a.invocationCount;
  }
}
