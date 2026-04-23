#!/usr/bin/env node
// Runs `pnpm audit` and writes a machine-readable summary.
// Exits non-zero iff advisories exist at `high` or `critical` severity.
import { spawn } from "node:child_process";

import { paths, writeReport } from "./lib/report.mjs";

const TOOL = "audit";
const TIER = "T2";
const SEVERITIES = ["info", "low", "moderate", "high", "critical"];

function runPnpmAudit() {
  return new Promise((resolvePromise) => {
    const proc = spawn("pnpm", ["audit", "--json", "--prod", "--audit-level=high"], {
      cwd: paths.repoRoot,
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    proc.on("error", (err) => {
      resolvePromise({ error: err, stdout, stderr, code: null });
    });
    proc.on("close", (code) => {
      resolvePromise({ error: null, stdout, stderr, code });
    });
  });
}

function emptyCounts() {
  return Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
}

/** Normalize pnpm audit JSON across shapes into severity counts. */
function parseAudit(stdout) {
  const counts = emptyCounts();
  const trimmed = stdout.trim();
  if (!trimmed) return { counts, advisoryCount: 0, raw: null };

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    // Some versions emit NDJSON — try last JSON object on a line.
    const lines = trimmed.split(/\r?\n/).filter(Boolean);
    for (const line of lines.reverse()) {
      try {
        parsed = JSON.parse(line);
        break;
      } catch {
        /* keep looking */
      }
    }
    if (!parsed) return { counts, advisoryCount: 0, raw: trimmed.slice(0, 2000) };
  }

  // Shape A: { metadata: { vulnerabilities: { info, low, ... } } }
  const metaVulns = parsed?.metadata?.vulnerabilities;
  if (metaVulns && typeof metaVulns === "object") {
    for (const sev of SEVERITIES) {
      if (typeof metaVulns[sev] === "number") counts[sev] = metaVulns[sev];
    }
  }

  // Shape B: { advisories: { id: { severity } } }
  let advisoryCount = 0;
  const advisories = parsed?.advisories;
  if (advisories && typeof advisories === "object") {
    const entries = Object.values(advisories);
    advisoryCount = entries.length;
    if (!metaVulns) {
      for (const adv of entries) {
        const sev = String(adv?.severity ?? "").toLowerCase();
        if (sev in counts) counts[sev] += 1;
      }
    }
  } else if (metaVulns) {
    advisoryCount = SEVERITIES.reduce((acc, s) => acc + (counts[s] || 0), 0);
  }

  return { counts, advisoryCount, raw: null };
}

async function main() {
  const start = Date.now();

  const { error, stdout, stderr, code } = await runPnpmAudit();

  if (error && error.code === "ENOENT") {
    await writeReport({
      tool: TOOL,
      tier: TIER,
      status: "skipped",
      summary: {
        reason: "pnpm not found on PATH. Install pnpm to run security audit.",
        vulnerabilities: emptyCounts(),
      },
      artifacts: [],
      durationMs: Date.now() - start,
    });
    console.error("[audit] pnpm not found — skipping (install pnpm to enable this check).");
    process.exit(0);
  }

  const { counts, advisoryCount, raw } = parseAudit(stdout);
  const highOrCritical = (counts.high ?? 0) + (counts.critical ?? 0);
  const status = highOrCritical > 0 ? "fail" : "pass";

  const artifactPath = await writeReport({
    tool: TOOL,
    tier: TIER,
    status,
    summary: {
      vulnerabilities: counts,
      advisoryCount,
      auditLevel: "high",
      exitCode: code,
      ...(raw ? { rawSample: raw } : {}),
      ...(stderr ? { stderrSample: stderr.slice(0, 500) } : {}),
    },
    artifacts: [],
    durationMs: Date.now() - start,
  });

  console.log(
    `[audit] ${status.toUpperCase()} — high=${counts.high} critical=${counts.critical} (report: ${artifactPath})`
  );
  process.exit(status === "fail" ? 1 : 0);
}

main().catch(async (err) => {
  console.error("[audit] unexpected error:", err);
  await writeReport({
    tool: TOOL,
    tier: TIER,
    status: "fail",
    summary: { error: String(err?.message ?? err), vulnerabilities: emptyCounts() },
    artifacts: [],
    durationMs: 0,
  });
  process.exit(1);
});
