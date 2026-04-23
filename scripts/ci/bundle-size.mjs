#!/usr/bin/env node
import { spawn } from "node:child_process";

import { writeReport } from "./lib/report.mjs";

const TIER = "T3";
const TOOL = "bundle-size";

function runSizeLimit() {
  return new Promise((resolve) => {
    const child = spawn("pnpm", ["exec", "size-limit", "--json"], {
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

function parseLimit(raw) {
  if (typeof raw === "number") return raw;
  if (typeof raw !== "string") return null;
  const m = raw.trim().match(/^([\d.]+)\s*(B|KB|MB|GB)?$/i);
  if (!m) return null;
  const value = Number(m[1]);
  const unit = (m[2] || "B").toUpperCase();
  const factor = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 }[unit] ?? 1;
  return Math.round(value * factor);
}

function extractJson(stdout) {
  const start = stdout.indexOf("[");
  const end = stdout.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(stdout.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function main() {
  const started = Date.now();
  const { code, stdout, stderr } = await runSizeLimit();
  const parsed = extractJson(stdout);

  if (!parsed) {
    await writeReport({
      tool: TOOL,
      tier: TIER,
      status: "fail",
      summary: { totals: [], error: "could not parse size-limit output" },
      artifacts: { stdout: stdout.slice(-4000), stderr: stderr.slice(-4000) },
      durationMs: Date.now() - started,
    });
    process.exit(code || 1);
  }

  const totals = parsed.map((entry) => {
    const size = Number(entry.size ?? 0);
    const limit = parseLimit(entry.sizeLimit) ?? parseLimit(entry.limit) ?? null;
    const passed =
      typeof entry.passed === "boolean" ? entry.passed : limit == null ? true : size <= limit;
    return { name: entry.name, size, limit, passed };
  });

  const status = code === 0 && totals.every((t) => t.passed) ? "pass" : "fail";

  await writeReport({
    tool: TOOL,
    tier: TIER,
    status,
    summary: { totals },
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
    summary: { totals: [], error: String(err) },
    artifacts: {},
    durationMs: 0,
  });
  process.exit(1);
});
