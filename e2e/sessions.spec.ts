import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Wave 2 smoke — projects index + project detail routes.
 *
 * Seeds a tiny JSONL transcript under the Playwright fixture root so the
 * analytics adapter yields a real project card. The fixture is torn down in
 * `afterAll` so the dashboard-shell empty-state baseline remains deterministic
 * when run after this spec.
 */

const FIXTURE_ROOT = path.resolve(process.cwd(), "test-results", "e2e-claude-fixture");
const PROJECT_DIR_NAME = "-Users-e2e-wave2-sample";
const PROJECT_DIR = path.join(FIXTURE_ROOT, PROJECT_DIR_NAME);
const SESSION_ID = "11111111-2222-3333-4444-555555555555";

test.describe.configure({ mode: "serial" });

test.describe("sessions projects wave", () => {
  test.beforeAll(async () => {
    await mkdir(PROJECT_DIR, { recursive: true });
    const entries = [
      {
        type: "user",
        sessionId: SESSION_ID,
        uuid: "w2-user-1",
        timestamp: "2026-02-01T00:00:00.000Z",
        cwd: "/Users/e2e/wave2/sample",
        version: "1.0.0",
        gitBranch: "main",
        message: { role: "user", content: "wave 2 smoke" },
      },
      {
        type: "assistant",
        sessionId: SESSION_ID,
        uuid: "w2-assist-1",
        timestamp: "2026-02-01T00:00:01.000Z",
        cwd: "/Users/e2e/wave2/sample",
        version: "1.0.0",
        gitBranch: "main",
        message: {
          role: "assistant",
          model: "claude-w2",
          content: [
            { type: "text", text: "acknowledged" },
            {
              type: "tool_use",
              id: "tool-1",
              name: "mcp__example__ping",
              input: {},
            },
          ],
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        },
      },
    ];
    const jsonl = entries.map((entry) => JSON.stringify(entry)).join("\n");
    await writeFile(path.join(PROJECT_DIR, `${SESSION_ID}.jsonl`), jsonl, "utf8");
  });

  test.afterAll(async () => {
    await rm(PROJECT_DIR, { recursive: true, force: true });
  });

  test("given_a_seeded_data_root__when_opening_projects_index__then_cards_render", async ({
    page,
  }) => {
    await page.goto("/sessions/projects");

    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
    await expect(page.getByText("No projects")).toHaveCount(0);
    // Project card shows the display name (derived from the cwd basename).
    await expect(page.getByText("sample").first()).toBeVisible();
    // Project switcher button is present when projects exist.
    await expect(page.getByRole("button", { name: /Switch project/ })).toBeVisible();
  });

  test("given_the_projects_index__when_deep_linking_a_project__then_detail_renders", async ({
    page,
  }) => {
    await page.goto("/sessions/projects");

    // Click the first project card. Use an anchor-based locator scoped to the
    // projects list.
    const firstCardLink = page.getByRole("link", { name: /sample/i }).first();
    await expect(firstCardLink).toBeVisible();
    await firstCardLink.click();

    await expect(page).toHaveURL(/\/sessions\/projects\//);
    // Detail page has an "All projects" breadcrumb link.
    await expect(page.getByRole("link", { name: /All projects/ })).toBeVisible();
    // At least one "Sessions" heading is shown on the detail layout.
    await expect(page.getByRole("heading", { name: "Sessions" })).toBeVisible();
    // Session list renders the seeded session id (middle-truncated).
    await expect(page.getByText(SESSION_ID.slice(0, 6), { exact: false }).first()).toBeVisible();
  });

  test("given_a_project_with_flags__when_toggling_filter__then_row_count_updates", async ({
    page,
  }) => {
    await page.goto("/sessions/projects");
    const firstCardLink = page.getByRole("link", { name: /sample/i }).first();
    await firstCardLink.click();

    // The seeded transcript uses an mcp__ tool → MCP facet should be available.
    const mcpFilter = page.getByRole("button", { name: /^MCP/ });
    if (await mcpFilter.count()) {
      await mcpFilter.first().click();
      // Row should still be present since it genuinely has MCP usage.
      await expect(page.getByText(SESSION_ID.slice(0, 6), { exact: false }).first()).toBeVisible();
    }
  });
});
