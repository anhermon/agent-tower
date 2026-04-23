import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * Fixture root for the Claude Code sessions adapter during e2e. The directory
 * is recreated empty by `e2e/global-setup.ts` before the dev server boots.
 * Specs that want transcripts write into this directory and clean up after.
 */
const SESSIONS_FIXTURE_ROOT = path.resolve(
  process.cwd(),
  "test-results",
  "e2e-claude-fixture"
);

const SKILLS_FIXTURE_ROOT = path.resolve(
  process.cwd(),
  "test-results",
  "e2e-skills-fixture"
);

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  // The sessions e2e suite shares on-disk fixtures with the dev server, so run
  // specs sequentially to keep seed/cleanup deterministic across files.
  workers: 1,
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry"
  },
  webServer: {
    command: "pnpm dev",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      CLAUDE_CONTROL_PLANE_DATA_ROOT: SESSIONS_FIXTURE_ROOT,
      CONTROL_PLANE_SKILLS_ROOTS: SKILLS_FIXTURE_ROOT
    }
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] }
    }
  ]
});
