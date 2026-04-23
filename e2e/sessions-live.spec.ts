import { appendFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Wave 5 — SSE live-stream smoke.
 *
 * Seeds a tiny JSONL transcript, opens the live sessions UI plus an
 * EventSource against `/api/events`, then appends a new line to the same
 * JSONL file. The browser should receive a real `session-appended` frame and
 * the overview panel should render it.
 *
 * We use the already-running Playwright webServer (bound to the shared fixture
 * root) rather than spinning up a second one — the existing dev server is
 * what `playwright.config.ts` wires to `CLAUDE_CONTROL_PLANE_DATA_ROOT`.
 */

const FIXTURE_ROOT = path.resolve(process.cwd(), "test-results", "e2e-claude-fixture");
const PROJECT_DIR_NAME = "-Users-e2e-wave5-live";
const PROJECT_DIR = path.join(FIXTURE_ROOT, PROJECT_DIR_NAME);
const SESSION_ID = "55555555-6666-7777-8888-999999999999";
const SESSION_FILE = path.join(PROJECT_DIR, `${SESSION_ID}.jsonl`);
const LIVE_OVERVIEW_ROUTE = "/sessions/overview";
const LIVE_PANEL_HEADING = "Live Activity";
const LIVE_PANEL_EYEBROW = "Event stream";
const LIVE_PANEL_EMPTY_STATE = "No live events";
const LIVE_PANEL_LISTENING_STATE = "Listening";
const LIVE_EVENTS_ENDPOINT = "/api/events";

test.describe.configure({ mode: "serial" });

test.describe("sessions live updates", () => {
  test.beforeAll(async () => {
    await mkdir(PROJECT_DIR, { recursive: true });
    const entry = {
      type: "user",
      sessionId: SESSION_ID,
      uuid: "w5-live-user-1",
      timestamp: "2026-03-10T00:00:00.000Z",
      cwd: "/Users/e2e/wave5/live",
      version: "1.0.0",
      message: { role: "user", content: "live seed" },
    };
    await writeFile(SESSION_FILE, `${JSON.stringify(entry)}\n`, "utf8");
  });

  test.afterAll(async () => {
    await rm(PROJECT_DIR, { recursive: true, force: true });
  });

  test("given_an_open_sse_stream__when_jsonl_is_appended__then_a_session_appended_frame_arrives", async ({
    page,
  }) => {
    await page.goto(LIVE_OVERVIEW_ROUTE);
    await expect(page.getByRole("heading", { name: LIVE_PANEL_HEADING })).toBeVisible();
    await expect(page.getByText(LIVE_PANEL_LISTENING_STATE)).toBeVisible();

    // Attach an EventSource in the browser and collect the first non-retry
    // frame. The dev server returns `retry: 3000` up-front, then a real
    // `data: …` line when fs.watch fires.
    await page.evaluate((url) => {
      const state = window as Window & {
        __controlPlaneLiveEvents?: string[];
        __controlPlaneLiveOpen?: boolean;
      };
      state.__controlPlaneLiveEvents = [];
      state.__controlPlaneLiveOpen = false;
      const source = new EventSource(url);
      source.onopen = () => {
        state.__controlPlaneLiveOpen = true;
      };
      source.onmessage = (evt) => {
        state.__controlPlaneLiveEvents?.push(evt.data);
        source.close();
      };
      source.onerror = () => {
        /* keep listening — EventSource retries automatically */
      };
    }, LIVE_EVENTS_ENDPOINT);

    await expect
      .poll(() =>
        page.evaluate(() => {
          const state = window as Window & { __controlPlaneLiveOpen?: boolean };
          return Boolean(state.__controlPlaneLiveOpen);
        })
      )
      .toBe(true);

    const appendEntry = {
      type: "assistant",
      sessionId: SESSION_ID,
      uuid: "w5-live-assist-1",
      timestamp: "2026-03-10T00:00:05.000Z",
      cwd: "/Users/e2e/wave5/live",
      message: {
        role: "assistant",
        model: "claude-w5-live",
        content: [{ type: "text", text: "live echo" }],
        usage: { input_tokens: 5, output_tokens: 5 },
      },
    };
    await appendFile(SESSION_FILE, `\n${JSON.stringify(appendEntry)}`, "utf8");

    const frame = await page.waitForFunction(
      () => {
        const state = window as Window & { __controlPlaneLiveEvents?: string[] };
        return state.__controlPlaneLiveEvents?.[0];
      },
      null,
      { timeout: 10_000 }
    );
    const data = await frame.jsonValue();

    expect(data).toContain("session-appended");
    expect(data).toContain(SESSION_ID);
  });

  test("given_the_live_panel_is_empty__when_jsonl_is_appended__then_it_renders_the_live_event", async ({
    page,
  }) => {
    const eventsRequest = page.waitForRequest((request) =>
      request.url().endsWith(LIVE_EVENTS_ENDPOINT)
    );

    await page.goto(LIVE_OVERVIEW_ROUTE);
    await eventsRequest;

    const livePanel = page.locator("section").filter({
      has: page.getByRole("heading", { name: LIVE_PANEL_HEADING }),
    });

    await expect(page.getByText(LIVE_PANEL_EYEBROW)).toBeVisible();
    await expect(page.getByRole("heading", { name: LIVE_PANEL_HEADING })).toBeVisible();
    await expect(livePanel.getByText(LIVE_PANEL_LISTENING_STATE)).toBeVisible();
    await expect(livePanel.getByText(LIVE_PANEL_EMPTY_STATE)).toBeVisible();

    const appendEntry = {
      type: "assistant",
      sessionId: SESSION_ID,
      uuid: "w5-live-assist-1",
      timestamp: "2026-03-10T00:00:05.000Z",
      cwd: "/Users/e2e/wave5/live",
      message: {
        role: "assistant",
        model: "claude-w5-live",
        content: [{ type: "text", text: "live echo" }],
        usage: { input_tokens: 5, output_tokens: 5 },
      },
    };
    await appendFile(SESSION_FILE, `\n${JSON.stringify(appendEntry)}`, "utf8");

    await expect(livePanel.getByText("session-appended")).toBeVisible({ timeout: 10_000 });
    await expect(livePanel.getByText(SESSION_ID)).toBeVisible({ timeout: 10_000 });
  });
});
