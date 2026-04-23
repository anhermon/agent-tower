/**
 * Visual regression baselines — one screenshot per canonical dashboard route.
 *
 * Tier: T4 (runs in `task ci:nightly`).
 *
 * Baselines are regenerated with:
 *   pnpm playwright test e2e/visual --update-snapshots
 *
 * Baselines live next to this file under `baselines.visual.spec.ts-snapshots/`
 * and are committed to the repo. Regenerate only on intentional UI changes —
 * if a snapshot diff is unexpected, treat it as a regression, not a refresh.
 */
import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 900 } });

const ROUTES = [
  { path: "/", label: "overview" },
  { path: "/sessions", label: "sessions" },
  { path: "/webhooks", label: "webhooks" },
  { path: "/agents", label: "agents" },
  { path: "/kanban", label: "kanban" },
  { path: "/skills", label: "skills" },
  { path: "/mcps", label: "mcps" },
  { path: "/channels", label: "channels" },
  { path: "/replay", label: "replay" },
] as const;

const DISABLE_ANIMATIONS = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
  }
`;

for (const route of ROUTES) {
  test.describe(`visual: ${route.label}`, () => {
    test(`given_the_dashboard_is_running__when_snapshotting_${route.label}__then_it_matches_baseline`, async ({
      page,
    }) => {
      await page.goto(route.path);
      await page.addStyleTag({ content: DISABLE_ANIMATIONS });
      // Wait for fonts + any client hydration to settle before capture.
      await page.evaluate(() => document.fonts.ready);
      await page.waitForLoadState("networkidle");

      await expect(page).toHaveScreenshot(`${route.label}.png`, {
        fullPage: true,
        animations: "disabled",
      });
    });
  });
}
