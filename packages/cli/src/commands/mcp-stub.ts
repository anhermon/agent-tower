import { writeJson } from "../output.js";

export function runMcpStub(): number {
  writeJson({
    ok: false,
    reason: "unimplemented",
    message: "Run the @control-plane/mcp-server package instead",
  });
  return 1;
}
