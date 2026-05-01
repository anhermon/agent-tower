export * from "./capabilities.js";
export * from "./contracts/index.js";
export * from "./domain/index.js";
export * from "./harness-registry.js";
export * from "./lib/pricing.js";
// harness-detector is intentionally NOT exported from the barrel because it
// uses `node:fs/promises` and `node:os` — Node-only modules that break
// webpack's client bundle. Import it via the sub-path:
//   import { listDetectedHarnesses } from "@control-plane/core/harness-detector"
