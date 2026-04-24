"use client";

import { useState } from "react";

import type { TokenOptimizerTool, TokenOptimizerToolId } from "@control-plane/core";

import { ToolCard } from "./tool-card";

interface ToolGridProps {
  initialTools: TokenOptimizerTool[];
}

export function ToolGrid({ initialTools }: ToolGridProps) {
  const [tools, setTools] = useState<TokenOptimizerTool[]>(initialTools);

  const handleToggle = async (id: TokenOptimizerToolId, enabled: boolean) => {
    // Optimistic update
    setTools((prev) => prev.map((t) => (t.id === id ? { ...t, enabled } : t)));

    try {
      await fetch(`/api/token-optimizer/tools/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
    } catch {
      // Revert on failure
      setTools((prev) => prev.map((t) => (t.id === id ? { ...t, enabled: !enabled } : t)));
    }
  };

  const handleTagsChange = async (id: TokenOptimizerToolId, tags: string[]) => {
    // Optimistic update
    setTools((prev) => prev.map((t) => (t.id === id ? { ...t, tags } : t)));

    try {
      await fetch(`/api/token-optimizer/tools/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags }),
      });
    } catch {
      // Best-effort: revert to initial state for that tool's tags
      const original = initialTools.find((t) => t.id === id);
      if (original) {
        setTools((prev) => prev.map((t) => (t.id === id ? { ...t, tags: original.tags } : t)));
      }
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tools.map((tool) => (
        <ToolCard
          key={tool.id}
          tool={tool}
          onToggle={handleToggle}
          onTagsChange={handleTagsChange}
        />
      ))}
    </div>
  );
}
