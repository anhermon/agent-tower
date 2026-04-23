#!/usr/bin/env node
// Tiny helper for writing standardized CI tool reports to .ci/reports/<tool>.json.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const REPO_ROOT = resolve(new URL("../../..", import.meta.url).pathname);
const REPORTS_DIR = resolve(REPO_ROOT, ".ci/reports");

/**
 * Write a standardized report file to .ci/reports/<tool>.json.
 *
 * @param {object} params
 * @param {string} params.tool          - Tool name (becomes file name).
 * @param {"T1"|"T2"|"T3"|"T4"} params.tier
 * @param {"pass"|"fail"|"skipped"} params.status
 * @param {Record<string, unknown>} params.summary
 * @param {string[]} [params.artifacts] - Relative/absolute artifact paths.
 * @param {number} params.durationMs
 * @returns {Promise<string>}           - Absolute path to the written report.
 */
export async function writeReport({ tool, tier, status, summary, artifacts = [], durationMs }) {
  if (!tool) throw new Error("writeReport: 'tool' is required");
  if (!tier) throw new Error("writeReport: 'tier' is required");
  if (!status) throw new Error("writeReport: 'status' is required");

  const report = {
    tool,
    tier,
    ranAt: new Date().toISOString(),
    status,
    summary: summary ?? {},
    artifacts,
    durationMs: Number.isFinite(durationMs) ? durationMs : 0,
  };

  const outPath = resolve(REPORTS_DIR, `${tool}.json`);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return outPath;
}

export const paths = {
  repoRoot: REPO_ROOT,
  reportsDir: REPORTS_DIR,
};
