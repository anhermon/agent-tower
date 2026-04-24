import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TokenOptimizerTool } from "@control-plane/core";

import * as tokenOptimizerSource from "@/lib/token-optimizer-source";

import { GET } from "./route.js";

vi.mock("@/lib/token-optimizer-source", () => ({
  listTools: vi.fn(),
  toggleTool: vi.fn(),
  updateToolTags: vi.fn(),
}));

const ROUTE_URL = "http://127.0.0.1/api/token-optimizer/tools";

function makeTools(overrides: Partial<TokenOptimizerTool>[] = []): TokenOptimizerTool[] {
  const base: TokenOptimizerTool = {
    id: "rtk",
    name: "RTK",
    description: "test",
    source: "https://github.com/rtk-ai/rtk",
    integrationKind: "hook",
    detectedInstalled: false,
    enabled: false,
    tags: [],
    version: null,
    installedAt: null,
    enabledAt: null,
    disabledAt: null,
  };
  if (overrides.length === 0) return [base];
  return overrides.map((o) => ({ ...base, ...o }));
}

describe("GET /api/token-optimizer/tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("given_tools_exist__when_get__then_returns_ok_with_tools_array", async () => {
    const tools = makeTools();
    vi.mocked(tokenOptimizerSource.listTools).mockResolvedValue(tools);

    const response = await GET(new Request(ROUTE_URL));

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.tools)).toBe(true);
    expect(body.tools).toHaveLength(1);
  });

  it("given_source_throws__when_get__then_returns_500", async () => {
    vi.mocked(tokenOptimizerSource.listTools).mockRejectedValue(new Error("disk error"));

    const response = await GET(new Request(ROUTE_URL));

    expect(response.status).toBe(500);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe("string");
  });
});
