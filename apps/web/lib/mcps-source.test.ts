import { describe, expect, it } from "vitest";

import { listMcpServers } from "./mcps-source";

describe("listMcpServers", () => {
  it("returns deferred result in Phase 1 (no adapter wired)", async () => {
    const result = await listMcpServers();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("deferred");
      expect(result.message).toBeUndefined();
    }
  });
});
