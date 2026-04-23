import { appendFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Exercises the `/agents` + `/agents/[id]` module with a real on-disk
 * transcript. The Playwright global setup prepares an empty fixture root and
 * the webServer is launched with `CLAUDE_CONTROL_PLANE_DATA_ROOT` pointing at
 * it. This spec seeds a single transcript inside a subproject for the
 * duration of its tests and removes it in `afterAll` so the empty-state
 * shell specs remain deterministic.
 */

const FIXTURE_ROOT = path.resolve(process.cwd(), "test-results", "e2e-claude-fixture");
const PROJECT_DIR_NAME = "-Users-e2e-agents-sample";
const PROJECT_DIR = path.join(FIXTURE_ROOT, PROJECT_DIR_NAME);
const SESSION_ID = "11111111-2222-3333-4444-aaaaaaaaaaaa";
const SESSION_FILE = path.join(PROJECT_DIR, `${SESSION_ID}.jsonl`);
const AGENT_ID = `claude-code:${PROJECT_DIR_NAME}`;
const LIVE_ROUTE_WAIT = "domcontentloaded" as const;

test.describe.configure({ mode: "serial" });

test.describe("agents module with a populated data root", () => {
  test.beforeAll(async () => {
    await mkdir(PROJECT_DIR, { recursive: true });
    const entries = [
      {
        type: "user",
        sessionId: SESSION_ID,
        uuid: "agents-e2e-user-1",
        timestamp: "2026-04-23T10:00:00.000Z",
        cwd: "/Users/e2e/agents/sample",
        version: "1.0.0",
        message: { role: "user", content: "hello from the agents e2e" },
      },
      {
        type: "assistant",
        sessionId: SESSION_ID,
        uuid: "agents-e2e-assistant-1",
        timestamp: "2026-04-23T10:00:01.000Z",
        cwd: "/Users/e2e/agents/sample",
        version: "1.0.0",
        message: {
          role: "assistant",
          model: "claude-e2e",
          content: [{ type: "text", text: "hello from the agent" }],
        },
      },
    ];
    const jsonl = entries.map((entry) => JSON.stringify(entry)).join("\n");
    await writeFile(SESSION_FILE, jsonl, "utf8");
  });

  test.afterAll(async () => {
    await rm(PROJECT_DIR, { recursive: true, force: true });
  });

  test("given_a_seeded_data_root__when_visiting_agents__then_the_grid_and_controls_render", async ({
    page,
  }) => {
    await page.goto("/agents", { waitUntil: LIVE_ROUTE_WAIT });

    await expect(page.getByRole("heading", { name: "Agents" })).toBeVisible();
    await expect(page.getByText("No agent runtimes")).toHaveCount(0);

    await expect(page.getByPlaceholder("Filter by name, project, or id…")).toBeVisible();
    await expect(page.getByRole("button", { name: /^All\s+\d+$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Available\s+\d+$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Last active/ })).toBeVisible();

    const cardLink = page.getByRole("link", {
      name: /\/Users\/e2e\/agents\/sample/,
    });
    await expect(cardLink.first()).toBeVisible();
    await expect(page.getByRole("img", { name: "Clawd is working" }).first()).toBeVisible();
  });

  test("given_an_open_agents_page__when_tool_failure_is_appended__then_the_card_mascot_reacts", async ({
    page,
  }) => {
    await page.goto("/agents", { waitUntil: LIVE_ROUTE_WAIT });

    const failureEntry = {
      type: "user",
      sessionId: SESSION_ID,
      uuid: "agents-e2e-tool-failure",
      timestamp: new Date().toISOString(),
      cwd: "/Users/e2e/agents/sample",
      version: "1.0.0",
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "agents-e2e-missing-tool",
            content: "tool failed",
            is_error: true,
          },
        ],
      },
    };

    await appendFile(SESSION_FILE, `\n${JSON.stringify(failureEntry)}`, "utf8");

    await expect(page.getByRole("img", { name: "Clawd is failed" }).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("given_an_agent_card__when_clicking_it__then_the_detail_view_lists_its_sessions", async ({
    page,
  }) => {
    await page.goto(`/agents/${encodeURIComponent(AGENT_ID)}`, { waitUntil: LIVE_ROUTE_WAIT });

    await expect(page.getByRole("heading", { name: "/Users/e2e/agents/sample" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sessions" })).toBeVisible();

    const sessionLink = page
      .getByRole("main")
      .getByRole("link", { name: new RegExp(SESSION_ID.slice(0, 8)) });
    await expect(sessionLink).toBeVisible();

    await sessionLink.click();
    await expect(page).toHaveURL(new RegExp(`/sessions/${SESSION_ID}$`));
    // Sessions detail page renders the agent transcript content for this id.
    // The first user message is used as the session title h1.
    await expect(page.getByRole("heading", { name: "hello from the agents e2e" })).toBeVisible();
  });
});
