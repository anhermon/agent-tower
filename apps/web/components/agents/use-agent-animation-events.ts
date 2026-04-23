"use client";

import { useEffect, useState } from "react";

import type { AgentAnimationSnapshot } from "@control-plane/core";

const AGENT_EVENTS_URL = "/api/agents/events";

export function useAgentAnimationEvents(): ReadonlyMap<string, AgentAnimationSnapshot> {
  const [snapshots, setSnapshots] = useState<ReadonlyMap<string, AgentAnimationSnapshot>>(
    () => new Map()
  );

  useEffect(() => {
    if (typeof EventSource === "undefined") return;

    const source = new EventSource(AGENT_EVENTS_URL);

    source.addEventListener("message", (event) => {
      const snapshot = parseSnapshot(event.data);
      if (!snapshot) return;
      setSnapshots((current) => {
        const next = new Map(current);
        next.set(snapshot.agentId, snapshot);
        return next;
      });
    });

    source.addEventListener("error", () => {
      // EventSource will retry by itself. Keeping the last real snapshot gives
      // the cards a stable fallback without inventing activity.
    });

    return () => {
      source.close();
    };
  }, []);

  return snapshots;
}

function parseSnapshot(raw: string): AgentAnimationSnapshot | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isSnapshotEnvelope(parsed)) return parsed.snapshot;
    if (isAgentAnimationSnapshot(parsed)) return parsed;
  } catch {
    return null;
  }
  return null;
}

function isSnapshotEnvelope(
  value: unknown
): value is { readonly snapshot: AgentAnimationSnapshot } {
  return (
    typeof value === "object" &&
    value !== null &&
    "snapshot" in value &&
    isAgentAnimationSnapshot(value.snapshot)
  );
}

function isAgentAnimationSnapshot(value: unknown): value is AgentAnimationSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<Record<keyof AgentAnimationSnapshot, unknown>>;
  return (
    typeof candidate.agentId === "string" &&
    typeof candidate.projectId === "string" &&
    typeof candidate.baseState === "string" &&
    typeof candidate.overlay === "string" &&
    typeof candidate.fatigueLevel === "string" &&
    Array.isArray(candidate.activeSessionIds) &&
    typeof candidate.subagentCount === "number" &&
    typeof candidate.lastEventAt === "string"
  );
}
