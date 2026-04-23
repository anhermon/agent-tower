import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

/**
 * Exercises the `/sessions` + `/sessions/[id]` module with a real on-disk
 * transcript. The Playwright global setup prepares an empty fixture root and
 * the webServer is launched with `CLAUDE_CONTROL_PLANE_DATA_ROOT` pointing at
 * it. This spec seeds a single transcript inside a subproject for the duration
 * of its tests and removes it in `afterAll` so the empty-state specs remain
 * deterministic.
 */

const FIXTURE_ROOT = path.resolve(process.cwd(), "test-results", "e2e-claude-fixture");
const PROJECT_DIR = path.join(FIXTURE_ROOT, "e2e-sample");
const SESSION_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

test.describe.configure({ mode: "serial" });

test.describe("sessions module with a populated data root", () => {
  test.beforeAll(async () => {
    await mkdir(PROJECT_DIR, { recursive: true });
    const entries = [
      {
        type: "user",
        sessionId: SESSION_ID,
        uuid: "e2e-user-1",
        timestamp: "2026-01-01T00:00:00.000Z",
        cwd: "/tmp/e2e",
        version: "1.0.0",
        message: { role: "user", content: "hello from e2e" },
      },
      {
        type: "assistant",
        sessionId: SESSION_ID,
        uuid: "e2e-assistant-1",
        timestamp: "2026-01-01T00:00:01.000Z",
        cwd: "/tmp/e2e",
        version: "1.0.0",
        message: {
          role: "assistant",
          model: "claude-e2e",
          content: [{ type: "text", text: "hi from the agent" }],
        },
      },
    ];
    const jsonl = entries.map((entry) => JSON.stringify(entry)).join("\n");
    await writeFile(path.join(PROJECT_DIR, `${SESSION_ID}.jsonl`), jsonl, "utf8");
  });

  test.afterAll(async () => {
    await rm(PROJECT_DIR, { recursive: true, force: true });
  });

  test("given_a_seeded_data_root__when_visiting_sessions__then_the_list_shows_the_seeded_row", async ({
    page,
  }) => {
    await page.goto("/sessions");

    await expect(page.getByRole("heading", { name: "Sessions" })).toBeVisible();
    await expect(page.getByText("No sessions records")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /aaaaaa/ })).toBeVisible();
    await expect(page.getByText("e2e-sample")).toBeVisible();
  });

  test("given_a_seeded_data_root__when_visiting_the_session_detail__then_turns_render", async ({
    page,
  }) => {
    await page.goto(`/sessions/${SESSION_ID}`);

    // The detail header shows the derived title as the heading and relegates
    // the raw session id to a mono caption below it.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(SESSION_ID).first()).toBeVisible();
    await expect(page.getByText("hello from e2e").first()).toBeVisible();
    await expect(page.getByText("hi from the agent")).toBeVisible();
    await expect(page.getByText("Raw metadata")).toBeVisible();
  });
});
