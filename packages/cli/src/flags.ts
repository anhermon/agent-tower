import { type ParseArgsConfig, parseArgs } from "node:util";

/**
 * Thin wrapper around `node:util`'s `parseArgs` that lets commands declare
 * their options inline while keeping a single usage-error surface (exit code
 * 2 with a stderr message).
 */

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export type FlagsOptions = Exclude<ParseArgsConfig["options"], undefined>;

export interface ParsedFlags<T> {
  readonly values: T;
  readonly positionals: readonly string[];
}

export function parseFlags<T extends Record<string, unknown>>(
  argv: readonly string[],
  options: FlagsOptions
): ParsedFlags<T> {
  try {
    const result = parseArgs({
      args: [...argv],
      options,
      allowPositionals: true,
      strict: true,
    });
    return {
      values: result.values as T,
      positionals: result.positionals as readonly string[],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new UsageError(message);
  }
}

/** Parse a positive integer flag like `--limit=10`. Returns a fallback when undefined. */
export function readIntFlag(value: string | undefined, fallback: number, flagName: string): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0 || String(parsed) !== value.trim()) {
    throw new UsageError(`--${flagName} must be a non-negative integer, got "${value}"`);
  }
  return parsed;
}

/** Validates `--by=<enum>` style flags against the accepted values. */
export function readEnumFlag<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
  flagName: string
): T {
  if (value === undefined) return fallback;
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new UsageError(`--${flagName} must be one of ${allowed.join(", ")}, got "${value}"`);
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function readDateFlag(value: string | undefined, flagName: string): string | undefined {
  if (value === undefined) return undefined;
  if (!DATE_PATTERN.test(value)) {
    throw new UsageError(`--${flagName} must be YYYY-MM-DD, got "${value}"`);
  }
  return value;
}
