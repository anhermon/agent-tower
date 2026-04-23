#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const CALLBACK_URL_ENV = "CLAUDE_CONTROL_PLANE_GITHUB_WEBHOOK_URL";
const SECRET_ENV = "CLAUDE_CONTROL_PLANE_GITHUB_WEBHOOK_SECRET";
const DEFAULT_EVENTS = [
  "push",
  "pull_request",
  "issues",
  "issue_comment",
  "pull_request_review",
  "pull_request_review_comment",
  "check_run",
  "check_suite",
  "workflow_run",
];
const GITHUB_REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const CONTROL_PLANE_PATH = "/api/webhooks/github";

const args = parseArgs(process.argv.slice(2));
const repo = args.repo ?? process.env.GITHUB_REPOSITORY ?? inferRepoFromOrigin();
const callbackUrl = normalizeCallbackUrl(args.url ?? process.env[CALLBACK_URL_ENV]);
const secretEnv = args.secretEnv ?? SECRET_ENV;
const secret = process.env[secretEnv];
const events = args.events ?? DEFAULT_EVENTS;

if (!repo || !GITHUB_REPO_PATTERN.test(repo)) {
  fail("Missing repository. Pass --repo owner/name or run after origin is configured.");
}

if (!callbackUrl) {
  fail(
    `Missing callback URL. Set ${CALLBACK_URL_ENV}=https://public-host${CONTROL_PLANE_PATH} or pass --url.`
  );
}

if (!secret) {
  fail(`Missing webhook secret. Set ${secretEnv} before creating the GitHub webhook.`);
}

const hooks = ghApi("GET", `repos/${repo}/hooks`);
if (!Array.isArray(hooks)) {
  fail("GitHub did not return a hooks array.");
}

const payload = {
  name: "web",
  active: true,
  events,
  config: {
    url: callbackUrl,
    content_type: "json",
    insecure_ssl: "0",
    secret,
  },
};

const existing = hooks.find((hook) => hook?.config?.url === callbackUrl);
const result = existing
  ? ghApi("PATCH", `repos/${repo}/hooks/${existing.id}`, payload)
  : ghApi("POST", `repos/${repo}/hooks`, payload);

console.log(
  JSON.stringify(
    {
      action: existing ? "updated" : "created",
      repo,
      hookId: result.id,
      url: callbackUrl,
      events,
      active: true,
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
    if (arg === "--url" && next) {
      parsed.url = next;
      i += 1;
      continue;
    }
    if (arg === "--secret-env" && next) {
      parsed.secretEnv = next;
      i += 1;
      continue;
    }
    if (arg === "--events" && next) {
      parsed.events = next
        .split(",")
        .map((event) => event.trim())
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

function normalizeCallbackUrl(raw) {
  if (!raw) return null;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    fail(`Invalid callback URL: ${raw}`);
  }

  if (parsed.protocol !== "https:") {
    fail("GitHub webhook callback URL must use https.");
  }

  if (parsed.pathname === "/" || parsed.pathname === "") {
    parsed.pathname = CONTROL_PLANE_PATH;
  }

  if (parsed.pathname !== CONTROL_PLANE_PATH) {
    fail(`Callback URL path must be ${CONTROL_PLANE_PATH}; got ${parsed.pathname}.`);
  }

  parsed.hash = "";
  return parsed.toString();
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
  const command = [
    "api",
    "--method",
    method,
    path,
    "--header",
    "Accept: application/vnd.github+json",
    "--header",
    "X-GitHub-Api-Version: 2022-11-28",
  ];
  const options = { encoding: "utf8" };
  if (body !== undefined) {
    command.push("--input", "-");
    options.input = JSON.stringify(body);
  }

  const result = spawnSync("gh", command, options);
  if (result.status !== 0) {
    fail(result.stderr.trim() || `gh api failed: ${method} ${path}`);
  }

  if (!result.stdout.trim()) return {};
  try {
    return JSON.parse(result.stdout);
  } catch {
    fail(`gh api returned invalid JSON for ${method} ${path}.`);
  }
}

function printHelp() {
  console.log(`Create or update the GitHub repository webhook for Control Plane.

Required:
  ${CALLBACK_URL_ENV}=https://public-host${CONTROL_PLANE_PATH}
  ${SECRET_ENV}=<shared secret also configured in the web app>

Usage:
  node scripts/github/setup-webhook.mjs --repo owner/name

Options:
  --repo owner/name       Repository to configure. Defaults to GITHUB_REPOSITORY or origin.
  --url https://...       Public callback URL. Defaults to ${CALLBACK_URL_ENV}.
  --secret-env NAME       Env var containing the secret. Defaults to ${SECRET_ENV}.
  --events a,b,c          Comma-separated GitHub event list. Defaults to agent-relevant events.
`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
