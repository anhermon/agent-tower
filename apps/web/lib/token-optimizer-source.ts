import "server-only";

import { createReadStream, existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import * as os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";

import { resolveDataRoot } from "@control-plane/adapter-claude-code";
import type {
  TokenAttributionReport,
  TokenAttributionRow,
  TokenOptimizerTool,
  TokenOptimizerToolId,
} from "@control-plane/core";

// ─── Constants ────────────────────────────────────────────────────────────────

// Re-export the canonical env-var name from the adapter so tests and callers
// can reference the same string without duplicating the literal.
export { CLAUDE_DATA_ROOT_ENV as CLAUDE_CONTROL_PLANE_DATA_ROOT } from "@control-plane/adapter-claude-code";

const REGISTRY_SUBPATH = ".claude/token-optimizer/registry.json";

// Named constants for tool IDs that appear in multiple places
const TOOL_ID_RTK: TokenOptimizerToolId = "rtk";
const TOOL_ID_CONTEXT_MODE: TokenOptimizerToolId = "context-mode";
const TOOL_ID_TOKEN_SAVIOR: TokenOptimizerToolId = "token-savior";
const TOOL_ID_CODE_REVIEW_GRAPH: TokenOptimizerToolId = "code-review-graph";
const TOOL_ID_GRAPHIFY: TokenOptimizerToolId = "graphify";

// ─── Static defaults ──────────────────────────────────────────────────────────

const DEFAULTS: Readonly<
  Record<
    TokenOptimizerToolId,
    Omit<
      TokenOptimizerTool,
      | "detectedInstalled"
      | "enabled"
      | "tags"
      | "version"
      | "installedAt"
      | "enabledAt"
      | "disabledAt"
    >
  >
> = {
  rtk: {
    id: TOOL_ID_RTK,
    name: "RTK",
    description: "Bash output compression via a PreToolUse hook in ~/.claude/settings.json",
    source: "https://github.com/rtk-ai/rtk",
    integrationKind: "hook",
  },
  "context-mode": {
    id: TOOL_ID_CONTEXT_MODE,
    name: "Context Mode",
    description: "MCP server with tools prefixed ctx_* for context management",
    source: "https://github.com/mksglu/context-mode",
    integrationKind: "mcp",
  },
  "token-savior": {
    id: TOOL_ID_TOKEN_SAVIOR,
    name: "Token Savior",
    description: "MCP server token-savior-recall for token-efficient recall",
    source: "https://github.com/Mibayy/token-savior",
    integrationKind: "mcp",
  },
  "code-review-graph": {
    id: TOOL_ID_CODE_REVIEW_GRAPH,
    name: "Code Review Graph",
    description: "MCP server code-review-graph for knowledge-graph-based code review",
    source: "https://github.com/tirth8205/code-review-graph",
    integrationKind: "mcp",
  },
  graphify: {
    id: TOOL_ID_GRAPHIFY,
    name: "Graphify",
    description: "Binary at ~/.local/bin/graphify + skill at ~/.claude/skills/graphify/SKILL.md",
    source: "https://github.com/safishamsi/graphify",
    integrationKind: "binary",
  },
};

const TOOL_IDS: readonly TokenOptimizerToolId[] = [
  TOOL_ID_RTK,
  TOOL_ID_CONTEXT_MODE,
  TOOL_ID_TOKEN_SAVIOR,
  TOOL_ID_CODE_REVIEW_GRAPH,
  TOOL_ID_GRAPHIFY,
];

// ─── Registry types ───────────────────────────────────────────────────────────

interface RegistryEntry {
  enabled?: boolean;
  tags?: string[];
  version?: string | null;
  installedAt?: string | null;
  enabledAt?: string | null;
  disabledAt?: string | null;
}

type Registry = Partial<Record<TokenOptimizerToolId, RegistryEntry>>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function registryPath(): string {
  return path.join(os.homedir(), REGISTRY_SUBPATH);
}

async function readRegistry(): Promise<Registry> {
  const filePath = registryPath();
  if (!existsSync(filePath)) {
    return {};
  }
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as Registry;
  } catch {
    return {};
  }
}

async function writeRegistry(registry: Registry): Promise<void> {
  const filePath = registryPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(registry, null, 2), "utf8");
}

function tryReadJsonFile(filePath: string): unknown {
  try {
    if (!existsSync(filePath)) return null;
    const raw = readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// RTK binary detection: check well-known install paths without shelling out.
function isRtkBinaryPresent(): boolean {
  const home = os.homedir();
  const candidates = ["/usr/local/bin/rtk", `${home}/.local/bin/rtk`, "/opt/homebrew/bin/rtk"];
  return candidates.some((p) => existsSync(p));
}

function detectInstalled(id: TokenOptimizerToolId, cwd: string): boolean {
  const home = os.homedir();

  switch (id) {
    case "rtk": {
      if (!isRtkBinaryPresent()) return false;
      const settingsPath = path.join(home, ".claude", "settings.json");
      try {
        const settings = tryReadJsonFile(settingsPath);
        const text = JSON.stringify(settings ?? "");
        return text.includes("rtk hook claude");
      } catch {
        return false;
      }
    }

    case "context-mode": {
      const pluginsPath = path.join(home, ".claude", "plugins", "installed_plugins.json");
      try {
        const plugins = tryReadJsonFile(pluginsPath);
        const text = JSON.stringify(plugins ?? "");
        return text.includes("context-mode@context-mode");
      } catch {
        return false;
      }
    }

    case "token-savior": {
      const mcpPath = path.join(home, ".claude", "mcp.json");
      try {
        const mcp = tryReadJsonFile(mcpPath);
        const text = JSON.stringify(mcp ?? "");
        return text.includes("token-savior-recall");
      } catch {
        return false;
      }
    }

    case "code-review-graph": {
      const localMcpPath = path.join(cwd, ".mcp.json");
      try {
        const mcp = tryReadJsonFile(localMcpPath);
        const text = JSON.stringify(mcp ?? "");
        return text.includes("code-review-graph");
      } catch {
        return false;
      }
    }

    case "graphify": {
      return existsSync(path.join(home, ".local", "bin", "graphify"));
    }

    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * List all 5 token-optimizer tools, merging static metadata with:
 * - live installation detection
 * - persisted registry overrides (enabled, tags, timestamps)
 *
 * Accepts an optional `cwd` override for testability (project-local .mcp.json).
 */
export async function listTools(cwd: string = process.cwd()): Promise<TokenOptimizerTool[]> {
  const registry = await readRegistry();

  return TOOL_IDS.map((id): TokenOptimizerTool => {
    const defaults = DEFAULTS[id];
    const entry = registry[id] ?? {};
    const detected = detectInstalled(id, cwd);

    return {
      ...defaults,
      detectedInstalled: detected,
      enabled: entry.enabled ?? false,
      tags: entry.tags ?? [],
      version: entry.version ?? null,
      installedAt: entry.installedAt ?? null,
      enabledAt: entry.enabledAt ?? null,
      disabledAt: entry.disabledAt ?? null,
    };
  });
}

/**
 * Toggle a tool's enabled state, persisting the timestamp.
 */
export async function toggleTool(id: TokenOptimizerToolId, enabled: boolean): Promise<void> {
  const registry = await readRegistry();
  const existing = registry[id] ?? {};
  const wasEnabled = existing.enabled === true;
  registry[id] = {
    ...existing,
    enabled,
    // Only stamp enabledAt on a false→true transition
    enabledAt: enabled && !wasEnabled ? new Date().toISOString() : (existing.enabledAt ?? null),
    // Only stamp disabledAt on a true→false transition
    disabledAt: !enabled && wasEnabled ? new Date().toISOString() : (existing.disabledAt ?? null),
  };
  await writeRegistry(registry);
}

/**
 * Update the tags for a specific tool without touching other fields.
 */
export async function updateToolTags(id: TokenOptimizerToolId, tags: string[]): Promise<void> {
  const registry = await readRegistry();
  const existing = registry[id] ?? {};
  registry[id] = { ...existing, tags };
  await writeRegistry(registry);
}

// ─── Attribution helpers ──────────────────────────────────────────────────────

interface ToolMatcher {
  id: TokenOptimizerToolId;
  evidence: string;
  match: (toolName: string, serverName: string, cmd: string) => boolean;
}

const TOOL_MATCHERS: ToolMatcher[] = [
  {
    id: TOOL_ID_RTK,
    evidence:
      "Approximation: Bash tool calls with 'rtk' in command string (~400 tokens saved per call).",
    match: (toolName, _serverName, cmd) =>
      toolName === "Bash" && /^\s*rtk(?:\s|$)/.test(cmd),
  },
  {
    id: TOOL_ID_CONTEXT_MODE,
    evidence:
      "Approximation: tool calls with ctx_* prefix (~400 tokens saved per call).",
    match: (toolName) => toolName.startsWith("ctx_"),
  },
  {
    id: TOOL_ID_TOKEN_SAVIOR,
    evidence:
      "Approximation: tool calls matching token-savior patterns (~400 tokens saved per call).",
    match: (toolName, serverName) =>
      toolName.startsWith("recall_") ||
      toolName.startsWith("navigate_") ||
      toolName.startsWith("store_") ||
      serverName === "token-savior-recall",
  },
  {
    id: TOOL_ID_CODE_REVIEW_GRAPH,
    evidence:
      "Approximation: tool calls from code-review-graph server (~400 tokens saved per call).",
    match: (_toolName, serverName) => serverName === "code-review-graph",
  },
  {
    id: TOOL_ID_GRAPHIFY,
    evidence:
      "Approximation: tool calls named 'graphify' (~400 tokens saved per call).",
    match: (toolName) => toolName === "graphify",
  },
];

function extractCmd(b: Record<string, unknown>): string {
  if (typeof b.input !== "object" || b.input === null) return "";
  const inputArg = b.input as Record<string, unknown>;
  if (typeof inputArg.command === "string") return inputArg.command;
  if (typeof inputArg.input === "string") return inputArg.input;
  return "";
}

function extractServerName(b: Record<string, unknown>): string {
  if (typeof b.server_name === "string") return b.server_name;
  if (typeof b.serverName === "string") return b.serverName;
  return "";
}

function recordMatch(
  rowMap: Map<TokenOptimizerToolId, TokenAttributionRow>,
  sessionsPerTool: Map<TokenOptimizerToolId, Set<string>>,
  id: TokenOptimizerToolId,
  evidence: string,
  filePath: string
): void {
  const row = rowMap.get(id);
  if (!row) return;
  rowMap.set(id, {
    ...row,
    toolCallsObserved: row.toolCallsObserved + 1,
    evidence,
  });
  sessionsPerTool.get(id)?.add(filePath);
}

function extractUsageTokens(obj: Record<string, unknown>): number {
  const msg = obj.message as Record<string, unknown> | undefined;
  if (!msg) return 0;
  const usage = msg.usage as Record<string, unknown> | undefined;
  if (!usage) return 0;
  const input = typeof usage.input_tokens === "number" ? usage.input_tokens : 0;
  const output = typeof usage.output_tokens === "number" ? usage.output_tokens : 0;
  return input + output;
}

function processToolBlock(
  b: Record<string, unknown>,
  rowMap: Map<TokenOptimizerToolId, TokenAttributionRow>,
  sessionsPerTool: Map<TokenOptimizerToolId, Set<string>>,
  filePath: string
): void {
  if (b.type !== "tool_use") return;
  const toolName = typeof b.name === "string" ? b.name : "";
  const serverName = extractServerName(b);
  const cmd = extractCmd(b);

  for (const matcher of TOOL_MATCHERS) {
    if (matcher.match(toolName, serverName, cmd)) {
      recordMatch(rowMap, sessionsPerTool, matcher.id, matcher.evidence, filePath);
    }
  }
}

async function scanFile(
  filePath: string,
  rowMap: Map<TokenOptimizerToolId, TokenAttributionRow>,
  sessionsPerTool: Map<TokenOptimizerToolId, Set<string>>
): Promise<number> {
  let tokensInFile = 0;

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  try {
    for await (const line of rl) {
      if (line.trim().length === 0) continue;

      let entry: unknown;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }

      if (typeof entry !== "object" || entry === null) continue;
      const obj = entry as Record<string, unknown>;

      if (obj.type === "assistant") {
        tokensInFile += extractUsageTokens(obj);

        const msg = obj.message as Record<string, unknown> | undefined;
        const content = msg?.content;
        if (Array.isArray(content)) {
          for (const block of content as unknown[]) {
            if (typeof block !== "object" || block === null) continue;
            processToolBlock(
              block as Record<string, unknown>,
              rowMap,
              sessionsPerTool,
              filePath
            );
          }
        }
      }
    }
  } finally {
    rl.close();
  }

  return tokensInFile;
}

/**
 * Scan JSONL session files and estimate how many tokens each optimizer saved.
 *
 * Data root resolution delegates to the shared adapter helper so the env var
 * name and fallback logic are never duplicated here.
 *   1. `CLAUDE_CONTROL_PLANE_DATA_ROOT` env var (via adapter)
 *   2. `~/.claude/projects` if it exists (via adapter)
 *   3. null → empty report with zero-filled rows for all 5 tools
 */
export async function computeAttribution(): Promise<TokenAttributionReport> {
  const generatedAt = new Date().toISOString();

  // Seed zero-rows for every tool upfront so the report always has 5 rows.
  const rowMap = new Map<TokenOptimizerToolId, TokenAttributionRow>(
    TOOL_IDS.map((id) => [
      id,
      {
        toolId: id,
        toolName: DEFAULTS[id].name,
        sessionsObserved: 0,
        toolCallsObserved: 0,
        estimatedTokensSaved: 0,
        percentReduction: 0,
        evidence: "No sessions analyzed.",
      },
    ])
  );

  // Resolve data root via the shared adapter helper (never duplicate the logic).
  const resolved = resolveDataRoot();
  const dataRoot = resolved?.directory ?? null;
  if (!dataRoot || !existsSync(dataRoot)) {
    return {
      generatedAt,
      totalSessionsAnalyzed: 0,
      totalEstimatedSavings: 0,
      rows: Array.from(rowMap.values()),
    };
  }

  let totalSessionsAnalyzed = 0;
  let grandTotalTokens = 0;

  // Track which unique JSONL files contributed a match for each tool.
  const sessionsPerTool = new Map<TokenOptimizerToolId, Set<string>>(
    TOOL_IDS.map((id) => [id, new Set<string>()])
  );

  try {
    const projectDirs = await readdir(dataRoot, { withFileTypes: true });

    for (const projectEntry of projectDirs) {
      if (!projectEntry.isDirectory()) continue;
      const projectPath = path.join(dataRoot, projectEntry.name);

      let projectFiles: string[];
      try {
        const entries = await readdir(projectPath);
        projectFiles = entries.filter((f) => f.endsWith(".jsonl"));
      } catch {
        continue;
      }

      for (const jsonlFile of projectFiles) {
        const filePath = path.join(projectPath, jsonlFile);
        totalSessionsAnalyzed += 1;

        // Stream the file line-by-line to avoid reading the entire JSONL into
        // memory at once (large sessions can exceed hundreds of MB).
        try {
          grandTotalTokens += await scanFile(filePath, rowMap, sessionsPerTool);
        } catch {
          // Best-effort; skip unreadable files
        }
      }
    }
  } catch {
    // Best-effort scan; return what we have
  }

  const TOKENS_PER_CALL = 400;
  let totalEstimatedSavings = 0;

  for (const [id, row] of rowMap) {
    const sessionsObserved = sessionsPerTool.get(id)?.size ?? 0;
    const estimatedTokensSaved = row.toolCallsObserved * TOKENS_PER_CALL;
    const percentReduction =
      grandTotalTokens > 0 ? (estimatedTokensSaved / grandTotalTokens) * 100 : 0;

    totalEstimatedSavings += estimatedTokensSaved;

    rowMap.set(id, {
      ...row,
      sessionsObserved,
      estimatedTokensSaved,
      percentReduction,
      evidence:
        row.toolCallsObserved > 0
          ? row.evidence
          : `No ${DEFAULTS[id].name} tool calls detected in ${totalSessionsAnalyzed} session(s).`,
    });
  }

  return {
    generatedAt,
    totalSessionsAnalyzed,
    totalEstimatedSavings,
    rows: Array.from(rowMap.values()),
  };
}
