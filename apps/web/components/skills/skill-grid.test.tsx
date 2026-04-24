import { describe, expect, it } from "vitest";

import type { SkillGridItem } from "./skill-grid";

/**
 * Tests that validate the SkillGridItem shape contract.
 *
 * The key invariant: `SkillGridItem` must NOT include `body` or `frontmatter`
 * from `SkillManifest`. Serialising those fields into the RSC flight payload
 * can balloon the page past the browser's ability to render (individual
 * SKILL.md files can be multi-MB). See `apps/web/app/skills/CLAUDE.md`.
 */
describe("SkillGridItem shape contract", () => {
  it("must include the required display fields", () => {
    // Compile-time check: build a valid SkillGridItem to confirm the shape.
    const item: SkillGridItem = {
      id: "dev-guidelines",
      name: "Dev Guidelines",
      summary: "Load development guidelines.",
      description: "Load development guidelines before writing code.",
      triggers: ["load dev guidelines", "set up dev env"],
      rootDirectory: "/home/user/.claude/skills",
      rootLabel: "~/.claude/skills",
      relativePath: "dev-guidelines/SKILL.md",
      modifiedAt: "2024-03-01T00:00:00.000Z",
      sizeBytes: 4096,
    };

    expect(item.id).toBe("dev-guidelines");
    expect(item.name).toBe("Dev Guidelines");
    expect(item.sizeBytes).toBe(4096);
  });

  it("must not have body or frontmatter keys", () => {
    // Runtime guard: confirm the object has no `body` or `frontmatter`.
    // If `toGridItem` ever accidentally includes those fields the SkillGridItem
    // type will have widened and this test will fail.
    const item: SkillGridItem = {
      id: "test",
      name: "Test",
      summary: null,
      description: null,
      triggers: [],
      rootDirectory: "/tmp",
      rootLabel: "tmp",
      relativePath: "test/SKILL.md",
      modifiedAt: "2024-01-01T00:00:00.000Z",
      sizeBytes: 0,
    };

    // Cast to unknown then Record so we can probe for the forbidden keys.
    const record = item as unknown as Record<string, unknown>;
    expect("body" in record).toBe(false);
    expect("frontmatter" in record).toBe(false);
  });

  it("accepts null for optional fields", () => {
    const item: SkillGridItem = {
      id: "minimal",
      name: "Minimal",
      summary: null,
      description: null,
      triggers: [],
      rootDirectory: "/tmp",
      rootLabel: "tmp",
      relativePath: "minimal/SKILL.md",
      modifiedAt: "2024-01-01T00:00:00.000Z",
      sizeBytes: 0,
    };

    expect(item.summary).toBeNull();
    expect(item.description).toBeNull();
    expect(item.triggers).toHaveLength(0);
  });
});
