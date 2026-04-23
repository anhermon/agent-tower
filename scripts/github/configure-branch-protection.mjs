#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const DEFAULT_BRANCH = "main";
const DEFAULT_REQUIRED_CHECKS = ["ci-fast"];
const REQUIRED_CHECKS_ENV = "CONTROL_PLANE_REQUIRED_CHECKS";
const GITHUB_REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

const args = parseArgs(process.argv.slice(2));
const repo = args.repo ?? process.env.GITHUB_REPOSITORY ?? inferRepoFromOrigin();
const branch = args.branch ?? DEFAULT_BRANCH;
const requiredChecks = args.requiredChecks ?? parseRequiredChecks();

if (!repo || !GITHUB_REPO_PATTERN.test(repo)) {
  fail("Missing repository. Pass --repo owner/name or run after origin is configured.");
}

const payload = {
  required_status_checks: {
    strict: true,
    contexts: requiredChecks,
  },
  enforce_admins: false,
  required_pull_request_reviews: {
    dismiss_stale_reviews: true,
    require_code_owner_reviews: false,
    required_approving_review_count: 1,
  },
  restrictions: null,
  required_linear_history: true,
  allow_force_pushes: false,
  allow_deletions: false,
};

ghApi("PUT", `repos/${repo}/branches/${encodeURIComponent(branch)}/protection`, payload);

console.log(
  JSON.stringify(
    {
      repo,
      branch,
      requiredChecks,
      pullRequestReviews: 1,
      requiredLinearHistory: true,
    },
    null,
    2
  )
);

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--repo" && next) {
      parsed.repo = next;
      i += 1;
      continue;
    }
    if (arg === "--branch" && next) {
      parsed.branch = next;
      i += 1;
      continue;
    }
    if (arg === "--checks" && next) {
      parsed.requiredChecks = next
        .split(",")
        .map((check) => check.trim())
        .filter(Boolean);
      i += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    fail(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function parseRequiredChecks() {
  const raw = process.env[REQUIRED_CHECKS_ENV];
  if (!raw) return DEFAULT_REQUIRED_CHECKS;
  const checks = raw
    .split(",")
    .map((check) => check.trim())
    .filter(Boolean);
  return checks.length > 0 ? checks : DEFAULT_REQUIRED_CHECKS;
}

function inferRepoFromOrigin() {
  const result = spawnSync("git", ["remote", "get-url", "origin"], {
    encoding: "utf8",
  });
  if (result.status !== 0) return null;
  const remote = result.stdout.trim();
  const ssh = remote.match(/^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/);
  if (ssh) return ssh[1];
  const https = remote.match(/^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/);
  return https?.[1] ?? null;
}

function ghApi(method, path, body) {
  const result = spawnSync(
    "gh",
    [
      "api",
      "--method",
      method,
      path,
      "--header",
      "Accept: application/vnd.github+json",
      "--header",
      "X-GitHub-Api-Version: 2022-11-28",
      "--input",
      "-",
    ],
    {
      encoding: "utf8",
      input: JSON.stringify(body),
    }
  );

  if (result.status !== 0) {
    fail(result.stderr.trim() || `gh api failed: ${method} ${path}`);
  }
}

function printHelp() {
  console.log(`Configure GitHub branch protection for Control Plane.

Usage:
  node scripts/github/configure-branch-protection.mjs --repo owner/name

Options:
  --repo owner/name       Repository to configure. Defaults to GITHUB_REPOSITORY or origin.
  --branch name           Branch to protect. Defaults to ${DEFAULT_BRANCH}.
  --checks a,b,c          Required status check contexts. Defaults to ${DEFAULT_REQUIRED_CHECKS.join(",")}.

Environment:
  ${REQUIRED_CHECKS_ENV}=ci-fast,ci
`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
