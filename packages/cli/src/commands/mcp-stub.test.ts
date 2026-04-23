import { describe, expect, it } from "vitest";

import { captureOutput } from "../test-helpers.js";

import { runMcpStub } from "./mcp-stub.js";

describe("runMcpStub", () => {
  it("given_invocation__when_running__then_returns_unimplemented_with_exit_one", async () => {
    const { exitCode, stdout } = await captureOutput(() => runMcpStub());
    expect(exitCode).toBe(1);
    const parsed = JSON.parse(stdout) as { ok: boolean; reason: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.reason).toBe("unimplemented");
  });
});
