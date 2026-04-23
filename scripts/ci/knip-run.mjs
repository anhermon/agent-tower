#!/usr/bin/env node
import { spawn } from "node:child_process";

import { writeReport } from "./lib/report.mjs";

const TIER = "T3";
const TOOL = "knip";
const FAIL_TYPES = ["files", "dependencies", "unlisted", "exports"];

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

function countIssues(report) {
  const counts = {
    unusedFiles: 0,
    unusedDeps: 0,
    unusedExports: 0,
    unlistedDeps: 0,
  };

  if (!report) return counts;

  // knip json reporter: { files: [...], issues: [ { file, dependencies, devDependencies, unlisted, exports, types, ... } ] }
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

  // Some knip versions output a flat array of issue objects with `type`.
  if (Array.isArray(report)) {
    for (const item of report) {
      switch (item.type) {
        case "files":
          counts.unusedFiles += 1;
          break;
        case "dependencies":
        case "devDependencies":
          counts.unusedDeps += 1;
          break;
        case "unlisted":
        case "unresolved":
          counts.unlistedDeps += 1;
          break;
        case "exports":
        case "types":
        case "nsExports":
        case "nsTypes":
          counts.unusedExports += 1;
          break;
      }
    }
  }

  return counts;
}

function hasFailingIssues(report, counts) {
  if (
    counts.unusedFiles > 0 ||
    counts.unusedDeps > 0 ||
    counts.unlistedDeps > 0 ||
    counts.unusedExports > 0
  ) {
    return true;
  }
  // Defensive: scan raw report for any of FAIL_TYPES
  const blob = JSON.stringify(report || {});
  return FAIL_TYPES.some((t) => blob.includes(`"${t}"`));
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
  const status = !failing && code === 0 ? "pass" : "fail";

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
