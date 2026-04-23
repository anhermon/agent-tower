import path from "node:path";

/** Pino-compatible log level ladder. `silent` drops everything. */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "silent";

const LOG_LEVELS: ReadonlySet<LogLevel> = new Set([
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
  "silent",
]);

/** Fully resolved logger config — inputs normalized, defaults applied. */
export interface LoggerConfig {
  readonly level: LogLevel;
  readonly pretty: boolean;
  readonly writeFiles: boolean;
  readonly writeRequests: boolean;
  readonly logDir: string;
  readonly service: string;
}

export interface ResolveInput {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly isTTY?: boolean;
  readonly cwd?: string;
  readonly defaultService?: string;
}

/**
 * Resolve logger config from environment.
 *
 * Env keys:
 *   LOG_LEVEL     trace|debug|info|warn|error|fatal|silent
 *                 default: info (production) | debug (otherwise)
 *   LOG_PRETTY    1|0|auto — colored human output to process stdout
 *                 default: auto (on when stdout.isTTY)
 *   LOG_FILES     1|0 — JSON line files in LOG_DIR
 *                 default: 1 when NODE_ENV !== 'production', else 0
 *   LOG_REQUESTS  1|0 — split HTTP audit into requests.log
 *                 default: 1
 *   LOG_DIR       absolute or cwd-relative directory for log files
 *                 default: <cwd>/logs
 *   LOG_SERVICE   service name baked into every record
 *                 default: defaultService arg or "@control-plane/unknown"
 */
export function resolveLoggerConfig(input: ResolveInput = {}): LoggerConfig {
  const env = input.env ?? process.env;
  const isTTY = input.isTTY ?? Boolean(process.stdout?.isTTY);
  const cwd = input.cwd ?? process.cwd();
  const isProduction = env.NODE_ENV === "production";

  const level = parseLevel(env.LOG_LEVEL) ?? (isProduction ? "info" : "debug");
  const pretty = parseTristate(env.LOG_PRETTY, isTTY);
  const writeFiles = parseBoolean(env.LOG_FILES, !isProduction);
  const writeRequests = parseBoolean(env.LOG_REQUESTS, true);

  const logDirRaw = env.LOG_DIR && env.LOG_DIR.length > 0 ? env.LOG_DIR : path.join(cwd, "logs");
  const logDir = path.isAbsolute(logDirRaw) ? logDirRaw : path.join(cwd, logDirRaw);

  const service =
    env.LOG_SERVICE && env.LOG_SERVICE.length > 0
      ? env.LOG_SERVICE
      : (input.defaultService ?? "@control-plane/unknown");

  return { level, pretty, writeFiles, writeRequests, logDir, service };
}

function parseLevel(raw: string | undefined): LogLevel | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  return LOG_LEVELS.has(v as LogLevel) ? (v as LogLevel) : null;
}

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  const v = raw.trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return fallback;
}

function parseTristate(raw: string | undefined, autoValue: boolean): boolean {
  if (raw === undefined) return autoValue;
  const v = raw.trim().toLowerCase();
  if (v === "auto" || v === "") return autoValue;
  return parseBoolean(raw, autoValue);
}
