import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Smoke coverage for the `/sessions/{overview,costs,tools,activity}` analytics
 * routes delivered in Wave 4. Each route should:
 *   1. Render its heading (no loading shell).
 *   2. Render the sub-nav strip with the target tab flagged as active.
 *   3. Render at least one chart — asserted via the presence of an `<svg>`
 *      emitted by recharts (or the pure-SVG activity heatmap).
 *
 * Seeds a richer fixture than `sessions-data.spec.ts` so donuts, tool rankings,
 * and the cost panels all have something to render. The fixture is removed in
 * `afterAll` so downstream suites keep the empty-state baseline.
 */

const FIXTURE_ROOT = path.resolve(process.cwd(), "test-results", "e2e-claude-fixture");
const PROJECT_DIR = path.join(FIXTURE_ROOT, "e2e-analytics");
const SESSION_ID = "cccccccc-dddd-eeee-ffff-000000000000";

function entry(
  kind: "user" | "assistant",
  seq: number,
  ts: string,
  extras: Record<string, unknown> = {}
) {
  const base = {
    type: kind,
    sessionId: SESSION_ID,
    uuid: `e2e-${kind}-${seq}`,
    timestamp: ts,
    cwd: "/tmp/e2e-analytics",
    version: "1.2.3",
    gitBranch: "main",
    ...extras,
  };
  if (kind === "user") {
    return {
      ...base,
      message: { role: "user", content: `analytics question ${seq}` },
    };
  }
  return {
    ...base,
    message: {
      role: "assistant",
      model: "claude-sonnet-4-6-20251101",
      content: [
        { type: "text", text: `response ${seq}` },
        seq % 2 === 0
          ? { type: "tool_use", id: `tu-${seq}`, name: "Read", input: { path: "/tmp/x" } }
          : null,
      ].filter(Boolean),
      usage: {
        input_tokens: 100 + seq * 10,
        output_tokens: 40 + seq * 5,
        cache_read_input_tokens: 300,
        cache_creation_input_tokens: 50,
      },
    },
  };
}

test.describe.configure({ mode: "serial" });

test.describe("sessions analytics routes", () => {
  test.beforeAll(async () => {
    await mkdir(PROJECT_DIR, { recursive: true });
    const entries: unknown[] = [];
    for (let i = 0; i < 6; i++) {
      const ts = `2026-01-0${(i % 6) + 1}T0${i}:00:00.000Z`;
      entries.push(entry("user", i, ts));
      entries.push(entry("assistant", i, ts));
    }
    const jsonl = entries.map((e) => JSON.stringify(e)).join("\n");
    await writeFile(path.join(PROJECT_DIR, `${SESSION_ID}.jsonl`), jsonl, "utf8");
  });

  test.afterAll(async () => {
    await rm(PROJECT_DIR, { recursive: true, force: true });
  });

  test("given_a_seeded_fixture__when_visiting_overview__then_charts_render_with_svg", async ({
    page,
  }) => {
    await page.goto("/sessions/overview");
    await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
    // Active tab exposed via aria-current on the sub-nav link.
    const activeTab = page.locator("a[aria-current='page']", { hasText: "Overview" });
    await expect(activeTab).toBeVisible();
    // At least one SVG chart rendered (sparkline, usage chart, or donut).
    const svgCount = await page.locator("svg").count();
    expect(svgCount).toBeGreaterThan(2);
  });

  test("given_a_seeded_fixture__when_visiting_costs__then_cost_tables_and_charts_render", async ({
    page,
  }) => {
    await page.goto("/sessions/costs");
    await expect(page.getByRole("heading", { name: "Costs", level: 1 })).toBeVisible();
    await expect(page.getByText("Per-model token breakdown")).toBeVisible();
    const svgCount = await page.locator("svg").count();
    expect(svgCount).toBeGreaterThan(0);
  });

  test("given_a_seeded_fixture__when_visiting_tools__then_tool_ranking_renders", async ({
    page,
  }) => {
    await page.goto("/sessions/tools");
    await expect(page.getByRole("heading", { name: "Tools & Features", level: 1 })).toBeVisible();
    await expect(page.getByText("Tool ranking")).toBeVisible();
    const svgCount = await page.locator("svg").count();
    expect(svgCount).toBeGreaterThan(0);
  });

  test("given_a_seeded_fixture__when_visiting_activity__then_heatmap_renders", async ({ page }) => {
    await page.goto("/sessions/activity");
    await expect(page.getByRole("heading", { name: "Activity", level: 1 })).toBeVisible();
    await expect(page.getByText("Activity calendar")).toBeVisible();
    // Heatmap is a pure SVG grid — expect at least one <rect> child.
    const rectCount = await page.locator("svg rect").count();
    expect(rectCount).toBeGreaterThan(0);
  });
});
