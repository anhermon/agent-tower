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

export async function runCli(argv: readonly string[]): Promise<number> {
  const [command, subOrFirst, ...rest] = argv;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    return runHelp();
  }

  try {
    switch (command) {
      case "health":
        return await runHealth([subOrFirst, ...rest].filter(isDefined));
      case "mcp":
        return runMcpStub();
      case "sessions":
        return await runSessions(subOrFirst, rest);
      case "skills":
        return await runSkills(subOrFirst, rest);
      case "agents":
        return await runAgents(subOrFirst, rest);
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
