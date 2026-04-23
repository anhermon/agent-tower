import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Wave 5 — global-search palette smoke.
 *
 * Seeds a single JSONL transcript containing a deterministic keyword, opens
 * the palette via ⌘K, types the keyword, and asserts that clicking the first
 * hit lands on the session-detail page with the matching `?turn=…` query.
 */

const FIXTURE_ROOT = path.resolve(process.cwd(), "test-results", "e2e-claude-fixture");
const PROJECT_DIR_NAME = "-Users-e2e-wave5-search";
const PROJECT_DIR = path.join(FIXTURE_ROOT, PROJECT_DIR_NAME);
const SESSION_ID = "33333333-4444-5555-6666-777777777777";
const KEYWORD = "wave5searchable";
const TURN_UUID = "w5-search-user-1";

test.describe.configure({ mode: "serial" });

test.describe("sessions global-search palette", () => {
  test.beforeAll(async () => {
    await mkdir(PROJECT_DIR, { recursive: true });
    const entries = [
      {
        type: "user",
        sessionId: SESSION_ID,
        uuid: TURN_UUID,
        timestamp: "2026-03-01T00:00:00.000Z",
        cwd: "/Users/e2e/wave5/search",
        version: "1.0.0",
        gitBranch: "main",
        message: { role: "user", content: `please find ${KEYWORD} in my code` },
      },
      {
        type: "assistant",
        sessionId: SESSION_ID,
        uuid: "w5-search-assist-1",
        timestamp: "2026-03-01T00:00:01.000Z",
        cwd: "/Users/e2e/wave5/search",
        version: "1.0.0",
        gitBranch: "main",
        message: {
          role: "assistant",
          model: "claude-w5",
          content: [{ type: "text", text: "acknowledged" }],
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      },
    ];
    const jsonl = entries.map((entry) => JSON.stringify(entry)).join("\n");
    await writeFile(path.join(PROJECT_DIR, `${SESSION_ID}.jsonl`), jsonl, "utf8");
  });

  test.afterAll(async () => {
    await rm(PROJECT_DIR, { recursive: true, force: true });
  });

  test("given_real_keyword__when_typing_into_palette__then_clicking_lands_on_detail_with_turn", async ({
    page,
  }) => {
    await page.goto("/sessions");

    // Open palette via keyboard. ⌘K on mac, Ctrl+K everywhere else — both are
    // handled by the provider.
    await page.keyboard.press("Control+K");

    const dialog = page.getByRole("dialog", { name: /search sessions/i });
    await expect(dialog).toBeVisible();

    const input = dialog.getByPlaceholder(/search across/i);
    await input.fill(KEYWORD);

    // The API responds fast but there's a 160 ms debounce; wait until at
    // least one result row is visible.
    await expect(dialog.getByText(/wave5searchable/i).first()).toBeVisible({ timeout: 5_000 });

    // Click the first hit. Use the session id prefix anchor because the
    // palette lists items with the short session id up-front.
    await dialog.getByText(SESSION_ID.slice(0, 8), { exact: false }).first().click();

    await expect(page).toHaveURL(new RegExp(`/sessions/${SESSION_ID}.*turn=`));
  });
});
