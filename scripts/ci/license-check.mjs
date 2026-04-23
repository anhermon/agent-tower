#!/usr/bin/env node
// Runs `license-checker-rseidelsohn --production --json` and fails on disallowed licenses.
// Workspace packages (@control-plane/*) are ignored.
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { paths, writeReport } from "./lib/report.mjs";

const TOOL = "license-check";
const TIER = "T2";

const DISALLOWED_PATTERNS = [
  /GPL/i, // catches GPL, LGPL, AGPL
  /AGPL/i,
  /LGPL/i,
  /SSPL/i,
  /BUSL/i,
  /Commons-Clause/i,
  /EUPL/i,
];

const WORKSPACE_PREFIX = "@control-plane/";
const FULL_ARTIFACT = resolve(paths.reportsDir, "licenses.full.json");

function runLicenseChecker() {
  return new Promise((resolvePromise) => {
    const proc = spawn("pnpm", ["exec", "license-checker-rseidelsohn", "--production", "--json"], {
      cwd: paths.repoRoot,
      env: process.env,
    });

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

function splitKey(key) {
  // keys look like "name@version" or "@scope/name@version"
  const atIdx = key.lastIndexOf("@");
  if (atIdx <= 0) return { name: key, version: "" };
  return { name: key.slice(0, atIdx), version: key.slice(atIdx + 1) };
}

function licenseString(entry) {
  const l = entry?.licenses;
  if (!l) return "UNKNOWN";
  if (Array.isArray(l)) return l.join(" OR ");
  return String(l);
}

function isDisallowed(license) {
  return DISALLOWED_PATTERNS.some((re) => re.test(license));
}

async function main() {
  const start = Date.now();
  const { error, stdout, stderr, code } = await runLicenseChecker();

  await checkCheckerAvailability(error, stderr, code, start);

  const parsed = await parseLicenseOutput(stdout, stderr, start);

  const { violations, fullList, total, allowedCount } = classifyPackages(parsed);

  await mkdir(paths.reportsDir, { recursive: true });
  await writeFile(
    FULL_ARTIFACT,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), packages: fullList }, null, 2)}\n`,
    "utf8"
  );

  const status = violations.length > 0 ? "fail" : "pass";
  const reportPath = await writeReport({
    tool: TOOL,
    tier: TIER,
    status,
    summary: {
      total,
      allowedCount,
      violations,
      disallowedPatterns: DISALLOWED_PATTERNS.map((r) => r.source),
    },
    artifacts: [FULL_ARTIFACT],
    durationMs: Date.now() - start,
  });

  console.log(
    `[license-check] ${status.toUpperCase()} — ${total} pkgs, ${violations.length} violation(s) (report: ${reportPath})`
  );
  if (violations.length > 0) {
    for (const v of violations) {
      console.error(`  - ${v.name}@${v.version} :: ${v.license}`);
    }
  }
  process.exit(status === "fail" ? 1 : 0);
}

async function checkCheckerAvailability(error, stderr, code, start) {
  if (error && error.code === "ENOENT") {
    await writeReport({
      tool: TOOL,
      tier: TIER,
      status: "skipped",
      summary: { reason: "pnpm not found on PATH.", total: 0, violations: [], allowedCount: 0 },
      artifacts: [],
      durationMs: Date.now() - start,
    });
    console.error("[license-check] pnpm not found — skipping.");
    process.exit(0);
  }

  const missing =
    (!error &&
      /command not found|is not recognized|ERR_PNPM_RECURSIVE_EXEC|ELSPROBLEMS/i.test(stderr)) ||
    code !== 0;
  if (missing) {
    await writeReport({
      tool: TOOL,
      tier: TIER,
      status: "skipped",
      summary: {
        reason:
          "license-checker-rseidelsohn is not installed. Run: pnpm add -D -w license-checker-rseidelsohn",
        total: 0,
        violations: [],
        allowedCount: 0,
        stderrSample: stderr.slice(0, 500),
      },
      artifacts: [],
      durationMs: Date.now() - start,
    });
    console.error("[license-check] license-checker-rseidelsohn not installed — skipping.");
    process.exit(0);
  }
}

async function parseLicenseOutput(stdout, stderr, start) {
  try {
    return JSON.parse(stdout);
  } catch (err) {
    await writeReport({
      tool: TOOL,
      tier: TIER,
      status: "fail",
      summary: {
        reason: `failed to parse license-checker output: ${err.message}`,
        total: 0,
        violations: [],
        allowedCount: 0,
        stdoutSample: stdout.slice(0, 500),
      },
      artifacts: [],
      durationMs: Date.now() - start,
    });
    console.error("[license-check] FAIL — could not parse license output.");
    process.exit(1);
  }
}

function classifyPackages(parsed) {
  const violations = [];
  const fullList = [];
  let total = 0;
  let allowedCount = 0;

  for (const [key, entry] of Object.entries(parsed)) {
    const { name, version } = splitKey(key);
    if (name.startsWith(WORKSPACE_PREFIX)) continue;
    total += 1;
    const license = licenseString(entry);
    fullList.push({ name, version, license, repository: entry?.repository ?? null });
    if (isDisallowed(license)) {
      violations.push({ name, version, license });
    } else {
      allowedCount += 1;
    }
  }
  return { violations, fullList, total, allowedCount };
}

main().catch(async (err) => {
  console.error("[license-check] unexpected error:", err);
  await writeReport({
    tool: TOOL,
    tier: TIER,
    status: "fail",
    summary: {
      error: String(err?.message ?? err),
      total: 0,
      violations: [],
      allowedCount: 0,
    },
    artifacts: [],
    durationMs: 0,
  });
  process.exit(1);
});
