#!/usr/bin/env node
import { spawn } from "node:child_process";

import { writeReport } from "./lib/report.mjs";

const TIER = "T3";
const TOOL = "knip";
// Phase 1 skeleton ships many exported-but-not-yet-consumed APIs; only fail on
// structural issues (unused files, missing deps) until the API surface matures.
const FAIL_TYPES = ["files", "dependencies", "unlisted"];

function runKnip() {
  return new Promise((resolve) => {
    const child = spawn("pnpm", ["exec", "knip", "--reporter", "json"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    child.on("error", (err) => resolve({ code: 1, stdout, stderr: stderr + String(err) }));
  });
}

function extractJson(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    // knip may emit a banner line before JSON; try last `{...}` or `[...]`
    const first = trimmed.search(/[[{]/);
    if (first === -1) return null;
    try {
      return JSON.parse(trimmed.slice(first));
    } catch {
      return null;
    }
  }
}

function emptyIssueCounts() {
  return { unusedFiles: 0, unusedDeps: 0, unusedExports: 0, unlistedDeps: 0 };
}

/** Accumulate counts from the structured { files, issues } knip reporter shape. */
function accumulateStructured(report, counts) {
  if (Array.isArray(report.files)) counts.unusedFiles += report.files.length;
  const issues = Array.isArray(report.issues) ? report.issues : [];
  for (const item of issues) {
    if (Array.isArray(item.dependencies)) counts.unusedDeps += item.dependencies.length;
    if (Array.isArray(item.devDependencies)) counts.unusedDeps += item.devDependencies.length;
    if (Array.isArray(item.unlisted)) counts.unlistedDeps += item.unlisted.length;
    if (Array.isArray(item.unresolved)) counts.unlistedDeps += item.unresolved.length;
    if (Array.isArray(item.exports)) counts.unusedExports += item.exports.length;
    if (Array.isArray(item.types)) counts.unusedExports += item.types.length;
  }
}

const FLAT_TYPE_TO_COUNT_KEY = {
  files: "unusedFiles",
  dependencies: "unusedDeps",
  devDependencies: "unusedDeps",
  unlisted: "unlistedDeps",
  unresolved: "unlistedDeps",
  exports: "unusedExports",
  types: "unusedExports",
  nsExports: "unusedExports",
  nsTypes: "unusedExports",
};

/** Accumulate counts from the flat array-of-typed-issues knip reporter shape. */
function accumulateFlat(report, counts) {
  for (const item of report) {
    const key = FLAT_TYPE_TO_COUNT_KEY[item.type];
    if (key) counts[key] += 1;
  }
}

function countIssues(report) {
  const counts = emptyIssueCounts();
  if (!report) return counts;

  // knip json reporter: { files: [...], issues: [ { file, dependencies, devDependencies, unlisted, exports, types, ... } ] }
  accumulateStructured(report, counts);

  // Some knip versions output a flat array of issue objects with `type`.
  if (Array.isArray(report)) {
    accumulateFlat(report, counts);
  }

  return counts;
}

function hasFailingIssues(report, counts) {
  if (
    counts.unusedFiles > 0 ||
    counts.unusedDeps > 0 ||
    counts.unlistedDeps > 0
    // unusedExports intentionally excluded: Phase 1 exports many future-use APIs
  ) {
    return true;
  }
  return false;
}

async function main() {
  const started = Date.now();
  const { code, stdout, stderr } = await runKnip();
  const parsed = extractJson(stdout);

  if (!parsed) {
    await writeReport({
      tool: TOOL,
      tier: TIER,
      status: "fail",
      summary: {
        unusedFiles: 0,
        unusedDeps: 0,
        unusedExports: 0,
        unlistedDeps: 0,
        error: "could not parse knip output",
      },
      artifacts: { stdout: stdout.slice(-4000), stderr: stderr.slice(-4000) },
      durationMs: Date.now() - started,
    });
    process.exit(code || 1);
  }

  const summary = countIssues(parsed);
  const failing = hasFailingIssues(parsed, summary);
  // knip exits 1 when it finds any issues (including non-failing ones like unused
  // exports); use only our own gate logic to decide pass/fail.
  const status = !failing ? "pass" : "fail";

  await writeReport({
    tool: TOOL,
    tier: TIER,
    status,
    summary,
    artifacts: { raw: parsed },
    durationMs: Date.now() - started,
  });

  process.exit(status === "pass" ? 0 : 1);
}

main().catch(async (err) => {
  await writeReport({
    tool: TOOL,
    tier: TIER,
    status: "fail",
    summary: {
      unusedFiles: 0,
      unusedDeps: 0,
      unusedExports: 0,
      unlistedDeps: 0,
      error: String(err),
    },
    artifacts: {},
    durationMs: 0,
  });
  process.exit(1);
});
