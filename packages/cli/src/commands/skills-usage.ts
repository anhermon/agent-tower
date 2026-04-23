import { computeSkillsUsage, type SkillUsageStats } from "@control-plane/adapter-claude-code";
import { resolveOrExplain } from "../data-root.js";
import { parseFlags, readIntFlag } from "../flags.js";
import { bold, renderTable, resolveOutputMode, writeJson, writeLine } from "../output.js";

export async function runSkillsUsage(argv: readonly string[]): Promise<number> {
  const { values } = parseFlags<{
    json?: boolean;
    pretty?: boolean;
    limit?: string;
  }>(argv, {
    json: { type: "boolean" },
    pretty: { type: "boolean" },
    limit: { type: "string" },
  });

  const mode = resolveOutputMode(values);
  const limit = readIntFlag(values.limit, 20, "limit");

  const resolved = resolveOrExplain(mode);
  if (!resolved) return 0;

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

  const trimmedPerSkill = result.report.perSkill.slice(0, limit).map(stripPerSkillSeries);

  if (mode.json) {
    writeJson({
      ok: true,
      totals: result.report.totals,
      perHourOfDay: result.report.perHourOfDay,
      perDayOfWeek: result.report.perDayOfWeek,
      perDay: result.report.perDay,
      perSkill: trimmedPerSkill,
    });
    return 0;
  }

  const { totals } = result.report;
  writeLine(bold("Skills usage"));
  writeLine("");
  writeLine(`Invocations:       ${totals.totalInvocations}`);
  writeLine(
    `Distinct skills:   ${totals.distinctSkills} (known ${totals.knownSkills} / unknown ${totals.unknownSkills})`
  );
  writeLine(`Bytes injected:    ${totals.totalBytesInjected}`);
  writeLine(`Tokens injected:   ${totals.totalTokensInjected}`);
  writeLine(`Sessions scanned:  ${totals.sessionsScanned}`);
  writeLine(`Files scanned:     ${totals.filesScanned}`);
  writeLine(`First invoked:     ${totals.firstInvokedAt ?? "-"}`);
  writeLine(`Last invoked:      ${totals.lastInvokedAt ?? "-"}`);
  writeLine("");
  if (trimmedPerSkill.length === 0) {
    writeLine("No skill invocations found.");
    return 0;
  }
  const rows = trimmedPerSkill.map((s) => [
    s.displayName,
    s.known ? "known" : "unknown",
    String(s.invocationCount),
    String(s.sizeBytes),
    String(s.bytesInjected),
    String(s.tokensInjected),
    s.lastInvokedAt ?? "-",
  ]);
  writeLine(
    renderTable(
      [
        "skill",
        "status",
        "invocations",
        "size_bytes",
        "bytes_injected",
        "tokens_injected",
        "last_invoked",
      ],
      rows
    )
  );
  return 0;
}

type TrimmedStats = Omit<SkillUsageStats, "perHourOfDay" | "perDayOfWeek" | "perDay">;

function stripPerSkillSeries(stats: SkillUsageStats): TrimmedStats {
  const { perHourOfDay: _h, perDayOfWeek: _d, perDay: _p, ...rest } = stats;
  return rest;
}
