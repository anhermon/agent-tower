# packages/logger — Index

## Responsibility
- Pino-backed structured logger shared by every package and the web app.
- JSON on disk (machine-readable), pretty-colored on TTY (human-readable), split into three streams: `stdout.log`, `stderr.log`, `requests.log`.
- Fully env-driven — no runtime config is passed from application code beyond `defaultService`.

## Read First
- `src/config.ts` — env parsing + defaults. Single source of truth for what `LOG_*` env vars do.
- `src/streams.ts` — pino stream wiring + the fanout writer that routes each JSON line to the right file.
- `src/logger.ts` — lazy root logger + `getLogger(component)` child factory.
- `src/request.ts` — `RequestAuditFields` type; the contract for HTTP audit records.

## Env Flags
| Var | Values | Default | Effect |
|-----|--------|---------|--------|
| `LOG_LEVEL` | trace\|debug\|info\|warn\|error\|fatal\|silent | `debug` (non-prod) / `info` (prod) | Minimum record level the logger accepts. |
| `LOG_PRETTY` | 1\|0\|auto | `auto` (on when stdout.isTTY) | Colored `pino-pretty` stream to stdout. |
| `LOG_FILES` | 1\|0 | 1 when NODE_ENV≠production | Write JSON line files to `LOG_DIR`. |
| `LOG_REQUESTS` | 1\|0 | 1 | Split `component=request` lines into `requests.log`. |
| `LOG_DIR` | path | `<cwd>/logs` | Directory for log files (created on boot). |
| `LOG_SERVICE` | string | `@control-plane/unknown` | `service` field baked into every record. |

## Entry Points / Flow
- App boots → `initLogger({ defaultService: "@control-plane/web" })` (via `apps/web/instrumentation.ts`).
- Any module → `getLogger("my-component").info({ ... }, "message")`.
- HTTP handlers → `getLogger("request")` (see `apps/web/lib/with-audit.ts`) — lines land in `requests.log` via the fanout.

## Local Conventions
- **Never create a `new pino()` directly.** Always go through `getLogger(component)` so records share `service`, `timestamp`, and the fanout routing.
- **Use bindings, not string interpolation.** `log.info({ sessionId }, "loaded")` — not `` log.info(`loaded ${id}`) ``. The JSON side is the primary audience.
- **Don't leak secrets.** Redact tokens/cookies at the call site; this package intentionally has no redaction list (premature for Phase 1). If the list grows, add it here, not at every call site.
- **`component: "request"` is reserved.** Any child logger bound with that component gets routed to `requests.log`. Don't reuse the name for anything else.

## Sharp Edges
- The fanout writer parses every JSON chunk. Pino emits one line per `.info/.warn/...` call, so this is fine at dev volumes — revisit if we ship to a busy prod.
- `pino-pretty` runs inline (not in a worker thread) so stack traces from handler errors surface on the same event loop. This trades a tiny throughput hit for much simpler debugging.
- `resetLoggerForTests()` does **not** close the previous logger's file handles. Only use it in short-lived vitest runs.
- `LOG_PRETTY=auto` checks `process.stdout.isTTY` at `initLogger` time. If you rewire stdout later (e.g., a PTY wrapper), call `initLogger` before the rewire or set the env explicitly.
