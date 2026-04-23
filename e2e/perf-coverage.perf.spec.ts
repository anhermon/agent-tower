/**
 * Perf coverage — Tier: optional / nightly companion to LHCI.
 *
 * Lighthouse loads each URL once with little or no scrolling; lazy mounts
 * (IntersectionObserver, dynamic imports, below-the-fold charts) often never
 * run. This spec **scrolls** the main document and runs **light interactions**
 * so deferred chunks and dialogs actually execute.
 *
 * Run:
 *   pnpm test:e2e:perf
 *
 * Against the isolated perf server (same origin as `lighthouserc.perf.json`):
 *   task test-server:up
 *   TEST_SERVER_PORT=3100 pnpm test:e2e:perf
 *
 * See `docs/perf/coverage-matrix.md` and `docs/perf/TIERS.md`.
 */

import { expect, test, type Page } from "@playwright/test";

/**
 * Paths must stay in sync with `lighthouserc.perf.json` → `ci.collect.url`
 * (scheme/host/port omitted — `baseURL` supplies them).
 */
const LHCI_PERF_PATHS = [
  "/",
  "/agents",
  "/sessions",
  "/sessions/overview",
  "/sessions/costs",
  "/sessions/activity",
  "/sessions/tools",
  "/sessions/projects",
  "/kanban",
  "/mcps",
  "/channels",
  "/replay",
  "/webhooks",
  "/skills",
] as const;

/** Step the viewport down the page so `content-visibility` / IO regions mount. */
async function scrollFullPage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const step = Math.max(120, Math.floor(window.innerHeight * 0.75));
    const maxY = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    for (let y = 0; y <= maxY; y += step) {
      window.scrollTo({ top: y, left: 0, behavior: "instant" });
      await delay(40);
    }
    window.scrollTo({ top: maxY, left: 0, behavior: "instant" });
    await delay(40);
  });
}

/** Optional: surface obvious runtime errors during the scenario. */
async function assertNoSevereConsoleErrors(): Promise<void> {
  const errors = consoleErrors.filter((m) => !isBenignConsoleMessage(m));
  consoleErrors.length = 0;
  expect(errors, `unexpected console errors: ${errors.join("; ")}`).toEqual([]);
}

const consoleErrors: string[] = [];

function isBenignConsoleMessage(msg: string): boolean {
  if (msg.includes("favicon")) return true;
  if (msg.includes("Download the React DevTools")) return true;
  return false;
}

/** Chromium exposes `performance.memory`; other browsers return 0. */
async function readChromiumJsHeapBytes(page: Page): Promise<number> {
  return page.evaluate(() => {
    const m = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory;
    return typeof m?.usedJSHeapSize === "number" ? m.usedJSHeapSize : 0;
  });
}

test.describe("perf coverage — scroll and surface lazy UI", () => {
  test.beforeEach(async ({ page }) => {
    consoleErrors.length = 0;
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => {
      consoleErrors.push(err.message);
    });
  });

  for (const routePath of LHCI_PERF_PATHS) {
    test(`given_perf_server__when_visiting_${routePath.replaceAll("/", "_")}__then_scroll_and_main_stay_healthy`, async ({
      page,
    }) => {
      await page.goto(routePath, { waitUntil: "domcontentloaded" });

      await expect(page.getByRole("main")).toBeVisible();

      await scrollFullPage(page);

      if (routePath === "/skills") {
        const refresh = page.getByRole("button", { name: "Refresh" });
        if (await refresh.isVisible().catch(() => false)) {
          await refresh.click();
          await expect(refresh).toBeVisible();
        }

        const rangeTrigger = page.getByRole("button", { name: "Select date range" });
        if (await rangeTrigger.isVisible().catch(() => false)) {
          await rangeTrigger.click();
          await page.keyboard.press("Escape");
        }
      }

      await expect(page.getByRole("main")).toBeVisible();

      const heapUsed = await readChromiumJsHeapBytes(page);
      if (heapUsed > 0) {
        expect(
          heapUsed,
          "Chromium should expose usedJSHeapSize after interactions"
        ).toBeGreaterThan(10_000);
      }

      await assertNoSevereConsoleErrors();
    });
  }
});
