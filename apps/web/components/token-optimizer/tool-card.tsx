"use client";

import { useState } from "react";

import type { TokenOptimizerTool, TokenOptimizerToolId } from "@control-plane/core";

interface ToolCardProps {
  tool: TokenOptimizerTool;
  onToggle: (id: TokenOptimizerToolId, enabled: boolean) => void;
  onTagsChange: (id: TokenOptimizerToolId, tags: string[]) => void;
}

export function ToolCard({ tool, onToggle, onTagsChange }: ToolCardProps) {
  const [tagInput, setTagInput] = useState("");

  const handleTagKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const trimmed = tagInput.trim();
    if (!trimmed || tool.tags.includes(trimmed)) {
      setTagInput("");
      return;
    }
    onTagsChange(tool.id, [...tool.tags, trimmed]);
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    onTagsChange(
      tool.id,
      tool.tags.filter((t) => t !== tag)
    );
  };

  return (
    <div className="glass-panel rounded-md p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow">{tool.integrationKind}</p>
          <h3 className="mt-1 truncate text-base font-semibold text-ink">{tool.name}</h3>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            title={tool.detectedInstalled ? "Detected installed" : "Not detected"}
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              tool.detectedInstalled ? "bg-ok" : "bg-muted/40"
            }`}
            aria-label={tool.detectedInstalled ? "Installed" : "Not installed"}
          />
          <button
            type="button"
            role="switch"
            aria-checked={tool.enabled}
            onClick={() => onToggle(tool.id, !tool.enabled)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan ${
              tool.enabled ? "bg-cyan" : "bg-line/60"
            }`}
            aria-label={`Toggle ${tool.name}`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${
                tool.enabled ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      <p className="mt-3 text-sm leading-6 text-muted">{tool.description}</p>

      <div className="mt-3">
        <code className="block break-all font-mono text-[11px] text-muted/70">{tool.source}</code>
      </div>

      {tool.tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tool.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full border border-line/70 bg-white/[0.03] px-2 py-0.5 font-mono text-[11px] text-muted-strong"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="ml-0.5 text-muted/60 hover:text-danger"
                aria-label={`Remove tag ${tag}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-3">
        <input
          type="text"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={handleTagKeyDown}
          placeholder="Add tag…"
          aria-label={`Add tag for ${tool.name}`}
          className="h-7 w-full rounded border border-line/50 bg-transparent px-2 text-xs text-ink placeholder:text-muted/60 focus:border-cyan focus:outline-none"
        />
      </div>

      {tool.version ? (
        <p className="mt-3 font-mono text-[11px] text-muted/70">v{tool.version}</p>
      ) : null}
    </div>
  );
}
