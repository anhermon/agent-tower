"use client";

import {
  categorizeTool,
  isMcpTool,
  parseMcpTool,
  type ReplayToolCall,
  type ToolCategory,
} from "@control-plane/core";
import { useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  readonly tool: ReplayToolCall;
  readonly result?: { readonly content: string; readonly isError: boolean };
};

// Category → tailwind text colour. Keep aligned with the UI design tokens.
const CATEGORY_TONE: Readonly<Record<ToolCategory, { text: string; border: string; bg: string }>> =
  {
    "file-io": { text: "text-info", border: "border-info/40", bg: "bg-info/5" },
    shell: { text: "text-ok", border: "border-ok/40", bg: "bg-ok/5" },
    agent: { text: "text-cyan", border: "border-cyan/40", bg: "bg-cyan/5" },
    web: { text: "text-accent", border: "border-accent/40", bg: "bg-accent/5" },
    planning: { text: "text-warn", border: "border-warn/40", bg: "bg-warn/5" },
    todo: { text: "text-warn", border: "border-warn/40", bg: "bg-warn/5" },
    skill: { text: "text-muted", border: "border-muted/40", bg: "bg-muted/5" },
    mcp: { text: "text-danger", border: "border-danger/40", bg: "bg-danger/5" },
    other: { text: "text-muted", border: "border-line/60", bg: "bg-white/[0.02]" },
  };

function pickArg(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const inp = input as Record<string, unknown>;
  const fields = [
    "command",
    "file_path",
    "path",
    "pattern",
    "query",
    "url",
    "description",
  ] as const;
  for (const key of fields) {
    const value = inp[key];
    if (typeof value === "string" && value.length > 0) {
      if (key === "file_path" || key === "path") {
        return value.split("/").slice(-2).join("/");
      }
      return value.length > 80 ? `${value.slice(0, 80)}…` : value;
    }
  }
  const first = Object.values(inp).find((v) => typeof v === "string");
  if (typeof first === "string") return first.length > 80 ? `${first.slice(0, 80)}…` : first;
  return "";
}

export function ToolCallBadge({ tool, result }: Props) {
  const [expanded, setExpanded] = useState(false);
  const category = categorizeTool(tool.name);
  const tone = CATEGORY_TONE[category];
  const mcp = parseMcpTool(tool.name);
  const displayName = mcp ? `${mcp.server} · ${mcp.tool}` : tool.name;
  const arg = pickArg(tool.input);

  return (
    <div
      className={cn("overflow-hidden rounded-md border font-mono text-sm", tone.border, tone.bg)}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left hover:bg-white/[0.04]"
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", tone.text)}
            style={{ backgroundColor: "currentColor" }}
          />
          <span className={cn("truncate font-semibold", tone.text)}>{displayName}</span>
          {arg ? <span className="truncate text-muted">{arg}</span> : null}
          {isMcpTool(tool.name) ? (
            <span className="shrink-0 rounded-xs border border-line/60 px-1 py-0.5 text-[10px] uppercase tracking-wide text-muted">
              mcp
            </span>
          ) : null}
          {result?.isError ? (
            <span className="shrink-0 rounded-xs border border-danger/40 bg-danger/10 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-danger">
              error
            </span>
          ) : null}
        </span>
        <span
          className={cn(
            "shrink-0 text-xs text-muted transition-transform",
            expanded && "rotate-180"
          )}
        >
          ▾
        </span>
      </button>
      {expanded ? (
        <div className={cn("space-y-2 border-t px-2.5 py-2", tone.border)}>
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted/70">
              input
            </p>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xs border border-line/60 bg-black/30 p-2 text-xs text-muted">
              {truncate(JSON.stringify(tool.input, null, 2), 800)}
            </pre>
          </div>
          {result ? (
            <div>
              <p
                className={cn(
                  "mb-1 text-[10px] font-semibold uppercase tracking-wide",
                  result.isError ? "text-danger" : "text-muted/70"
                )}
              >
                {result.isError ? "error" : "result"}
              </p>
              <pre
                className={cn(
                  "max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xs border p-2 text-xs",
                  result.isError
                    ? "border-danger/30 bg-danger/5 text-danger/80"
                    : "border-line/60 bg-black/30 text-muted"
                )}
              >
                {truncate(result.content, 800)}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
