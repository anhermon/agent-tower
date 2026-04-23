import { type Dirent, existsSync, type Stats, statSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";
import YAML from "yaml";

/**
 * Read-only discovery of skill manifests (SKILL.md) from configured roots.
 *
 * Resolution order for the roots to scan:
 *   1. `CONTROL_PLANE_SKILLS_ROOTS` env var (OS path-separator joined list).
 *   2. `~/.claude/skills` if it exists (conventional Claude Code location).
 *   3. `[]` → callers render an empty state with configuration guidance.
 *
 * Each `SKILL.md` under a root becomes one {@link SkillManifest}. Results are
 * cached in-process keyed by file path + mtime.
 */

export const SKILLS_ROOTS_ENV = "CONTROL_PLANE_SKILLS_ROOTS";
export const SKILL_FILENAME = "SKILL.md";

export type SkillsRootOrigin = "env" | "default";

export interface ResolvedSkillsRoot {
  readonly directory: string;
  readonly origin: SkillsRootOrigin;
  readonly label: string;
}

export interface SkillManifest {
  /** Stable slug derived from the root-relative path, excluding the SKILL.md filename. */
  readonly id: string;
  /** Human display name — frontmatter `name`, else derived from the directory path. */
  readonly name: string;
  /** Multi-line description from frontmatter, if present. */
  readonly description: string | null;
  /** One-line summary (first line / sentence of the description). */
  readonly summary: string | null;
  /** Trigger hints extracted from `description` ("Trigger on:", "Trigger when:", …). */
  readonly triggers: readonly string[];
  /** Absolute path to the SKILL.md file. */
  readonly filePath: string;
  /** Absolute path to the skill's own directory. */
  readonly directory: string;
  /** Root-relative slug (e.g. `kb-to-wiki/generate`). */
  readonly relativePath: string;
  /** The root this skill was discovered in. */
  readonly rootDirectory: string;
  readonly rootLabel: string;
  readonly rootOrigin: SkillsRootOrigin;
  readonly sizeBytes: number;
  readonly modifiedAt: string;
  /** Raw parsed YAML frontmatter (as returned by `yaml`). Empty object when absent. */
  readonly frontmatter: Readonly<Record<string, unknown>>;
  /** Markdown body that follows the frontmatter. */
  readonly body: string;
}

export type ListSkillsResult =
  | {
      readonly ok: true;
      readonly skills: readonly SkillManifest[];
      readonly roots: readonly ResolvedSkillsRoot[];
    }
  | {
      readonly ok: false;
      readonly reason: "unconfigured" | "error";
      readonly message?: string;
    };

export type LoadSkillResult =
  | { readonly ok: true; readonly skill: SkillManifest }
  | {
      readonly ok: false;
      readonly reason: "unconfigured" | "not_found" | "error";
      readonly message?: string;
    };

export function resolveSkillsRoots(): readonly ResolvedSkillsRoot[] {
  const raw = process.env[SKILLS_ROOTS_ENV];
  if (typeof raw === "string") {
    const parts = raw
      .split(path.delimiter)
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    if (parts.length > 0) {
      const seen = new Set<string>();
      const roots: ResolvedSkillsRoot[] = [];
      for (const dir of parts) {
        const resolved = path.resolve(dir);
        if (seen.has(resolved)) continue;
        seen.add(resolved);
        roots.push({
          directory: resolved,
          origin: "env",
          label: deriveRootLabel(resolved),
        });
      }
      return roots;
    }
  }

  const fallback = path.join(os.homedir(), ".claude", "skills");
  if (isExistingDirectory(fallback)) {
    return [
      {
        directory: fallback,
        origin: "default",
        label: "~/.claude/skills",
      },
    ];
  }

  return [];
}

export function getConfiguredSkillsRoots(): readonly ResolvedSkillsRoot[] {
  return resolveSkillsRoots();
}

export async function listSkillsOrEmpty(): Promise<ListSkillsResult> {
  const roots = resolveSkillsRoots();
  if (roots.length === 0) {
    return { ok: false, reason: "unconfigured" };
  }

  try {
    const skills: SkillManifest[] = [];
    for (const root of roots) {
      if (!isExistingDirectory(root.directory)) continue;
      const filesInRoot = await discoverSkillFiles(root.directory);
      for (const filePath of filesInRoot) {
        const manifest = await loadManifestCached(filePath, root);
        if (manifest) skills.push(manifest);
      }
    }
    skills.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    return { ok: true, skills, roots };
  } catch (error) {
    return { ok: false, reason: "error", message: errorMessage(error) };
  }
}

export async function loadSkillOrUndefined(id: string): Promise<LoadSkillResult> {
  const list = await listSkillsOrEmpty();
  if (!list.ok) return list;
  const match = list.skills.find((skill) => skill.id === id);
  if (!match) {
    return { ok: false, reason: "not_found" };
  }
  return { ok: true, skill: match };
}

const MAX_DEPTH = 6;
const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  ".venv",
  "__pycache__",
  "dist",
  "build",
]);

async function discoverSkillFiles(root: string): Promise<readonly string[]> {
  const results: string[] = [];
  await walk(root, 0);
  return results;

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH) return;
    let entries: Dirent[];
    try {
      entries = (await readdir(dir, { withFileTypes: true })) as Dirent[];
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
        await walk(path.join(dir, entry.name), depth + 1);
        continue;
      }
      if (entry.isFile() && entry.name === SKILL_FILENAME) {
        results.push(path.join(dir, entry.name));
      }
    }
  }
}

interface CacheEntry {
  readonly key: string;
  readonly manifest: SkillManifest;
}

const manifestCache = new Map<string, CacheEntry>();

async function loadManifestCached(
  filePath: string,
  root: ResolvedSkillsRoot
): Promise<SkillManifest | null> {
  let info: Stats;
  try {
    info = await stat(filePath);
  } catch {
    return null;
  }
  const cacheKey = `${filePath}:${info.mtime.toISOString()}:${root.directory}`;
  const cached = manifestCache.get(filePath);
  if (cached && cached.key === cacheKey) {
    return cached.manifest;
  }

  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    return null;
  }

  const manifest = parseManifest({
    filePath,
    raw,
    sizeBytes: info.size,
    modifiedAt: info.mtime.toISOString(),
    root,
  });
  manifestCache.set(filePath, { key: cacheKey, manifest });
  return manifest;
}

interface ParseArgs {
  readonly filePath: string;
  readonly raw: string;
  readonly sizeBytes: number;
  readonly modifiedAt: string;
  readonly root: ResolvedSkillsRoot;
}

function parseManifest(args: ParseArgs): SkillManifest {
  const { frontmatter, body } = splitFrontmatter(args.raw);
  const directory = path.dirname(args.filePath);
  const relativePath = path.relative(args.root.directory, directory);
  const id = buildSkillId(args.root, relativePath);

  const nameFromFrontmatter = stringOrNull(frontmatter.name);
  const descriptionFromFrontmatter = stringOrNull(frontmatter.description);
  const description = descriptionFromFrontmatter ?? firstHeadingAbstract(body);
  const summary = description ? firstSentence(description) : null;

  return {
    id,
    name: nameFromFrontmatter ?? humanizeSlug(relativePath) ?? path.basename(directory),
    description,
    summary,
    triggers: extractTriggers(description ?? ""),
    filePath: args.filePath,
    directory,
    relativePath,
    rootDirectory: args.root.directory,
    rootLabel: args.root.label,
    rootOrigin: args.root.origin,
    sizeBytes: args.sizeBytes,
    modifiedAt: args.modifiedAt,
    frontmatter,
    body,
  };
}

interface Frontmatter {
  readonly frontmatter: Readonly<Record<string, unknown>>;
  readonly body: string;
}

function splitFrontmatter(raw: string): Frontmatter {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!match) {
    return { frontmatter: {}, body: raw };
  }
  const [, yamlBlock, body] = match;
  try {
    const parsed = YAML.parse(yamlBlock ?? "");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return {
        frontmatter: parsed as Record<string, unknown>,
        body: body ?? "",
      };
    }
  } catch {
    // fall through: invalid YAML → treat the whole file as body.
  }
  return { frontmatter: {}, body: raw };
}

function buildSkillId(root: ResolvedSkillsRoot, relativePath: string): string {
  if (!relativePath || relativePath === ".") {
    return pathToSlug(path.basename(root.directory));
  }
  return pathToSlug(relativePath);
}

function pathToSlug(value: string): string {
  return value.split(path.sep).filter(Boolean).join("/");
}

function humanizeSlug(relativePath: string): string | null {
  if (!relativePath) return null;
  const last = relativePath.split(path.sep).filter(Boolean).at(-1);
  return last ?? null;
}

function firstHeadingAbstract(body: string): string | null {
  const match = body.match(/^#\s+[^\n]+\n+([^\n][\s\S]*?)(?:\n\n|$)/m);
  if (!match) return null;
  const text = match[1]?.trim();
  return text && text.length > 0 ? text : null;
}

function firstSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  const clipAt = trimmed.search(/(?<=[.!?])\s+/);
  if (clipAt > 0) {
    return trimmed.slice(0, clipAt).trim();
  }
  const newlineAt = trimmed.indexOf("\n");
  if (newlineAt > 0) {
    return trimmed.slice(0, newlineAt).trim();
  }
  return trimmed;
}

function extractTriggers(description: string): readonly string[] {
  if (!description) return [];
  const triggers: string[] = [];
  const sentenceRegex = /Trigger[^.\n]*\./gi;
  const sentences = description.match(sentenceRegex);
  if (!sentences) return triggers;
  const quoteRegex = /"([^"]+)"/g;
  for (const sentence of sentences) {
    let match: RegExpExecArray | null = quoteRegex.exec(sentence);
    while (match !== null) {
      const phrase = match[1]?.trim();
      if (phrase && !triggers.includes(phrase)) triggers.push(phrase);
      match = quoteRegex.exec(sentence);
    }
  }
  return triggers;
}

function stringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function deriveRootLabel(directory: string): string {
  const home = os.homedir();
  if (directory.startsWith(`${home}${path.sep}`)) {
    return `~${directory.slice(home.length)}`;
  }
  return directory;
}

function isExistingDirectory(target: string): boolean {
  try {
    return existsSync(target) && statSync(target).isDirectory();
  } catch {
    return false;
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Test-only hook: clears the in-process manifest cache. */
export function __clearSkillsCacheForTests(): void {
  manifestCache.clear();
}
