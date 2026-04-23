"use client";

import { cn } from "@/lib/utils";

export type ParsedToolResult =
  | { readonly kind: "file_updated"; readonly path: string; readonly note?: string }
  | { readonly kind: "file_written"; readonly path: string; readonly note?: string }
  | { readonly kind: "file_read"; readonly path: string; readonly note?: string }
  | { readonly kind: "bash"; readonly text: string }
  | { readonly kind: "web_search"; readonly text: string }
  | { readonly kind: "web_fetch"; readonly text: string }
  | { readonly kind: "plain"; readonly text: string };

interface Props {
  readonly content: string;
  readonly isError: boolean;
  readonly toolName?: string;
}

/**
 * Best-effort parse of a Claude Code tool-result body. Recognises the common
 * `The file <path> has been <verb>` phrasing and returns a structured card for
 * Read/Write/Edit, a mono block for Bash, a link card for WebSearch/WebFetch,
 * or a plain text block as fallback.
 */
export function parseToolResultMessage(raw: string, toolName?: string): ParsedToolResult {
  const s = raw.trim();
  if (!s) return { kind: "plain", text: raw };

  const prefix = "The file ";
  const phrasings: { needle: string; kind: "file_updated" | "file_written" | "file_read" }[] = [
    { needle: " has been updated successfully", kind: "file_updated" },
    { needle: " has been written successfully", kind: "file_written" },
    { needle: " has been written.", kind: "file_written" },
    { needle: " was read successfully", kind: "file_read" },
    { needle: " has been read.", kind: "file_read" },
  ];

  if (s.startsWith(prefix)) {
    for (const { needle, kind } of phrasings) {
      const i = s.indexOf(needle);
      if (i <= prefix.length) continue;
      const path = s.slice(prefix.length, i).trim();
      if (!path) continue;
      return { kind, path };
    }
  }

  if (toolName === "Bash" || toolName === "BashOutput") return { kind: "bash", text: s };
  if (toolName === "WebSearch") return { kind: "web_search", text: s };
  if (toolName === "WebFetch") return { kind: "web_fetch", text: s };

  return { kind: "plain", text: s };
}

function shortenPath(pathStr: string, max = 100): string {
  if (pathStr.length <= max) return pathStr;
  const parts = pathStr.split("/");
  if (parts.length <= 2) return `${pathStr.slice(0, max - 1)}…`;
  const file = parts[parts.length - 1] ?? pathStr;
  const head = parts.slice(0, 2).join("/");
  return `${head}/…/${file}`;
}

export function UserToolResult({ content, isError, toolName }: Props) {
  const parsed = parseToolResultMessage(content, toolName);

  if (isError) {
    return (
      <div className="flex gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-danger">
            tool error
          </p>
          <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[12px] leading-relaxed text-danger/80">
            {content}
          </pre>
        </div>
      </div>
    );
  }

  if (parsed.kind === "file_updated") {
    return <FileCard variant="updated" path={parsed.path} />;
  }
  if (parsed.kind === "file_written") {
    return <FileCard variant="written" path={parsed.path} />;
  }
  if (parsed.kind === "file_read") {
    return <FileCard variant="read" path={parsed.path} />;
  }
  if (parsed.kind === "bash") {
    return (
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md border border-line/60 bg-black/40 px-3 py-2 font-mono text-[12px] leading-relaxed text-ink/90">
        {parsed.text}
      </pre>
    );
  }
  if (parsed.kind === "web_search" || parsed.kind === "web_fetch") {
    return (
      <LinkCard
        text={parsed.text}
        label={parsed.kind === "web_search" ? "web search" : "web fetch"}
      />
    );
  }

  const text = parsed.text;
  const long = text.length > 320;
  return (
    <div
      className={cn(
        "rounded-md border border-line/60 bg-white/[0.03] px-3 py-2 text-[13px] leading-relaxed text-ink/85"
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted/70">result</p>
      <p className={cn("mt-1 whitespace-pre-wrap break-all", long && "line-clamp-6")}>{text}</p>
      {long ? (
        <p className="mt-2 text-[10px] text-muted/60">
          … {text.length.toLocaleString()} characters total
        </p>
      ) : null}
    </div>
  );
}

function FileCard({ variant, path }: { variant: "updated" | "written" | "read"; path: string }) {
  const tone =
    variant === "updated"
      ? "border-ok/30 bg-ok/5 text-ok"
      : variant === "written"
        ? "border-info/30 bg-info/5 text-info"
        : "border-line/60 bg-white/[0.03] text-muted";
  const label =
    variant === "updated" ? "File updated" : variant === "written" ? "File written" : "File read";
  return (
    <div className={cn("flex gap-2 rounded-md border px-3 py-2", tone)}>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-[12px] font-medium text-ink">{label}</p>
        <p className="break-all font-mono text-[12px] text-ink/80" title={path}>
          {shortenPath(path)}
        </p>
      </div>
    </div>
  );
}

function extractFirstUrl(text: string): string | null {
  const match = /https?:\/\/[^\s"'>]+/.exec(text);
  return match ? match[0] : null;
}

function LinkCard({ text, label }: { text: string; label: string }) {
  const url = extractFirstUrl(text);
  return (
    <div className="rounded-md border border-accent/30 bg-accent/5 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-accent">{label}</p>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 block break-all font-mono text-[12px] text-cyan hover:underline"
        >
          {url}
        </a>
      ) : null}
      <p className="mt-1 line-clamp-4 whitespace-pre-wrap break-all text-[12px] text-ink/80">
        {text}
      </p>
    </div>
  );
}
