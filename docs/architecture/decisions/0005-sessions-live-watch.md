# 0005 — Sessions live watch via `fs.watch`

- **Status:** accepted
- **Date:** 2026-04-23
- **Deciders:** control-plane maintainers

## Context

Wave 5 of the sessions-superset plan replaces the inert `/api/events`
stub with a real SSE stream that mirrors local JSONL activity into the
dashboard — "a new session appeared" and "an existing session was
appended to" — so the UI can refresh without a full reload. The
on-disk layout is a flat two-level tree: `<root>/<projectDir>/<sessionId>.jsonl`.

Constraints:

- **Local-first, zero-runtime.** No external poller, no daemon. The
  Next.js route handler is the only consumer.
- **Honest telemetry.** The stream must not fabricate frames. If the
  data root is unconfigured we emit the original `: no events` stub.
- **Scales to 1,000+ sessions.** Recursive-watch semantics differ
  sharply across platforms — FSEvents (macOS) is cheap and recursive;
  `inotify` (Linux) recurses only up to a bounded watcher budget and
  is easily exhausted if we set one watcher per file.

## Decision

Use `node:fs`'s synchronous `watch(dir, { persistent: false })` at
two levels:

1. One watcher on the **data root** — fires when a new project
   directory appears; in response we attach a watcher for that
   directory's JSONL files.
2. One watcher per **project directory** — fires on `rename`/`change`
   within it. We map `rename` → `session-created` (or `session-deleted`
   if we later care) and `change` → `session-appended`.

We deliberately do **not** pass `recursive: true`. On Linux that flag
only works on Node ≥ 20 for some kernels and silently falls back
elsewhere; on macOS it inflates the watcher count because FSEvents
already delivers events up the tree. Two-level manual attachment is
predictable on both platforms.

Emitted frames use the canonical `EventEnvelope` shape from
`@control-plane/core`. Writes are **debounced per session file** at
100 ms to collapse the burst of events that accompanies a multi-line
JSONL append. The debounce window is kept small so the UI still feels
live; the only effect is rate-limiting frames per session, not
delaying the first frame.

On `request.signal.aborted` the handler closes every watcher it
opened — otherwise Node's event loop pins the process. A unit test
covers this cleanup path.

## Consequences

- **Pros.** Real-time live updates on both macOS and Linux with a
  tight watcher budget (1 + N projects, typically 50–100 for this
  user's corpus). No polling loop, no accumulated drift. Predictable
  behaviour when `fs.watch` misses events (which it does under load):
  the client can fall back to the existing list endpoints.
- **Cons.** `fs.watch` is best-effort — it can miss rapid successive
  writes on some filesystems. We accept this; the canonical data on
  disk is always the source of truth, so a missed frame only costs the
  UI a one-cycle staleness.
- **Cons.** If a user drops a brand-new project directory while the
  server is running, the data-root watcher catches the rename event
  and attaches a new per-project watcher in the next tick. There is a
  narrow race window (ms-scale) where an append to a freshly-created
  session could be missed; for Phase 1 (read-only viewer) this is
  acceptable.

## Alternatives considered

- **Chokidar.** Smooths over cross-platform differences but adds a
  runtime dep (~130 KB plus native `fsevents`) for a small set of
  events we can handle directly. Rejected.
- **Polling `stat()` on a cached index.** Works universally but
  defeats the "1 s latency" DoD gate and burns CPU on 1,000+ files.
  Rejected.
- **Recursive `fs.watch`.** Tempting on macOS but inconsistent on
  Linux; rejected to keep semantics identical across platforms.
- **File-system notifications via a helper daemon.** Reintroduces the
  runtime we are trying to avoid in Phase 1. Rejected.
