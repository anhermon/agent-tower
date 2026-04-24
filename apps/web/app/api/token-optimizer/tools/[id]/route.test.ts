import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TokenOptimizerTool } from "@control-plane/core";

import * as tokenOptimizerSource from "@/lib/token-optimizer-source";

import { PATCH } from "./route.js";

vi.mock("@/lib/token-optimizer-source", () => ({
  listTools: vi.fn(),
  toggleTool: vi.fn(),
  updateToolTags: vi.fn(),
}));

const BASE_URL = "http://127.0.0.1/api/token-optimizer/tools";

function makeToolsWithId(
  id: string,
  overrides: Partial<TokenOptimizerTool> = {}
): TokenOptimizerTool[] {
  return [
    {
      id: id as TokenOptimizerTool["id"],
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
      ...overrides,
    },
  ];
}

function makeCtx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe("PATCH /api/token-optimizer/tools/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("given_valid_id_and_enabled_true__when_patch__then_returns_ok_with_updated_tool", async () => {
    const updatedTool = makeToolsWithId("rtk", { enabled: true });
    vi.mocked(tokenOptimizerSource.toggleTool).mockResolvedValue(undefined);
    vi.mocked(tokenOptimizerSource.listTools).mockResolvedValue(updatedTool);

    const response = await PATCH(
      new Request(`${BASE_URL}/rtk`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      }),
      makeCtx("rtk")
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    const tool = body.tool as TokenOptimizerTool;
    expect(tool.enabled).toBe(true);
    expect(vi.mocked(tokenOptimizerSource.toggleTool)).toHaveBeenCalledWith("rtk", true);
  });

  it("given_invalid_id__when_patch__then_returns_400_invalid_id", async () => {
    vi.mocked(tokenOptimizerSource.listTools).mockResolvedValue([]);

    const response = await PATCH(
      new Request(`${BASE_URL}/nonexistent-tool`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      }),
      makeCtx("nonexistent-tool")
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(body.error).toBe("invalid_id");
  });

  it("given_valid_id_and_tags__when_patch__then_returns_ok_with_tool_containing_tags", async () => {
    const updatedTool = makeToolsWithId("graphify", { tags: ["foo"] });
    vi.mocked(tokenOptimizerSource.updateToolTags).mockResolvedValue(undefined);
    vi.mocked(tokenOptimizerSource.listTools).mockResolvedValue(updatedTool);

    const response = await PATCH(
      new Request(`${BASE_URL}/graphify`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tags: ["foo"] }),
      }),
      makeCtx("graphify")
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    const tool = body.tool as TokenOptimizerTool;
    expect(tool.tags).toContain("foo");
    expect(vi.mocked(tokenOptimizerSource.updateToolTags)).toHaveBeenCalledWith("graphify", [
      "foo",
    ]);
  });

  it("given_invalid_body_not_json__when_patch__then_returns_400_invalid_body", async () => {
    vi.mocked(tokenOptimizerSource.listTools).mockResolvedValue(makeToolsWithId("rtk"));

    const response = await PATCH(
      new Request(`${BASE_URL}/rtk`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: "not-json{{{",
      }),
      makeCtx("rtk")
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(body.error).toBe("invalid_body");
  });

  it("given_enabled_as_non_boolean__when_patch__then_returns_400_invalid_body", async () => {
    vi.mocked(tokenOptimizerSource.listTools).mockResolvedValue(makeToolsWithId("rtk"));

    const response = await PATCH(
      new Request(`${BASE_URL}/rtk`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: "yes" }),
      }),
      makeCtx("rtk")
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(body.error).toBe("invalid_body");
  });

  it("given_empty_body__when_patch__then_returns_400_no_fields", async () => {
    vi.mocked(tokenOptimizerSource.listTools).mockResolvedValue(makeToolsWithId("rtk"));

    const response = await PATCH(
      new Request(`${BASE_URL}/rtk`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      makeCtx("rtk")
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(body.error).toBe("no_fields");
  });

  it("given_tags_with_non_string_item__when_patch__then_returns_400_invalid_body", async () => {
    vi.mocked(tokenOptimizerSource.listTools).mockResolvedValue(makeToolsWithId("rtk"));

    const response = await PATCH(
      new Request(`${BASE_URL}/rtk`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tags: [42] }),
      }),
      makeCtx("rtk")
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(body.error).toBe("invalid_body");
  });

  it("given_tags_with_oversized_item__when_patch__then_returns_400_invalid_tags", async () => {
    vi.mocked(tokenOptimizerSource.listTools).mockResolvedValue(makeToolsWithId("rtk"));

    const response = await PATCH(
      new Request(`${BASE_URL}/rtk`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tags: ["a".repeat(65)] }),
      }),
      makeCtx("rtk")
    );

    expect(response.status).toBe(400);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(body.error).toBe("invalid_tags");
  });
});
