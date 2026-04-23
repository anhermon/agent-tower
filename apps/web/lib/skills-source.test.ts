import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let mockedHome: string | null = null;

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return {
    ...actual,
    homedir: () => mockedHome ?? actual.homedir()
  };
});

const {
  SKILLS_ROOTS_ENV,
  __clearSkillsCacheForTests,
  listSkillsOrEmpty,
  loadSkillOrUndefined,
  resolveSkillsRoots
} = await import("./skills-source");

describe("skills-source", () => {
  const originalEnv = process.env[SKILLS_ROOTS_ENV];
  let tempHome: string | null = null;
  const allTempDirs: string[] = [];

  beforeEach(async () => {
    delete process.env[SKILLS_ROOTS_ENV];
    const sandbox = await mkdtemp(path.join(os.tmpdir(), "control-plane-skills-home-"));
    tempHome = sandbox;
    mockedHome = sandbox;
    allTempDirs.push(sandbox);
    __clearSkillsCacheForTests();
  });

  afterEach(async () => {
    if (originalEnv === undefined) {
      delete process.env[SKILLS_ROOTS_ENV];
    } else {
      process.env[SKILLS_ROOTS_ENV] = originalEnv;
    }
    mockedHome = null;
    while (allTempDirs.length > 0) {
      const dir = allTempDirs.pop()!;
      await rm(dir, { recursive: true, force: true });
    }
    tempHome = null;
  });

  it("given_no_env_var_and_no_home_fallback__when_resolving__then_returns_empty", () => {
    expect(resolveSkillsRoots()).toEqual([]);
  });

  it("given_home_fallback_dir_exists__when_resolving__then_it_is_used_with_default_origin", async () => {
    const fakeSkills = path.join(tempHome!, ".claude", "skills");
    await mkdir(fakeSkills, { recursive: true });
    const roots = resolveSkillsRoots();
    expect(roots).toHaveLength(1);
    expect(roots[0]!.directory).toBe(fakeSkills);
    expect(roots[0]!.origin).toBe("default");
  });

  it("given_env_var_with_multiple_roots__when_resolving__then_all_are_kept_in_order", async () => {
    const a = await mkdtemp(path.join(os.tmpdir(), "skills-a-"));
    const b = await mkdtemp(path.join(os.tmpdir(), "skills-b-"));
    allTempDirs.push(a, b);
    process.env[SKILLS_ROOTS_ENV] = [a, b].join(path.delimiter);

    const roots = resolveSkillsRoots();
    expect(roots.map((r) => r.directory)).toEqual([a, b]);
    expect(roots.every((r) => r.origin === "env")).toBe(true);
  });

  it("given_env_var_with_duplicates__when_resolving__then_duplicates_are_dropped", async () => {
    const a = await mkdtemp(path.join(os.tmpdir(), "skills-dup-"));
    allTempDirs.push(a);
    process.env[SKILLS_ROOTS_ENV] = [a, a].join(path.delimiter);

    expect(resolveSkillsRoots().map((r) => r.directory)).toEqual([a]);
  });

  it("given_a_skill_with_full_frontmatter__when_listing__then_metadata_is_parsed", async () => {
    const root = await seedSkill({
      slug: "llm-landscape",
      frontmatter: "name: llm-landscape\ndescription: Research the current LLM landscape.\n",
      body: "# LLM Landscape\n\nThis is the body.\n"
    });
    process.env[SKILLS_ROOTS_ENV] = root;

    const result = await listSkillsOrEmpty();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skills).toHaveLength(1);
    const skill = result.skills[0]!;
    expect(skill.id).toBe("llm-landscape");
    expect(skill.name).toBe("llm-landscape");
    expect(skill.description).toBe("Research the current LLM landscape.");
    expect(skill.summary).toBe("Research the current LLM landscape.");
    expect(skill.body).toContain("# LLM Landscape");
    expect(skill.rootOrigin).toBe("env");
    expect(skill.sizeBytes).toBeGreaterThan(0);
  });

  it("given_a_nested_skill__when_listing__then_id_reflects_the_relative_path", async () => {
    const root = await seedSkill({
      slug: "kb-to-wiki/generate",
      frontmatter: "name: kb-to-wiki/generate\ndescription: Generate a wiki.\n",
      body: "# Generate\n"
    });
    process.env[SKILLS_ROOTS_ENV] = root;

    const result = await listSkillsOrEmpty();
    if (!result.ok) throw new Error("expected listing to succeed");
    expect(result.skills.map((s) => s.id)).toEqual(["kb-to-wiki/generate"]);
  });

  it("given_a_skill_with_triggers_in_description__when_listing__then_quoted_phrases_are_extracted", async () => {
    const description = [
      "Do useful work.",
      'Trigger on: "analyze token usage", "token report", or "/cc-lens".'
    ].join("\n");
    const frontmatter = `name: cc-lens\ndescription: |\n  ${description.replace(/\n/g, "\n  ")}\n`;
    const root = await seedSkill({ slug: "cc-lens", frontmatter, body: "" });
    process.env[SKILLS_ROOTS_ENV] = root;

    const result = await listSkillsOrEmpty();
    if (!result.ok) throw new Error("expected listing to succeed");
    const triggers = result.skills[0]!.triggers;
    expect(triggers).toEqual(["analyze token usage", "token report", "/cc-lens"]);
  });

  it("given_a_skill_with_no_frontmatter__when_listing__then_body_and_heading_are_used", async () => {
    const root = await seedSkill({
      slug: "no-fm",
      frontmatter: null,
      body: "# Orphan Skill\n\nThis skill has no frontmatter block.\n"
    });
    process.env[SKILLS_ROOTS_ENV] = root;

    const result = await listSkillsOrEmpty();
    if (!result.ok) throw new Error("expected listing to succeed");
    const skill = result.skills[0]!;
    expect(skill.frontmatter).toEqual({});
    expect(skill.description).toBe("This skill has no frontmatter block.");
  });

  it("given_multiple_skills_across_roots__when_listing__then_they_are_merged_and_sorted", async () => {
    const a = await seedSkill({ slug: "zeta", frontmatter: "name: zeta\n", body: "" });
    const b = await seedSkill({ slug: "alpha", frontmatter: "name: alpha\n", body: "" });
    process.env[SKILLS_ROOTS_ENV] = [a, b].join(path.delimiter);

    const result = await listSkillsOrEmpty();
    if (!result.ok) throw new Error("expected listing to succeed");
    expect(result.skills.map((s) => s.name)).toEqual(["alpha", "zeta"]);
  });

  it("given_a_known_skill__when_loading_by_id__then_it_is_returned", async () => {
    const root = await seedSkill({
      slug: "loader",
      frontmatter: "name: loader\ndescription: load me\n",
      body: "body"
    });
    process.env[SKILLS_ROOTS_ENV] = root;

    const result = await loadSkillOrUndefined("loader");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skill.name).toBe("loader");
  });

  it("given_an_unknown_skill__when_loading__then_returns_not_found", async () => {
    const root = await seedSkill({
      slug: "present",
      frontmatter: "name: present\n",
      body: ""
    });
    process.env[SKILLS_ROOTS_ENV] = root;

    const result = await loadSkillOrUndefined("missing");
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  async function seedSkill(args: {
    slug: string;
    frontmatter: string | null;
    body: string;
  }): Promise<string> {
    const root = await mkdtemp(path.join(os.tmpdir(), "skills-root-"));
    allTempDirs.push(root);
    const dir = path.join(root, ...args.slug.split("/"));
    await mkdir(dir, { recursive: true });
    const frontmatterBlock = args.frontmatter ? `---\n${args.frontmatter}---\n\n` : "";
    await writeFile(path.join(dir, "SKILL.md"), `${frontmatterBlock}${args.body}`, "utf8");
    return root;
  }
});
