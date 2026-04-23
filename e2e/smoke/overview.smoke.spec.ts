/**
 * Smoke spec template — BDD-style.
 *
 * Tier: T3 (runs in `task ci` via the `smoke` project).
 *
 * New smoke specs should follow this shape:
 *   test.describe('a user <situation>', () => {
 *     test('<observable outcome>', async ({ page }) => { ... });
 *   });
 *
 * Keep each spec under 5s total wall-time; push long journeys to
 * `e2e/journeys/*.spec.ts` (T4).
 */
import { expect, test } from "@playwright/test";

const SIDEBAR_MODULES = [
  "Overview",
  "Sessions",
  "Webhooks",
  "Agents",
  "Kanban",
  "Skills",
  "MCPs",
  "Channels",
  "Replay",
] as const;

test.describe("a user visiting the overview", () => {
  test("sees the full module list in the primary sidebar", async ({ page }) => {
    await page.goto("/");

    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav).toBeVisible();

    for (const moduleName of SIDEBAR_MODULES) {
      await expect(
        nav.getByRole("link", { name: moduleName }),
        `sidebar is missing module: ${moduleName}`
      ).toBeVisible();
    }
  });

  test("sees the empty-state copy when no agents are configured", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("No agent runtimes")).toBeVisible();
  });
});
