import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

/**
 * Prepares deterministic, initially-empty data roots for the on-disk adapter
 * modules (sessions + skills) before Playwright spawns the dashboard dev
 * server. Individual specs seed these directories in their own `beforeAll`
 * hooks and clean up in `afterAll`.
 */
export const SESSIONS_FIXTURE_ROOT = path.resolve(
  process.cwd(),
  "test-results",
  "e2e-claude-fixture"
);

export const SKILLS_FIXTURE_ROOT = path.resolve(
  process.cwd(),
  "test-results",
  "e2e-skills-fixture"
);

export default async function globalSetup(): Promise<void> {
  for (const target of [SESSIONS_FIXTURE_ROOT, SKILLS_FIXTURE_ROOT]) {
    await rm(target, { recursive: true, force: true });
    await mkdir(target, { recursive: true });
  }
}
