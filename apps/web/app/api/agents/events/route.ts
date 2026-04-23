import "server-only";
import { type FSWatcher, watch } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { readTranscriptFile } from "@control-plane/adapter-claude-code";
import type { AgentAnimationSnapshot } from "@control-plane/core";
import {
  AGENT_ANIMATION_SUBAGENT_IDLE_MS,
  type AgentAnimationDerivation,
  deriveAgentAnimationSnapshot,
  mergeAgentAnimationSnapshots,
} from "@/lib/agent-animation-source";
import { toAgentId } from "@/lib/agents-source";
import { getConfiguredDataRoot } from "@/lib/sessions-source";
import { withAudit } from "@/lib/with-audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEBOUNCE_MS = 100;
const JSONL_EXTENSION = ".jsonl";
const SUBAGENTS_DIR = "subagents";
const SUBAGENT_FILE_PREFIX = "agent-";
const SSE_HEADERS: HeadersInit = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

function agentsEventsHandler(request: Request): Response {
  const dataRoot = getConfiguredDataRoot();
  if (!dataRoot) {
    return inertStream();
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      startAgentAnimationWatchers(dataRoot, controller, request.signal).catch((error) => {
        try {
          controller.enqueue(
            encode(`event: error\ndata: ${JSON.stringify({ message: errorMessage(error) })}\n\n`)
          );
        } catch {
          // Controller may already be closed.
        }
      });
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

export const GET = withAudit("api.agents.events", agentsEventsHandler);

async function startAgentAnimationWatchers(
  dataRoot: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  signal: AbortSignal
): Promise<void> {
  const rootStat = await safeStat(dataRoot);
  if (!rootStat?.isDirectory()) {
    controller.enqueue(encode("retry: 3000\n\n: no agent events\n\n"));
    controller.close();
    return;
  }

  controller.enqueue(encode("retry: 3000\n\n"));

  const watchers = new Set<FSWatcher>();
  const watchedDirs = new Set<string>();
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const permissionTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const sessionSnapshots = new Map<string, Map<string, AgentAnimationSnapshot>>();
  let closed = false;

  const teardown = () => {
    if (closed) return;
    closed = true;
    for (const timer of debounceTimers.values()) clearTimeout(timer);
    for (const timer of permissionTimers.values()) clearTimeout(timer);
    debounceTimers.clear();
    permissionTimers.clear();
    for (const watcher of watchers) {
      try {
        watcher.close();
      } catch {
        // Already closed.
      }
    }
    watchers.clear();
    try {
      controller.close();
    } catch {
      // Already closed.
    }
  };

  signal.addEventListener("abort", teardown, { once: true });

  await scanProjects(true);
  attachRootWatcher();

  async function scanProjects(startup: boolean): Promise<void> {
    const entries = await safeListDir(dataRoot);
    for (const projectId of entries) {
      if (closed) return;
      if (projectId.startsWith(".")) continue;
      const projectDir = path.join(dataRoot, projectId);
      const projectStat = await safeStat(projectDir);
      if (!projectStat?.isDirectory()) continue;
      attachProjectWatcher(projectDir, projectId);
      await scanProject(projectDir, projectId, startup);
    }
  }

  async function scanProject(
    projectDir: string,
    projectId: string,
    startup: boolean
  ): Promise<void> {
    const entries = await safeListDir(projectDir);
    for (const name of entries) {
      if (closed) return;
      const target = path.join(projectDir, name);
      if (name.endsWith(JSONL_EXTENSION)) {
        const sessionId = name.slice(0, -JSONL_EXTENSION.length);
        await processSessionFile(projectDir, projectId, sessionId, startup);
        continue;
      }
      const targetStat = await safeStat(target);
      if (targetStat?.isDirectory()) {
        attachSubagentWatcher(path.join(target, SUBAGENTS_DIR), projectDir, projectId, name);
      }
    }
  }

  function attachRootWatcher(): void {
    if (watchedDirs.has(dataRoot)) return;
    try {
      const watcher = watch(dataRoot, { persistent: false }, (_eventType, filename) => {
        if (closed || !filename) return;
        const projectId = filename.toString();
        if (projectId.startsWith(".")) return;
        const projectDir = path.join(dataRoot, projectId);
        void safeStat(projectDir).then((projectStat) => {
          if (closed || !projectStat?.isDirectory()) return;
          attachProjectWatcher(projectDir, projectId);
          void scanProject(projectDir, projectId, false);
        });
      });
      watcher.on("error", () => {
        /* root watcher errors are non-fatal */
      });
      watchers.add(watcher);
      watchedDirs.add(dataRoot);
    } catch {
      // Continue with already-attached project watchers.
    }
  }

  function attachProjectWatcher(projectDir: string, projectId: string): void {
    if (watchedDirs.has(projectDir)) return;
    try {
      const watcher = watch(projectDir, { persistent: false }, (_eventType, filename) => {
        if (closed || !filename) return;
        const name = filename.toString();
        if (name.endsWith(JSONL_EXTENSION)) {
          const sessionId = name.slice(0, -JSONL_EXTENSION.length);
          scheduleFileRead(projectDir, projectId, sessionId, false);
          return;
        }
        const maybeSessionDir = path.join(projectDir, name);
        void safeStat(maybeSessionDir).then((sessionDirStat) => {
          if (closed || !sessionDirStat?.isDirectory()) return;
          attachSubagentWatcher(
            path.join(maybeSessionDir, SUBAGENTS_DIR),
            projectDir,
            projectId,
            name
          );
        });
      });
      watcher.on("error", () => {
        /* per-project watcher errors are non-fatal */
      });
      watchers.add(watcher);
      watchedDirs.add(projectDir);
    } catch {
      // Watch failed for this project; other projects remain live.
    }
  }

  function attachSubagentWatcher(
    subagentsDir: string,
    projectDir: string,
    projectId: string,
    sessionId: string
  ): void {
    if (watchedDirs.has(subagentsDir)) return;
    void safeStat(subagentsDir).then((subagentsStat) => {
      if (closed || !subagentsStat?.isDirectory() || watchedDirs.has(subagentsDir)) return;
      try {
        const watcher = watch(subagentsDir, { persistent: false }, (_eventType, filename) => {
          if (closed || !filename) return;
          const name = filename.toString();
          if (!name.startsWith(SUBAGENT_FILE_PREFIX) || !name.endsWith(JSONL_EXTENSION)) return;
          scheduleFileRead(projectDir, projectId, sessionId, false);
        });
        watcher.on("error", () => {
          /* subagent watcher errors are non-fatal */
        });
        watchers.add(watcher);
        watchedDirs.add(subagentsDir);
        scheduleFileRead(projectDir, projectId, sessionId, false);
      } catch {
        // Watch failed; the main session file watcher still works.
      }
    });
  }

  function scheduleFileRead(
    projectDir: string,
    projectId: string,
    sessionId: string,
    startup: boolean
  ): void {
    const key = sessionKey(projectId, sessionId);
    const existing = debounceTimers.get(key);
    if (existing) clearTimeout(existing);
    debounceTimers.set(
      key,
      setTimeout(() => {
        debounceTimers.delete(key);
        void processSessionFile(projectDir, projectId, sessionId, startup);
      }, DEBOUNCE_MS)
    );
  }

  async function processSessionFile(
    projectDir: string,
    projectId: string,
    sessionId: string,
    startup: boolean
  ): Promise<void> {
    if (closed) return;
    const key = sessionKey(projectId, sessionId);
    const filePath = path.join(projectDir, `${sessionId}${JSONL_EXTENSION}`);
    const fileStat = await safeStat(filePath);
    if (!fileStat?.isFile()) return;

    let result: AgentAnimationDerivation;
    try {
      const transcript = await readTranscriptFile(filePath);
      const backgroundSubagentCount = await countActiveBackgroundSubagents(projectDir, sessionId);
      result = deriveAgentAnimationSnapshot({
        agentId: toAgentId(projectId),
        projectId,
        sessionId,
        entries: transcript.entries,
        now: new Date(),
        fileModifiedAt: fileStat.mtime,
        startup,
        backgroundSubagentCount,
      });
    } catch {
      return;
    }

    const existingPermissionTimer = permissionTimers.get(key);
    if (existingPermissionTimer) {
      clearTimeout(existingPermissionTimer);
      permissionTimers.delete(key);
    }
    if (result.nextPermissionCheckAtMs !== null) {
      const delayMs = Math.max(0, result.nextPermissionCheckAtMs - Date.now() + 10);
      permissionTimers.set(
        key,
        setTimeout(() => {
          permissionTimers.delete(key);
          void processSessionFile(projectDir, projectId, sessionId, false);
        }, delayMs)
      );
    }

    if (!result.snapshot) return;
    const projectSnapshots =
      sessionSnapshots.get(projectId) ?? new Map<string, AgentAnimationSnapshot>();
    projectSnapshots.set(sessionId, result.snapshot);
    sessionSnapshots.set(projectId, projectSnapshots);
    const merged = mergeAgentAnimationSnapshots([...projectSnapshots.values()]);
    if (merged) emitSnapshot(merged);
  }

  async function countActiveBackgroundSubagents(
    projectDir: string,
    sessionId: string
  ): Promise<number> {
    const subagentsDir = path.join(projectDir, sessionId, SUBAGENTS_DIR);
    const names = await safeListDir(subagentsDir);
    if (names.length === 0) return 0;
    const nowMs = Date.now();
    let count = 0;
    for (const name of names) {
      if (!name.startsWith(SUBAGENT_FILE_PREFIX) || !name.endsWith(JSONL_EXTENSION)) continue;
      const subagentStat = await safeStat(path.join(subagentsDir, name));
      if (!subagentStat?.isFile()) continue;
      if (nowMs - subagentStat.mtime.getTime() <= AGENT_ANIMATION_SUBAGENT_IDLE_MS) {
        count += 1;
      }
    }
    return count;
  }

  function emitSnapshot(snapshot: AgentAnimationSnapshot): void {
    if (closed) return;
    try {
      controller.enqueue(encode(`data: ${JSON.stringify({ snapshot })}\n\n`));
    } catch {
      teardown();
    }
  }
}

function inertStream(): Response {
  return new Response("retry: 3000\n\n: no agent events\n\n", { headers: SSE_HEADERS });
}

function sessionKey(projectId: string, sessionId: string): string {
  return `${projectId}:${sessionId}`;
}

async function safeListDir(dir: string): Promise<readonly string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

async function safeStat(target: string) {
  try {
    return await stat(target);
  } catch {
    return null;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const encoder = new TextEncoder();
function encode(text: string): Uint8Array {
  return encoder.encode(text);
}
