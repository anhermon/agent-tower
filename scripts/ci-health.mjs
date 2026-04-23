#!/usr/bin/env node

// Aggregates every .ci/reports/<tool>.json into a single .ci/reports/latest.json
// and prints a one-line health board. An agent can answer "is the project
// healthy?" with a single file read.

import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const REPORTS_DIR = resolve(REPO_ROOT, ".ci/reports");

const STATUS_ICON = { pass: "✓", fail: "✗", skipped: "–" };
const STATUS_COLOR = { pass: "\x1b[32m", fail: "\x1b[31m", skipped: "\x1b[90m" };
const RESET = "\x1b[0m";

async function main() {
  if (!existsSync(REPORTS_DIR)) {
    console.error(`no reports directory at ${REPORTS_DIR} — run a ci:* task first`);
    process.exit(2);
  }

  const entries = await readdir(REPORTS_DIR);
  const jsonFiles = entries.filter((name) => name.endsWith(".json") && name !== "latest.json");

  if (jsonFiles.length === 0) {
    console.error(`no tool reports found in ${REPORTS_DIR}`);
    process.exit(2);
  }

  const reports = [];
  for (const file of jsonFiles.sort()) {
    try {
      const raw = await readFile(resolve(REPORTS_DIR, file), "utf8");
      reports.push(JSON.parse(raw));
    } catch (err) {
      reports.push({
        tool: file.replace(/\.json$/, ""),
        tier: "?",
        ranAt: null,
        status: "fail",
        summary: { error: `could not parse: ${err.message}` },
        artifacts: [],
        durationMs: 0,
      });
    }
  }

  const failed = reports.filter((r) => r.status === "fail");
  const skipped = reports.filter((r) => r.status === "skipped");
  const passed = reports.filter((r) => r.status === "pass");
  const overall = failed.length > 0 ? "fail" : "pass";

  const latest = {
    generatedAt: new Date().toISOString(),
    overall,
    counts: {
      total: reports.length,
      pass: passed.length,
      fail: failed.length,
      skipped: skipped.length,
    },
    tools: reports
      .map((r) => ({
        tool: r.tool,
        tier: r.tier,
        status: r.status,
        ranAt: r.ranAt,
        durationMs: r.durationMs,
      }))
      .sort((a, b) => (a.tier || "").localeCompare(b.tier || "") || a.tool.localeCompare(b.tool)),
    failures: failed.map((r) => ({
      tool: r.tool,
      tier: r.tier,
      summary: r.summary,
    })),
  };

  await writeFile(
    resolve(REPORTS_DIR, "latest.json"),
    `${JSON.stringify(latest, null, 2)}\n`,
    "utf8"
  );

  // Pretty-print the board.
  const width = Math.max(...reports.map((r) => r.tool.length), 6);
  console.log("");
  console.log(
    `  CI health board — ${overall === "pass" ? "\x1b[32mHEALTHY\x1b[0m" : "\x1b[31mUNHEALTHY\x1b[0m"}`
  );
  console.log(`  ${"─".repeat(width + 24)}`);
  for (const r of latest.tools) {
    const color = STATUS_COLOR[r.status] ?? "";
    const icon = STATUS_ICON[r.status] ?? "?";
    const ms = r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : "—";
    console.log(
      `  ${color}${icon}${RESET}  ${(r.tier || "?").padEnd(3)}  ${r.tool.padEnd(width)}  ${ms}`
    );
  }
  console.log("");
  console.log(
    `  ${passed.length} pass · ${failed.length} fail · ${skipped.length} skipped · report: .ci/reports/latest.json`
  );
  console.log("");

  process.exit(overall === "pass" ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
