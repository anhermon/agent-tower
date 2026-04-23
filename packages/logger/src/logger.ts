import pino, { type Logger as PinoLogger } from "pino";
import { type LoggerConfig, resolveLoggerConfig } from "./config.js";
import { buildStreams } from "./streams.js";

export type Logger = PinoLogger;

let rootLogger: PinoLogger | null = null;
let activeConfig: LoggerConfig | null = null;

export interface InitOptions {
  readonly overrides?: Partial<LoggerConfig>;
  readonly defaultService?: string;
}

/**
 * Initialize the process-wide root logger. Idempotent — subsequent calls
 * return the same instance. Overrides only apply on the first call; callers
 * that really need to rebuild should call {@link resetLoggerForTests} first.
 */
export function initLogger(options: InitOptions = {}): PinoLogger {
  if (rootLogger) return rootLogger;

  const resolved = resolveLoggerConfig({
    ...(options.defaultService !== undefined ? { defaultService: options.defaultService } : {}),
  });
  const merged: LoggerConfig = { ...resolved, ...options.overrides };
  const { entries } = buildStreams(merged);

  rootLogger = pino(
    {
      level: merged.level,
      base: { service: merged.service },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level(label, number) {
          // Include both the label and the numeric level so the fanout writer
          // can still route by number while humans reading raw JSON see a
          // word.
          return { level: number, levelName: label };
        },
      },
    },
    pino.multistream([...entries])
  );
  activeConfig = merged;
  return rootLogger;
}

/**
 * Return a child logger for a given component. Lazily initializes the root
 * logger on first call. Components of value `request` are automatically
 * routed to requests.log by the fanout writer.
 */
export function getLogger(component: string): PinoLogger {
  const root = rootLogger ?? initLogger();
  return root.child({ component });
}

/** Read back the currently active config — primarily for tests + `/api/health`. */
export function getActiveConfig(): LoggerConfig | null {
  return activeConfig;
}

/**
 * Test-only reset. Keep it out of production code paths — it drops references
 * to open write streams without closing them, which is fine for ephemeral
 * vitest runs but would leak handles in a long-running process.
 */
export function resetLoggerForTests(): void {
  rootLogger = null;
  activeConfig = null;
}
