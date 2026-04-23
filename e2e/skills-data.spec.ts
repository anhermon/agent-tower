import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

/**
 * Exercises the `/skills` + `/skills/[id]` module with real on-disk SKILL.md
 * files. The Playwright global setup recreates an empty fixture root and the
 * webServer is launched with `CONTROL_PLANE_SKILLS_ROOTS` pointing at it. This
 * spec seeds two skills for its tests and removes them in `afterAll` so the
 * empty-state specs remain deterministic.
 */

const FIXTURE_ROOT = path.resolve(process.cwd(), "test-results", "e2e-skills-fixture");
const SKILL_A_DIR = path.join(FIXTURE_ROOT, "e2e-alpha");
const SKILL_B_DIR = path.join(FIXTURE_ROOT, "parent", "e2e-beta");

const SKILL_A_CONTENT = `---
name: e2e-alpha
description: |
  End-to-end alpha skill for Playwright.
  Trigger on: "alpha-run", "alpha-check".
---

# E2E Alpha

Some markdown body for the alpha skill.
`;

const SKILL_B_CONTENT = `---
name: e2e-beta
description: Nested skill used to verify recursive discovery.
---

# E2E Beta

Nested skill body.
`;

test.describe.configure({ mode: "serial" });

test.describe("skills module with a populated root", () => {
  test.beforeAll(async () => {
    await mkdir(SKILL_A_DIR, { recursive: true });
    await mkdir(SKILL_B_DIR, { recursive: true });
    await writeFile(path.join(SKILL_A_DIR, "SKILL.md"), SKILL_A_CONTENT, "utf8");
    await writeFile(path.join(SKILL_B_DIR, "SKILL.md"), SKILL_B_CONTENT, "utf8");
  });

  test.afterAll(async () => {
    await rm(SKILL_A_DIR, { recursive: true, force: true });
    await rm(path.join(FIXTURE_ROOT, "parent"), { recursive: true, force: true });
  });

  test("given_a_seeded_root__when_visiting_skills__then_cards_are_rendered", async ({ page }) => {
    await page.goto("/skills");

    await expect(page.getByRole("heading", { name: "Skills", level: 1 })).toBeVisible();
    await expect(page.getByText("No skills discovered")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /e2e-alpha/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /e2e-beta/ })).toBeVisible();
    // Trigger chip copied from frontmatter description.
    await expect(page.getByText("alpha-run").first()).toBeVisible();
  });

  test("given_a_seeded_skill__when_visiting_its_detail__then_metadata_and_body_render", async ({
    page,
  }) => {
    await page.goto("/skills/e2e-alpha");

    await expect(page.getByRole("heading", { name: "e2e-alpha", level: 1 })).toBeVisible();
    // The description is rendered in the Description section and also serialised
    // into the Frontmatter JSON dump, so match the first occurrence.
    await expect(page.getByText("End-to-end alpha skill for Playwright.").first()).toBeVisible();
    await expect(page.getByText("alpha-check").first()).toBeVisible();
    await expect(page.getByText("Some markdown body for the alpha skill.")).toBeVisible();
  });

  test("given_a_nested_skill__when_visiting_its_detail__then_id_uses_the_relative_path", async ({
    page,
  }) => {
    await page.goto(`/skills/${encodeURIComponent("parent/e2e-beta")}`);

    await expect(page.getByRole("heading", { name: "e2e-beta", level: 1 })).toBeVisible();
    await expect(
      page.getByText("Nested skill used to verify recursive discovery.").first()
    ).toBeVisible();
    await expect(page.getByText("Nested skill body.")).toBeVisible();
  });
});
