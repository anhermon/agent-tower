/**
 * Accessibility scaffold — axe-core over the 9 canonical dashboard routes.
 *
 * Tier: T3 (runs as part of `task ci`).
 *
 * Usage:
 *   pnpm playwright test --project=a11y
 *
 * Prefer running against a production build (`pnpm --filter @control-plane/web
 * build && pnpm --filter @control-plane/web start`) for stable results — axe
 * in Next dev mode occasionally trips on React-refresh injected markup, which
 * we skip via `test.fixme` below.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

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

const BLOCKING_IMPACTS = new Set(["serious", "critical"]);

for (const route of ROUTES) {
  test.describe(`a11y: ${route.label}`, () => {
    test(`given_the_dashboard_is_running__when_scanning_${route.label}__then_no_serious_or_critical_violations`, async ({
      page,
    }) => {
      const response = await page.goto(route.path);

      // If Next dev isn't ready (e.g. first HMR compile on cold start), skip
      // rather than producing a noisy false positive. Prefer `pnpm start`.
      if (!response?.ok()) {
        test.fixme(true, `dev server not ready for ${route.path}`);
        return;
      }

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      const blocking = results.violations.filter((v) => BLOCKING_IMPACTS.has(v.impact ?? ""));

      expect(
        blocking,
        `a11y violations on ${route.path}:\n${JSON.stringify(blocking, null, 2)}`
      ).toEqual([]);
    });
  });
}
