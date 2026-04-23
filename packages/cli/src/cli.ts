#!/usr/bin/env node
import { runAgentsList } from "./commands/agents-list.js";
import { runHealth } from "./commands/health.js";
import { runHelp } from "./commands/help.js";
import { runMcpStub } from "./commands/mcp-stub.js";
import { runSessionsShow } from "./commands/sessions-show.js";
import { runSessionsTop } from "./commands/sessions-top.js";
import { runSkillsEfficacy } from "./commands/skills-efficacy.js";
import { runSkillsTop } from "./commands/skills-top.js";
import { runSkillsUsage } from "./commands/skills-usage.js";
import { UsageError } from "./flags.js";
import { writeError } from "./output.js";

const GLOBAL_FLAGS = new Set(["--json", "--pretty", "--help", "-h"]);

function partitionGlobalFlags(argv: readonly string[]): {
  readonly positional: readonly string[];
  readonly globals: readonly string[];
  readonly wantsHelp: boolean;
} {
  const positional: string[] = [];
  const globals: string[] = [];
  let wantsHelp = false;
  for (const token of argv) {
    if (token === "--help" || token === "-h") {
      wantsHelp = true;
      continue;
    }
    if (GLOBAL_FLAGS.has(token) || token.startsWith("--json=") || token.startsWith("--pretty=")) {
      globals.push(token);
      continue;
    }
    positional.push(token);
  }
  return { positional, globals, wantsHelp };
}

export async function runCli(argv: readonly string[]): Promise<number> {
  const { positional, globals, wantsHelp } = partitionGlobalFlags(argv);
  const [command, subOrFirst, ...rest] = positional;

  if (wantsHelp || !command || command === "help") {
    return runHelp();
  }

  // Global flags (--pretty, --json) may appear anywhere on the command line.
  // We strip them during dispatch so each subcommand sees them in its own argv.
  const restWithGlobals = [...rest, ...globals];

  try {
    switch (command) {
      case "health":
        return await runHealth([subOrFirst, ...restWithGlobals].filter(isDefined));
      case "mcp":
        return runMcpStub();
      case "sessions":
        return await runSessions(subOrFirst, restWithGlobals);
      case "skills":
        return await runSkills(subOrFirst, restWithGlobals);
      case "agents":
        return await runAgents(subOrFirst, restWithGlobals);
      default:
        throw new UsageError(`Unknown command: ${command}`);
    }
  } catch (error) {
    if (error instanceof UsageError) {
      writeError(`usage error: ${error.message}`);
      writeError("Run `cp help` for the list of commands.");
      return 2;
    }
    const message = error instanceof Error ? error.message : String(error);
    writeError(`error: ${message}`);
    return 1;
  }
}

async function runSessions(sub: string | undefined, rest: readonly string[]): Promise<number> {
  switch (sub) {
    case "top":
      return runSessionsTop(rest);
    case "show":
      return runSessionsShow(rest);
    default:
      throw new UsageError(
        `Unknown sessions subcommand: ${sub ?? "(none)"}. Try \`top\` or \`show\`.`
      );
  }
}

async function runSkills(sub: string | undefined, rest: readonly string[]): Promise<number> {
  switch (sub) {
    case "top":
      return runSkillsTop(rest);
    case "usage":
      return runSkillsUsage(rest);
    case "efficacy":
      return runSkillsEfficacy(rest);
    default:
      throw new UsageError(
        `Unknown skills subcommand: ${sub ?? "(none)"}. Try \`top\`, \`usage\`, or \`efficacy\`.`
      );
  }
}

async function runAgents(sub: string | undefined, rest: readonly string[]): Promise<number> {
  switch (sub) {
    case "list":
      return runAgentsList(rest);
    default:
      throw new UsageError(`Unknown agents subcommand: ${sub ?? "(none)"}. Try \`list\`.`);
  }
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

// Only execute when invoked directly (allows importing `runCli` for tests).
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  runCli(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      const message = error instanceof Error ? error.message : String(error);
      writeError(`error: ${message}`);
      process.exitCode = 1;
    }
  );
}
