import type { SessionDerivedFlags } from "@control-plane/core";
import { describe, expect, it } from "vitest";
import { sessionBadgeCount } from "@/components/sessions/session-badges";
import { matchesSessionFilters } from "@/components/sessions/session-filters";
import { filterAndSort, type SessionListRow } from "@/components/sessions/session-list";

/**
 * Wave 2 coverage for the pure helpers behind `<SessionList>`:
 *   - `filterAndSort` — facet filtering, query matching, sort keys
 *   - `matchesSessionFilters` — predicate used by projects + list
 *   - `sessionBadgeCount` — helper consumed by layout
 *
 * JSX rendering is covered by the Playwright smoke (`e2e/sessions.spec.ts`).
 */

const EMPTY_FLAGS: SessionDerivedFlags = {
  hasCompaction: false,
  hasThinking: false,
  usesTaskAgent: false,
  usesMcp: false,
  usesWebSearch: false,
  usesWebFetch: false,
};

function makeRow(over: Partial<SessionListRow>): SessionListRow {
  return {
    filePath: over.sessionId ? `/tmp/${over.sessionId}.jsonl` : "/tmp/a.jsonl",
    sessionId: "session-a",
    projectId: "proj-a",
    modifiedAt: "2026-01-01T00:00:00.000Z",
    sizeBytes: 1024,
    title: "Session A",
    firstUserText: "hello",
    model: "claude-test",
    turnCountLowerBound: 3,
    ...over,
  };
}

describe("filterAndSort", () => {
  const rows: readonly SessionListRow[] = [
    makeRow({
      sessionId: "a",
      title: "Alpha",
      projectId: "p-alpha",
      modifiedAt: "2026-01-03T00:00:00.000Z",
      sizeBytes: 300,
      estimatedCostUsd: 12.5,
      durationMs: 30_000,
      messageCount: 5,
      flags: { ...EMPTY_FLAGS, hasCompaction: true },
    }),
    makeRow({
      sessionId: "b",
      title: "Beta",
      projectId: "p-beta",
      modifiedAt: "2026-01-02T00:00:00.000Z",
      sizeBytes: 900,
      estimatedCostUsd: 0.42,
      durationMs: 120_000,
      messageCount: 12,
      flags: { ...EMPTY_FLAGS, usesMcp: true },
    }),
    makeRow({
      sessionId: "c",
      title: "Gamma",
      projectId: "p-gamma",
      modifiedAt: "2026-01-01T00:00:00.000Z",
      sizeBytes: 150,
      estimatedCostUsd: 3.25,
      durationMs: 90_000,
      messageCount: 8,
      flags: { ...EMPTY_FLAGS, hasCompaction: true, usesMcp: true },
    }),
  ];

  it("sorts by modified desc by default", () => {
    const sorted = filterAndSort(rows, "", {}, "modified", "desc");
    expect(sorted.map((r) => r.sessionId)).toEqual(["a", "b", "c"]);
  });

  it("sorts by cost ascending + descending", () => {
    const asc = filterAndSort(rows, "", {}, "cost", "asc");
    expect(asc.map((r) => r.sessionId)).toEqual(["b", "c", "a"]);
    const desc = filterAndSort(rows, "", {}, "cost", "desc");
    expect(desc.map((r) => r.sessionId)).toEqual(["a", "c", "b"]);
  });

  it("sorts by duration", () => {
    const sorted = filterAndSort(rows, "", {}, "duration", "desc");
    expect(sorted.map((r) => r.sessionId)).toEqual(["b", "c", "a"]);
  });

  it("sorts by messages", () => {
    const sorted = filterAndSort(rows, "", {}, "messages", "desc");
    expect(sorted.map((r) => r.sessionId)).toEqual(["b", "c", "a"]);
  });

  it("filters by query substring across title + session id + project", () => {
    expect(filterAndSort(rows, "alpha", {}, "modified", "desc").map((r) => r.sessionId)).toEqual([
      "a",
    ]);
    expect(filterAndSort(rows, "beta", {}, "modified", "desc").map((r) => r.sessionId)).toEqual([
      "b",
    ]);
    expect(filterAndSort(rows, "p-gamma", {}, "modified", "desc").map((r) => r.sessionId)).toEqual([
      "c",
    ]);
  });

  it("filters by facet: compaction only", () => {
    const hits = filterAndSort(rows, "", { hasCompaction: true }, "modified", "desc");
    expect(hits.map((r) => r.sessionId)).toEqual(["a", "c"]);
  });

  it("filters by facet AND: compaction + mcp", () => {
    const hits = filterAndSort(
      rows,
      "",
      { hasCompaction: true, usesMcp: true },
      "modified",
      "desc"
    );
    expect(hits.map((r) => r.sessionId)).toEqual(["c"]);
  });

  it("rows without flags are excluded when any facet filter is active", () => {
    const withoutFlags = makeRow({ sessionId: "d", title: "Delta" });
    const all = [...rows, withoutFlags];
    const unfiltered = filterAndSort(all, "", {}, "modified", "desc");
    expect(unfiltered.map((r) => r.sessionId)).toContain("d");
    const filtered = filterAndSort(all, "", { hasCompaction: true }, "modified", "desc");
    expect(filtered.map((r) => r.sessionId)).not.toContain("d");
  });

  it("missing numeric fields treated as 0 for sorting", () => {
    const partial = makeRow({ sessionId: "x", estimatedCostUsd: undefined });
    const sorted = filterAndSort([partial, ...rows], "", {}, "cost", "asc");
    expect(sorted[0]?.sessionId).toBe("x");
  });
});

describe("matchesSessionFilters", () => {
  it("returns true with no active filters", () => {
    expect(matchesSessionFilters(EMPTY_FLAGS, {})).toBe(true);
  });

  it("requires every active filter to be true", () => {
    const flags = { ...EMPTY_FLAGS, hasCompaction: true };
    expect(matchesSessionFilters(flags, { hasCompaction: true })).toBe(true);
    expect(matchesSessionFilters(flags, { hasCompaction: true, usesMcp: true })).toBe(false);
  });
});

describe("sessionBadgeCount", () => {
  it("counts only the true flags", () => {
    expect(sessionBadgeCount(EMPTY_FLAGS)).toBe(0);
    expect(sessionBadgeCount({ ...EMPTY_FLAGS, hasCompaction: true, usesMcp: true })).toBe(2);
    expect(
      sessionBadgeCount({
        hasCompaction: true,
        hasThinking: true,
        usesTaskAgent: true,
        usesMcp: true,
        usesWebSearch: true,
        usesWebFetch: true,
      })
    ).toBe(6);
  });
});
