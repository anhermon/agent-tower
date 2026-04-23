import { bold, writeLine } from "../output.js";

export interface CommandDescriptor {
  readonly name: string;
  readonly summary: string;
}

export const COMMANDS: readonly CommandDescriptor[] = [
  { name: "health", summary: "Report data-root resolution, session count, skill count" },
  { name: "sessions top", summary: "Top sessions by tokens, cost, or turns" },
  { name: "sessions show <id>", summary: "Show a single session's usage summary" },
  { name: "skills top", summary: "Top skills by invocations, size, bytes/tokens injected" },
  { name: "skills usage", summary: "Full skills usage report with totals" },
  { name: "skills efficacy", summary: "Skill efficacy vs all-sessions baseline" },
  { name: "agents list", summary: "List agents grouped from Claude Code projects" },
  { name: "mcp", summary: "MCP server stub (separate package)" },
  { name: "help", summary: "Print this help block" },
];

export function runHelp(): number {
  writeLine(bold("cp — Modular Agents Control Plane CLI"));
  writeLine("");
  writeLine("Usage:");
  writeLine("  cp <command> [subcommand] [--flags] [--pretty]");
  writeLine("");
  writeLine("Commands:");
  const width = Math.max(...COMMANDS.map((c) => c.name.length));
  for (const cmd of COMMANDS) {
    writeLine(`  ${cmd.name.padEnd(width, " ")}  ${cmd.summary}`);
  }
  writeLine("");
  writeLine("Global flags:");
  writeLine("  --json    Emit JSON (default)");
  writeLine("  --pretty  Emit human-readable output");
  writeLine("");
  writeLine(
    "All data is read from a locally configured Claude Code root (set CLAUDE_CONTROL_PLANE_DATA_ROOT)."
  );
  return 0;
}
