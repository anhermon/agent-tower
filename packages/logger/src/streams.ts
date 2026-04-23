import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { Writable } from "node:stream";

import pino, { type StreamEntry } from "pino";

import type { LoggerConfig } from "./config.js";

/**
 * Pino "warn" numeric level. Anything >= 40 is treated as stderr-worthy
 * (warn/error/fatal). Kept here as a named constant so future callers who
 * want to fan out by level don't have to spelunk pino internals.
 */
export const STDERR_LEVEL_FLOOR = 40;

/** Components whose output is routed to requests.log instead of stdout.log. */
const REQUEST_COMPONENT = "request";
const require = createRequire(import.meta.url);

// pino-pretty uses `export =` so we use an import-equals type alias
// instead of an inline import() annotation.
import type PinoPrettyModule = require("pino-pretty");
type PrettyFactory = typeof PinoPrettyModule;

export interface FanoutSinks {
  readonly stdoutStream: NodeJS.WritableStream;
  readonly stderrStream: NodeJS.WritableStream;
  readonly requestsStream: NodeJS.WritableStream | null;
}

/**
 * Route each pino JSON line to the right file:
 *   - component === "request"         → requests.log (if enabled)
 *   - level      >= STDERR_LEVEL_FLOOR → stderr.log
 *   - everything else                 → stdout.log
 *
 * A JSON parse error means pino wrote something unexpected — fall back to
 * stdout so we never lose a line. The logger guarantees the `level` and
 * `component` bindings, so in practice this path is unreachable.
 */
export function createFanoutWriter(sinks: FanoutSinks): Writable {
  return new Writable({
    write(chunk: Buffer, _encoding, callback) {
      routeChunk(chunk, sinks);
      callback();
    },
    final(callback) {
      const pending: Promise<void>[] = [];
      for (const stream of [sinks.stdoutStream, sinks.stderrStream, sinks.requestsStream]) {
        if (stream && "end" in stream && typeof stream.end === "function") {
          pending.push(
            new Promise<void>((resolve) => {
              stream.end(() => resolve());
            })
          );
        }
      }
      void Promise.all(pending).then(() => callback());
    },
  });
}

function routeChunk(chunk: Buffer, sinks: FanoutSinks): void {
  const text = chunk.toString("utf8");
  try {
    const parsed = JSON.parse(text) as { level?: unknown; component?: unknown };
    if (parsed.component === REQUEST_COMPONENT && sinks.requestsStream) {
      sinks.requestsStream.write(chunk);
      return;
    }
    if (typeof parsed.level === "number" && parsed.level >= STDERR_LEVEL_FLOOR) {
      sinks.stderrStream.write(chunk);
      return;
    }
  } catch {
    // malformed JSON — fall through to stdout so nothing is dropped
  }
  sinks.stdoutStream.write(chunk);
}

/**
 * Build the pino stream entries for a given config. Caller owns the lifecycle
 * of returned `WriteStream`s — close them on process shutdown if graceful
 * cleanup matters. For a Next.js dev server this runs once per boot; the OS
 * reaps file handles on process exit.
 */
export function buildStreams(config: LoggerConfig): {
  readonly entries: readonly StreamEntry[];
  readonly files: readonly WriteStream[];
} {
  const entries: StreamEntry[] = [];
  const files: WriteStream[] = [];

  if (config.pretty) {
    const prettyFactory = require("pino-pretty") as PrettyFactory;
    entries.push({
      level: config.level === "silent" ? "fatal" : config.level,
      stream: prettyFactory({
        colorize: true,
        translateTime: "SYS:HH:MM:ss.l",
        ignore: "pid,hostname",
        singleLine: false,
      }),
    });
  }

  if (config.writeFiles) {
    mkdirSync(config.logDir, { recursive: true });
    const stdoutStream = createWriteStream(path.join(config.logDir, "stdout.log"), { flags: "a" });
    const stderrStream = createWriteStream(path.join(config.logDir, "stderr.log"), { flags: "a" });
    files.push(stdoutStream, stderrStream);

    let requestsStream: WriteStream | null = null;
    if (config.writeRequests) {
      requestsStream = createWriteStream(path.join(config.logDir, "requests.log"), { flags: "a" });
      files.push(requestsStream);
    }

    const fanout = createFanoutWriter({ stdoutStream, stderrStream, requestsStream });
    entries.push({
      level: config.level === "silent" ? "fatal" : config.level,
      stream: fanout,
    });
  }

  if (entries.length === 0) {
    // Nothing enabled — route to /dev/null so pino has a valid sink.
    entries.push({
      level: "fatal",
      stream: pino.destination({ dest: process.platform === "win32" ? "NUL" : "/dev/null" }),
    });
  }

  return { entries, files };
}
