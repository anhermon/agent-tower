import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const fromRoot = (relative: string) =>
  fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@control-plane/core": fromRoot("./packages/core/src/index.ts"),
      "@control-plane/events": fromRoot("./packages/events/src/index.ts"),
      "@control-plane/storage": fromRoot("./packages/storage/src/index.ts"),
      "@control-plane/adapter-claude-code": fromRoot(
        "./packages/adapter-claude-code/src/index.ts"
      )
    }
  },
  test: {
    include: [
      "packages/**/src/**/*.test.ts",
      "apps/**/src/**/*.test.ts",
      "apps/web/lib/**/*.test.ts",
      "apps/web/app/**/*.test.ts"
    ],
    passWithNoTests: true
  }
});
