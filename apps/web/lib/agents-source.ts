import type { ClaudeSessionFile } from "@control-plane/adapter-claude-code";
import {
  AGENT_KINDS,
  AGENT_RUNTIMES,
  AGENT_STATUSES,
  type AgentDescriptor,
  type AgentState,
  type AgentStatus,
  CLAUDE_FIRST_CAPABILITIES,
} from "@control-plane/core";
import { getConfiguredSessionSource, resolveDataRoot } from "./sessions-source";

/**
 * Derives an agent inventory from the Claude Code on-disk adapter. Each
 * project directory under the data root is treated as one Claude Code agent
 * instance scoped to that cwd. The module is read-only and derives state
 * from transcript filesystem metadata — no heartbeats, no writes.
 */

export const AGENT_ID_PREFIX = "claude-code:";
const ONE_HOUR_MS = 60 * 60 * 1_000;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

export interface AgentInventoryItem {
  readonly descriptor: AgentDescriptor;
  readonly state: AgentState;
  readonly sessionCount: number;
  readonly lastActiveAt: string | null;
  readonly firstSeenAt: string | null;
  readonly totalBytes: number;
  readonly projectId: string;
}

export type ListAgentsResult =
  | { readonly ok: true; readonly agents: readonly AgentInventoryItem[] }
  | { readonly ok: false; readonly reason: "unconfigured" | "error"; readonly message?: string };

export type LoadAgentResult =
  | {
      readonly ok: true;
      readonly agent: AgentInventoryItem;
      readonly sessions: readonly ClaudeSessionFile[];
    }
  | {
      readonly ok: false;
      readonly reason: "unconfigured" | "not_found" | "error";
      readonly message?: string;
    };

interface AgentsCacheEntry {
  readonly signature: string;
  readonly agents: readonly AgentInventoryItem[];
  readonly sessionsByAgent: ReadonlyMap<string, readonly ClaudeSessionFile[]>;
}

const inventoryCache = new Map<string, AgentsCacheEntry>();

export async function listAgentsOrEmpty(now: Date = new Date()): Promise<ListAgentsResult> {
  const source = getConfiguredSessionSource();
  const resolved = resolveDataRoot();
  if (!source || !resolved) {
    return { ok: false, reason: "unconfigured" };
  }

  try {
    const files = await source.listSessions();
    const entry = buildInventory(resolved.directory, files, now);
    return { ok: true, agents: entry.agents };
  } catch (error) {
    return { ok: false, reason: "error", message: errorMessage(error) };
  }
}

export async function loadAgentOrUndefined(
  agentId: string,
  now: Date = new Date()
): Promise<LoadAgentResult> {
  const source = getConfiguredSessionSource();
  const resolved = resolveDataRoot();
  if (!source || !resolved) {
    return { ok: false, reason: "unconfigured" };
  }

  try {
    const files = await source.listSessions();
    const entry = buildInventory(resolved.directory, files, now);
    const agent = entry.agents.find((candidate) => candidate.descriptor.id === agentId);
    if (!agent) {
      return { ok: false, reason: "not_found" };
    }
    const sessions = entry.sessionsByAgent.get(agent.descriptor.id) ?? [];
    return { ok: true, agent, sessions };
  } catch (error) {
    return { ok: false, reason: "error", message: errorMessage(error) };
  }
}

function buildInventory(
  directory: string,
  files: readonly ClaudeSessionFile[],
  now: Date
): AgentsCacheEntry {
  const signature = `${files.length}:${files[0]?.modifiedAt ?? "∅"}:${
    files[files.length - 1]?.modifiedAt ?? "∅"
  }`;
  const cacheKey = directory;
  const cached = inventoryCache.get(cacheKey);
  if (cached && cached.signature === signature) {
    // Re-derive state with the current `now` so status ages correctly between
    // cached listings. Descriptor + aggregate counts stay stable.
    const refreshed = cached.agents.map((agent) =>
      withRefreshedState(agent, cached.sessionsByAgent.get(agent.descriptor.id) ?? [], now)
    );
    const next: AgentsCacheEntry = {
      signature,
      agents: refreshed,
      sessionsByAgent: cached.sessionsByAgent,
    };
    inventoryCache.set(cacheKey, next);
    return next;
  }

  const grouped = new Map<string, ClaudeSessionFile[]>();
  for (const file of files) {
    const bucket = grouped.get(file.projectId);
    if (bucket) {
      bucket.push(file);
    } else {
      grouped.set(file.projectId, [file]);
    }
  }

  const agents: AgentInventoryItem[] = [];
  const sessionsByAgent = new Map<string, readonly ClaudeSessionFile[]>();
  for (const [projectId, projectFiles] of grouped) {
    // Files from listSessionFiles are newest-first globally. Re-sort per
    // project to make the derivation independent of that invariant.
    const sorted = [...projectFiles].sort((a, b) =>
      a.modifiedAt < b.modifiedAt ? 1 : a.modifiedAt > b.modifiedAt ? -1 : 0
    );
    const agent = deriveAgent(projectId, sorted, now);
    agents.push(agent);
    sessionsByAgent.set(agent.descriptor.id, sorted);
  }

  agents.sort((a, b) => {
    const al = a.lastActiveAt ?? "";
    const bl = b.lastActiveAt ?? "";
    if (al === bl) return a.descriptor.displayName.localeCompare(b.descriptor.displayName);
    return al < bl ? 1 : -1;
  });

  const entry: AgentsCacheEntry = { signature, agents, sessionsByAgent };
  inventoryCache.set(cacheKey, entry);
  return entry;
}

function deriveAgent(
  projectId: string,
  sorted: readonly ClaudeSessionFile[],
  now: Date
): AgentInventoryItem {
  const newest = sorted[0] ?? null;
  const oldest = sorted[sorted.length - 1] ?? null;
  const lastActiveAt = newest?.modifiedAt ?? null;
  const firstSeenAt = oldest?.modifiedAt ?? null;
  const totalBytes = sorted.reduce((sum, file) => sum + file.sizeBytes, 0);

  const agentId = toAgentId(projectId);
  const descriptor: AgentDescriptor = {
    id: agentId,
    runtime: AGENT_RUNTIMES.Claude,
    kind: AGENT_KINDS.Interactive,
    displayName: humanizeProjectId(projectId),
    capabilities: CLAUDE_FIRST_CAPABILITIES,
    metadata: { projectId },
  };

  const state = deriveState(agentId, sorted, now, lastActiveAt);

  return {
    descriptor,
    state,
    sessionCount: sorted.length,
    lastActiveAt,
    firstSeenAt,
    totalBytes,
    projectId,
  };
}

function withRefreshedState(
  agent: AgentInventoryItem,
  sorted: readonly ClaudeSessionFile[],
  now: Date
): AgentInventoryItem {
  return {
    ...agent,
    state: deriveState(agent.descriptor.id, sorted, now, agent.lastActiveAt),
  };
}

function deriveState(
  agentId: string,
  sorted: readonly ClaudeSessionFile[],
  now: Date,
  lastActiveAt: string | null
): AgentState {
  const status = deriveStatus(lastActiveAt, now);
  const recentCutoff = now.getTime() - ONE_HOUR_MS;
  const activeSessionIds = sorted
    .filter((file) => new Date(file.modifiedAt).getTime() >= recentCutoff)
    .map((file) => file.sessionId);

  const base: {
    agentId: string;
    status: AgentStatus;
    activeSessionIds: readonly string[];
  } = {
    agentId,
    status,
    activeSessionIds,
  };

  return lastActiveAt ? { ...base, lastSeenAt: lastActiveAt } : base;
}

function deriveStatus(lastActiveAt: string | null, now: Date): AgentStatus {
  if (!lastActiveAt) return AGENT_STATUSES.Offline;
  const ageMs = now.getTime() - new Date(lastActiveAt).getTime();
  if (!Number.isFinite(ageMs)) return AGENT_STATUSES.Offline;
  // Guard against clock skew / future mtimes: a negative age would otherwise
  // fall through to the `< ONE_HOUR_MS` branch and report the agent as
  // Available, which is misleading.
  const status =
    ageMs < 0
      ? AGENT_STATUSES.Offline
      : ageMs < ONE_HOUR_MS
        ? AGENT_STATUSES.Available
        : ageMs < ONE_DAY_MS
          ? AGENT_STATUSES.Busy
          : AGENT_STATUSES.Offline;
  // #region debug log H-B
  fetch("http://127.0.0.1:7735/ingest/3f85a983-40b3-4a81-90a2-c1548bdaf42b", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "b38cee" },
    body: JSON.stringify({
      sessionId: "b38cee",
      hypothesisId: "H-B",
      location: "apps/web/lib/agents-source.ts:deriveStatus",
      message: "agent status derivation",
      data: { lastActiveAt, ageMs, status, future: ageMs < 0 },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  return status;
}

export function toAgentId(projectId: string): string {
  return `${AGENT_ID_PREFIX}${projectId}`;
}

export function extractProjectId(agentId: string): string | null {
  if (!agentId.startsWith(AGENT_ID_PREFIX)) return null;
  return agentId.slice(AGENT_ID_PREFIX.length);
}

/**
 * Claude Code encodes a cwd into the project folder name by replacing each
 * path separator with `-` and doubling literal `-` characters. This inverts
 * that encoding heuristically so the UI can show a human-readable path.
 */
export function humanizeProjectId(raw: string): string {
  if (raw.length === 0) return raw;
  const SENTINEL = "\u0000";
  let working = raw;
  if (working.startsWith("-")) {
    working = `/${working.slice(1)}`;
  }
  working = working.replace(/--/g, SENTINEL);
  working = working.replace(/-/g, "/");
  working = working.replace(new RegExp(SENTINEL, "g"), "-");
  return working;
}

/** Test-only hook: clears the in-process inventory cache. */
export function __clearAgentInventoryCacheForTests(): void {
  inventoryCache.clear();
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
