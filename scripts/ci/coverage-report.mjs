#!/usr/bin/env node
// Post-processor for Vitest v8 coverage output.
//
// Reads `.coverage-reports/coverage-summary.json` (produced by the
// `json-summary` reporter) and emits `.ci/reports/coverage.json` in the
// project-standard report contract consumed by `task ci:fast`.
//
// Usage:
//   node scripts/ci/coverage-report.mjs
//
// Exit codes:
//   0 - report written (status may be pass|fail|skipped)
//   2 - unexpected error (summary malformed, IO failure)
//
// Note: `status: "fail"` here means the vitest run reported thresholds were
// not met. Threshold enforcement is done by vitest itself (see
// `vitest.coverage.config.ts`). This script is a reporter, not a gate — it
// just reflects whatever vitest produced. If vitest exits non-zero the
// caller will have seen that; we still try to summarise whatever summary
// file exists so the CI dashboard can render the numbers.

import { readFile, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

import { paths, writeReport } from "./lib/report.mjs";

const REPO_ROOT = paths.repoRoot;
const SUMMARY_PATH = resolve(REPO_ROOT, ".coverage-reports/coverage-summary.json");
const COVERAGE_DIR = resolve(REPO_ROOT, ".coverage-reports");

// Global thresholds kept in sync with `vitest.coverage.config.ts`. Used only
// to compute `status` when the summary is present; vitest itself is the
// source of truth for failing a run.
const GLOBAL_THRESHOLDS = {
  lines: 60,
  functions: 60,
  branches: 55,
  statements: 60,
};

const METRICS = ["lines", "functions", "branches", "statements"];

/**
 * Identify which workspace package a covered file belongs to. Returns a
 * stable bucket key for the report (`packages/<name>` or `apps/<name>`).
 */
function bucketFor(absPath) {
  const rel = relative(REPO_ROOT, absPath).split(sep);
  if (rel[0] === "packages" && rel[1]) return `packages/${rel[1]}`;
  if (rel[0] === "apps" && rel[1]) return `apps/${rel[1]}`;
  return "other";
}

function emptyMetrics() {
  return {
    lines: { total: 0, covered: 0, pct: 0 },
    functions: { total: 0, covered: 0, pct: 0 },
    branches: { total: 0, covered: 0, pct: 0 },
    statements: { total: 0, covered: 0, pct: 0 },
  };
}

function accumulate(target, entry) {
  for (const m of METRICS) {
    const src = entry[m];
    if (!src) continue;
    target[m].total += src.total ?? 0;
    target[m].covered += src.covered ?? 0;
  }
}

function finalizePct(bucket) {
  for (const m of METRICS) {
    const { total, covered } = bucket[m];
    bucket[m].pct = total === 0 ? 100 : Number(((covered / total) * 100).toFixed(2));
  }
  return bucket;
}

function pickTotals(summaryTotal) {
  // vitest's `total` is already the shape we want; just normalize pct.
  const out = emptyMetrics();
  for (const m of METRICS) {
    const src = summaryTotal?.[m] ?? {};
    out[m] = {
      total: src.total ?? 0,
      covered: src.covered ?? 0,
      pct: Number.isFinite(src.pct) ? src.pct : 0,
    };
  }
  return out;
}

function passes(totals) {
  return METRICS.every((m) => (totals[m]?.pct ?? 0) >= GLOBAL_THRESHOLDS[m]);
}

async function main() {
  const startedAt = Date.now();

  let summaryRaw;
  try {
    await stat(SUMMARY_PATH);
    summaryRaw = await readFile(SUMMARY_PATH, "utf8");
  } catch (_err) {
    // No summary yet — mark the report as skipped rather than failing the
    // whole dashboard. This happens on fresh clones before the first run.
    await writeReport({
      tool: "vitest-coverage",
      tier: "T2",
      status: "skipped",
      summary: {
        reason: "coverage-summary.json not found",
        expectedPath: relative(REPO_ROOT, SUMMARY_PATH),
      },
      artifacts: [],
      durationMs: Date.now() - startedAt,
    });
    return;
  }

  let summary;
  try {
    summary = JSON.parse(summaryRaw);
  } catch (err) {
    process.stderr.write(`coverage-report: failed to parse ${SUMMARY_PATH}: ${err.message}\n`);
    process.exitCode = 2;
    return;
  }

  const totals = pickTotals(summary.total);

  // Group per-file entries into package buckets. Keys in `summary` are
  // absolute paths plus the literal key "total".
  const packages = {};
  for (const [key, entry] of Object.entries(summary)) {
    if (key === "total") continue;
    const bucket = bucketFor(key);
    if (!packages[bucket]) packages[bucket] = emptyMetrics();
    accumulate(packages[bucket], entry);
  }
  for (const key of Object.keys(packages)) finalizePct(packages[key]);

  const status = passes(totals) ? "pass" : "fail";

  await writeReport({
    tool: "vitest-coverage",
    tier: "T2",
    status,
    summary: {
      total: totals,
      packages,
      thresholds: GLOBAL_THRESHOLDS,
    },
    artifacts: [
      relative(REPO_ROOT, SUMMARY_PATH),
      relative(REPO_ROOT, resolve(COVERAGE_DIR, "lcov.info")),
      relative(REPO_ROOT, resolve(COVERAGE_DIR, "index.html")),
    ],
    durationMs: Date.now() - startedAt,
  });
}

main().catch((err) => {
  process.stderr.write(`coverage-report: ${err?.stack ?? err}\n`);
  process.exitCode = 2;
});
