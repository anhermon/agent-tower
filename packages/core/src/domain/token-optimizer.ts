export type TokenOptimizerToolId =
  | "rtk"
  | "context-mode"
  | "token-savior"
  | "code-review-graph"
  | "graphify";

export type TokenOptimizerIntegrationKind =
  | "hook" // PreToolUse hook in settings.json
  | "mcp" // MCP server in mcp.json
  | "plugin" // ~/.claude/plugins entry
  | "skill" // SKILL.md based
  | "binary"; // standalone binary

export interface TokenOptimizerTool {
  id: TokenOptimizerToolId;
  name: string;
  description: string;
  source: string; // GitHub URL
  integrationKind: TokenOptimizerIntegrationKind;
  detectedInstalled: boolean; // found on system
  enabled: boolean; // user toggled on/off
  tags: string[];
  version: string | null;
  installedAt: string | null; // ISO timestamp
  enabledAt: string | null;
  disabledAt: string | null;
}

export interface TokenAttributionRow {
  toolId: TokenOptimizerToolId;
  toolName: string;
  sessionsObserved: number;
  toolCallsObserved: number;
  estimatedTokensSaved: number;
  percentReduction: number;
  evidence: string; // human-readable derivation note
}

export interface TokenAttributionReport {
  generatedAt: string; // ISO
  totalSessionsAnalyzed: number;
  totalEstimatedSavings: number;
  rows: TokenAttributionRow[];
}
