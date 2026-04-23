#!/usr/bin/env node
// Generates a CycloneDX SBOM via `cdxgen` and writes a summary report.
import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { paths, writeReport } from "./lib/report.mjs";

const TOOL = "sbom";
const TIER = "T3";
const SBOM_ARTIFACT = resolve(paths.reportsDir, "sbom.cdx.json");

function runCdxgen() {
  return new Promise((resolvePromise) => {
    const proc = spawn(
      "pnpm",
      ["exec", "cdxgen", "-t", "js", "-o", SBOM_ARTIFACT, "--spec-version", "1.5"],
      { cwd: paths.repoRoot, env: process.env }
    );

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (c) => {
      stdout += c.toString("utf8");
    });
    proc.stderr.on("data", (c) => {
      stderr += c.toString("utf8");
    });
    proc.on("error", (err) => {
      resolvePromise({ error: err, stdout, stderr, code: null });
    });
    proc.on("close", (code) => {
      resolvePromise({ error: null, stdout, stderr, code });
    });
  });
}

async function countComponents(path) {
  try {
    const buf = await readFile(path, "utf8");
    const parsed = JSON.parse(buf);
    if (Array.isArray(parsed?.components)) return parsed.components.length;
    return 0;
  } catch {
    return 0;
  }
}

async function main() {
  const start = Date.now();
  await mkdir(paths.reportsDir, { recursive: true });

  const { error, stdout, stderr, code } = await runCdxgen();

  if (error && error.code === "ENOENT") {
    await writeReport({
      tool: TOOL,
      tier: TIER,
      status: "skipped",
      summary: {
        reason: "pnpm not found on PATH.",
        componentCount: 0,
      },
      artifacts: [],
      durationMs: Date.now() - start,
    });
    console.error("[sbom] pnpm not found — skipping.");
    process.exit(0);
  }

  const combined = `${stdout}\n${stderr}`;
  const notInstalled =
    /command not found|is not recognized|ERR_PNPM_RECURSIVE_EXEC|cdxgen.*not.*found/i.test(
      combined
    );

  if (notInstalled && code !== 0) {
    await writeReport({
      tool: TOOL,
      tier: TIER,
      status: "skipped",
      summary: {
        reason: "@cyclonedx/cdxgen is not installed. Run: pnpm add -D -w @cyclonedx/cdxgen",
        componentCount: 0,
        stderrSample: stderr.slice(0, 500),
      },
      artifacts: [],
      durationMs: Date.now() - start,
    });
    console.error("[sbom] cdxgen not installed — skipping.");
    process.exit(0);
  }

  if (code !== 0) {
    await writeReport({
      tool: TOOL,
      tier: TIER,
      status: "fail",
      summary: {
        reason: `cdxgen exited with code ${code}`,
        componentCount: 0,
        stderrSample: stderr.slice(0, 500),
      },
      artifacts: [],
      durationMs: Date.now() - start,
    });
    console.error(`[sbom] FAIL — cdxgen exit ${code}`);
    process.exit(1);
  }

  const componentCount = await countComponents(SBOM_ARTIFACT);
  const reportPath = await writeReport({
    tool: TOOL,
    tier: TIER,
    status: "pass",
    summary: {
      generatorTool: "@cyclonedx/cdxgen",
      specVersion: "1.5",
      sbomPath: SBOM_ARTIFACT,
      componentCount,
      generatedAt: new Date().toISOString(),
    },
    artifacts: [SBOM_ARTIFACT],
    durationMs: Date.now() - start,
  });

  console.log(
    `[sbom] PASS — ${componentCount} components (sbom: ${SBOM_ARTIFACT}, report: ${reportPath})`
  );
  process.exit(0);
}

main().catch(async (err) => {
  console.error("[sbom] unexpected error:", err);
  await writeReport({
    tool: TOOL,
    tier: TIER,
    status: "fail",
    summary: { error: String(err?.message ?? err), componentCount: 0 },
    artifacts: [],
    durationMs: 0,
  });
  process.exit(1);
});
