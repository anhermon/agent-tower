"use client";

import { useState } from "react";

import {
  categorizeTool,
  isMcpTool,
  parseMcpTool,
  type ReplayToolCall,
  type ToolCategory,
} from "@control-plane/core";

import { cn } from "@/lib/utils";

interface Props {
  readonly tool: ReplayToolCall;
  readonly result?: { readonly content: string; readonly isError: boolean };
}

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

const PICKABLE_ARG_FIELDS = [
  "command",
  "file_path",
  "path",
  "pattern",
  "query",
  "url",
  "description",
] as const;

type PickableArgField = (typeof PICKABLE_ARG_FIELDS)[number];

const PATH_FIELDS: ReadonlySet<PickableArgField> = new Set(["file_path", "path"]);

function pickArg(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const inp = input as Record<string, unknown>;
  const named = pickNamedArg(inp);
  if (named !== null) return named;
  return pickFirstString(inp);
}

function pickNamedArg(inp: Record<string, unknown>): string | null {
  for (const key of PICKABLE_ARG_FIELDS) {
    const value = inp[key];
    if (typeof value !== "string" || value.length === 0) continue;
    return PATH_FIELDS.has(key) ? shortenPath(value) : clampArg(value);
  }
  return null;
}

function pickFirstString(inp: Record<string, unknown>): string {
  const first = Object.values(inp).find((v) => typeof v === "string");
  return typeof first === "string" ? clampArg(first) : "";
}

function shortenPath(value: string): string {
  return value.split("/").slice(-2).join("/");
}

function clampArg(value: string): string {
  return value.length > 80 ? `${value.slice(0, 80)}…` : value;
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
      <BadgeHeader
        tone={tone}
        displayName={displayName}
        arg={arg}
        isMcp={isMcpTool(tool.name)}
        isError={result?.isError ?? false}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
      />
      {expanded ? (
        <div className={cn("space-y-2 border-t px-2.5 py-2", tone.border)}>
          <ExpandedSection title="input">
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xs border border-line/60 bg-black/30 p-2 text-xs text-muted">
              {truncate(JSON.stringify(tool.input, null, 2), 800)}
            </pre>
          </ExpandedSection>
          {result ? <ResultSection result={result} /> : null}
        </div>
      ) : null}
    </div>
  );
}

interface BadgeHeaderProps {
  readonly tone: (typeof CATEGORY_TONE)[ToolCategory];
  readonly displayName: string;
  readonly arg: string;
  readonly isMcp: boolean;
  readonly isError: boolean;
  readonly expanded: boolean;
  readonly onToggle: () => void;
}

function BadgeHeader({
  tone,
  displayName,
  arg,
  isMcp,
  isError,
  expanded,
  onToggle,
}: BadgeHeaderProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left hover:bg-white/[0.04]"
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span
          className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", tone.text)}
          style={{ backgroundColor: "currentColor" }}
        />
        <span className={cn("truncate font-semibold", tone.text)}>{displayName}</span>
        {arg ? <span className="truncate text-muted">{arg}</span> : null}
        {isMcp ? <McpChip /> : null}
        {isError ? <ErrorChip /> : null}
      </span>
      <span
        className={cn("shrink-0 text-xs text-muted transition-transform", expanded && "rotate-180")}
      >
        ▾
      </span>
    </button>
  );
}

function McpChip() {
  return (
    <span className="shrink-0 rounded-xs border border-line/60 px-1 py-0.5 text-[10px] uppercase tracking-wide text-muted">
      mcp
    </span>
  );
}

function ErrorChip() {
  return (
    <span className="shrink-0 rounded-xs border border-danger/40 bg-danger/10 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-danger">
      error
    </span>
  );
}

function ExpandedSection({
  title,
  tone,
  children,
}: {
  readonly title: string;
  readonly tone?: "error" | "muted";
  readonly children: React.ReactNode;
}) {
  return (
    <div>
      <p
        className={cn(
          "mb-1 text-[10px] font-semibold uppercase tracking-wide",
          tone === "error" ? "text-danger" : "text-muted/70"
        )}
      >
        {title}
      </p>
      {children}
    </div>
  );
}

function ResultSection({
  result,
}: {
  readonly result: { readonly content: string; readonly isError: boolean };
}) {
  return (
    <ExpandedSection
      title={result.isError ? "error" : "result"}
      tone={result.isError ? "error" : "muted"}
    >
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
    </ExpandedSection>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
