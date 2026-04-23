import "server-only";
import { type FSWatcher, watch } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { SessionLiveEvent } from "@control-plane/core";
import { getConfiguredDataRoot } from "@/lib/sessions-source";
import { withAudit } from "@/lib/with-audit";

/**
 * GET /api/events — live SSE stream of on-disk session changes.
 *
 * Watches the configured Claude Code data root at two levels:
 *   1. The root itself, for new project directories.
 *   2. Each existing project directory, for new/changed JSONL files.
 *
 * Debounces per-file events at 100 ms so the burst of writes from a multi-
 * line JSONL append collapses to one `session-appended` frame. Emits canonical
 * `SessionLiveEvent` envelopes (as `EventEnvelope` payloads). Cleans up every
 * watcher on `request.signal.aborted` — otherwise Node's event loop pins the
 * process.
 *
 * When the data root is unconfigured the endpoint returns the original inert
 * `: no events` comment stream, keeping parity with the Phase-1 stub.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEBOUNCE_MS = 100;
const JSONL_EXTENSION = ".jsonl";
const SSE_HEADERS: HeadersInit = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

function eventsHandler(request: Request): Response {
  const dataRoot = getConfiguredDataRoot();
  if (!dataRoot) {
    return new Response("retry: 3000\n\n: no events\n\n", { headers: SSE_HEADERS });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      startWatchers(dataRoot, controller, request.signal).catch((error) => {
        try {
          controller.enqueue(
            encode(`event: error\ndata: ${JSON.stringify({ message: errorMessage(error) })}\n\n`)
          );
        } catch {
          // Controller may already be closed — swallow.
        }
      });
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

export const GET = withAudit("api.events", eventsHandler);

async function startWatchers(
  dataRoot: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  signal: AbortSignal
): Promise<void> {
  // `retry:` hint up-front so a reconnect uses a sensible backoff.
  controller.enqueue(encode("retry: 3000\n\n"));

  const watchers = new Set<FSWatcher>();
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  const knownSessionFiles = new Set<string>();
  let closed = false;

  const teardown = () => {
    if (closed) return;
    closed = true;
    for (const timer of pending.values()) clearTimeout(timer);
    pending.clear();
    for (const w of watchers) {
      try {
        w.close();
      } catch {
        // Swallow — watcher already closed.
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

  // First scan: attach one watcher per existing project directory.
  const existingProjects = await safeListDir(dataRoot);
  for (const name of existingProjects) {
    if (signal.aborted) return;
    const dir = path.join(dataRoot, name);
    const st = await safeStat(dir);
    if (!st?.isDirectory()) continue;
    await rememberExistingSessionFiles(dir, name);
    attachProjectWatcher(dir, name);
  }

  // Top-level watcher: new project directories show up as `rename` events
  // whose filename is the new directory. Re-attach a per-project watcher
  // when that happens.
  try {
    const rootWatcher = watch(dataRoot, { persistent: false }, (eventType, filename) => {
      if (closed || !filename) return;
      const name = filename.toString();
      // Only non-dotfile entries; the adapter ignores them anyway.
      if (name.startsWith(".")) return;
      const projectDir = path.join(dataRoot, name);
      // Best-effort: stat and attach if it's a directory. On removal stat
      // fails silently and no action is taken.
      void safeStat(projectDir).then((st) => {
        if (closed) return;
        if (st?.isDirectory()) {
          void rememberExistingSessionFiles(projectDir, name).then(() => {
            if (!closed) attachProjectWatcher(projectDir, name);
          });
        }
      });
    });
    rootWatcher.on("error", () => {
      /* root watcher errors are non-fatal — per-project watchers keep running */
    });
    watchers.add(rootWatcher);
  } catch {
    // Root watch failed — continue with per-project watchers only.
  }

  function attachProjectWatcher(dir: string, projectSlug: string): void {
    try {
      const watcher = watch(dir, { persistent: false }, (eventType, filename) => {
        if (closed || !filename) return;
        const name = filename.toString();
        if (!name.endsWith(JSONL_EXTENSION)) return;
        const sessionId = name.slice(0, -JSONL_EXTENSION.length);
        const key = `${projectSlug}:${sessionId}`;
        const existingTimer = pending.get(key);
        if (existingTimer) clearTimeout(existingTimer);
        pending.set(
          key,
          setTimeout(() => {
            pending.delete(key);
            if (closed) return;
            void emitSessionEvent(eventType, dir, name, projectSlug, sessionId);
          }, DEBOUNCE_MS)
        );
      });
      watcher.on("error", () => {
        /* per-project watcher errors are non-fatal */
      });
      watchers.add(watcher);
    } catch {
      // Watch failed — swallow; the remaining watchers stay healthy.
    }
  }

  async function emitSessionEvent(
    eventType: string,
    dir: string,
    fileName: string,
    projectSlug: string,
    sessionId: string
  ): Promise<void> {
    const filePath = path.join(dir, fileName);
    const st = await safeStat(filePath);
    // Removal / unreadable — skip (we don't emit delete events in Phase 1).
    if (!st) return;
    const occurredAt = new Date().toISOString();
    const key = sessionFileKey(projectSlug, sessionId);
    const isNewSessionFile = eventType === "rename" && !knownSessionFiles.has(key);
    knownSessionFiles.add(key);
    const type: SessionLiveEvent["type"] = isNewSessionFile
      ? "session-created"
      : "session-appended";
    const envelope = buildEnvelope({
      type,
      sessionId,
      projectSlug,
      occurredAt,
    });
    try {
      controller.enqueue(encode(`data: ${JSON.stringify(envelope)}\n\n`));
    } catch {
      teardown();
    }
  }

  async function rememberExistingSessionFiles(dir: string, projectSlug: string): Promise<void> {
    const entries = await safeListDir(dir);
    for (const name of entries) {
      if (!name.endsWith(JSONL_EXTENSION)) continue;
      const sessionId = name.slice(0, -JSONL_EXTENSION.length);
      knownSessionFiles.add(sessionFileKey(projectSlug, sessionId));
    }
  }
}

function sessionFileKey(projectSlug: string, sessionId: string): string {
  return `${projectSlug}:${sessionId}`;
}

function buildEnvelope(event: SessionLiveEvent): { readonly event: SessionLiveEvent } {
  return { event };
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
