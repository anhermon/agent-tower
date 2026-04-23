import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const fromRoot = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

// Shared resolve aliases — applied at the root and mirrored inside each
// project so workspace imports resolve to the source TS entry points (instead
// of built `dist/` outputs) regardless of which project runs a test file.
const sharedAlias = {
  "@control-plane/core": fromRoot("./packages/core/src/index.ts"),
  "@control-plane/events": fromRoot("./packages/events/src/index.ts"),
  "@control-plane/storage": fromRoot("./packages/storage/src/index.ts"),
  "@control-plane/adapter-claude-code": fromRoot("./packages/adapter-claude-code/src/index.ts"),
  "@control-plane/logger": fromRoot("./packages/logger/src/index.ts"),
  "@control-plane/mcp-server": fromRoot("./packages/mcp-server/src/index.ts"),
  "@control-plane/cli": fromRoot("./packages/cli/src/index.ts"),
  "@control-plane/testing/fixtures/claude-code": fromRoot(
    "./packages/testing/fixtures/claude-code/index.ts"
  ),
  "@control-plane/testing/fixtures/core": fromRoot("./packages/testing/fixtures/core/index.ts"),
  // `server-only` throws when loaded outside a Next server context. Under
  // vitest we only need the import to resolve to a no-op so the server-
  // only guards in `apps/web/lib/*.ts` stay meaningful in production
  // builds without breaking unit tests.
  "server-only": fromRoot("./test/shims/server-only.ts"),
  // `@/*` — the Next.js path alias used throughout `apps/web`. Mirroring it
  // here lets vitest resolve the same imports that component files already
  // use, so pure helpers can be tested without extracting them back to lib/.
  "@": fromRoot("./apps/web"),
};

// Files that are always eligible for coverage reporting, regardless of which
// project's tests exercised them. Declared once and reused by the coverage
// config for consistent numerator/denominator across `vitest run --coverage`
// and `vitest run --config vitest.coverage.config.ts`.
export const coverageInclude = [
  "packages/*/src/**/*.{ts,tsx}",
  "apps/web/lib/**/*.{ts,tsx}",
  "apps/web/app/**/*.{ts,tsx}",
  "apps/web/components/**/*.{ts,tsx}",
];

export const coverageExclude = [
  "**/dist/**",
  "**/.next/**",
  "**/node_modules/**",
  "**/*.test.{ts,tsx}",
  "**/*.spec.{ts,tsx}",
  "**/*.d.ts",
  "**/*.config.{ts,js,mjs,cjs}",
  "packages/testing/**",
  "e2e/**",
  "test/shims/**",
  // Next.js server-rendered entry points have no meaningful unit-test surface;
  // they are integration-tested via Playwright.
  "apps/web/app/**/page.tsx",
  "apps/web/app/**/layout.tsx",
  "apps/web/app/**/loading.tsx",
  "apps/web/app/**/error.tsx",
  "apps/web/app/**/not-found.tsx",
];

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  resolve: {
    alias: sharedAlias,
  },
  test: {
    passWithNoTests: true,
    // Each workspace package gets its own project so coverage output and the
    // reporter both group results under a stable namespace. The existing
    // flat `include` globs are preserved verbatim across the projects so no
    // tests silently drop off when coverage is toggled on.
    projects: [
      {
        extends: true,
        resolve: { alias: sharedAlias },
        test: {
          name: "core",
          include: ["packages/core/src/**/*.test.ts"],
          passWithNoTests: true,
        },
      },
      {
        extends: true,
        resolve: { alias: sharedAlias },
        test: {
          name: "events",
          include: ["packages/events/src/**/*.test.ts"],
          passWithNoTests: true,
        },
      },
      {
        extends: true,
        resolve: { alias: sharedAlias },
        test: {
          name: "storage",
          include: ["packages/storage/src/**/*.test.ts"],
          passWithNoTests: true,
        },
      },
      {
        extends: true,
        resolve: { alias: sharedAlias },
        test: {
          name: "adapter-claude-code",
          include: ["packages/adapter-claude-code/src/**/*.test.ts"],
          passWithNoTests: true,
        },
      },
      {
        extends: true,
        resolve: { alias: sharedAlias },
        test: {
          name: "logger",
          include: ["packages/logger/src/**/*.test.ts"],
          passWithNoTests: true,
        },
      },
      {
        extends: true,
        resolve: { alias: sharedAlias },
        test: {
          name: "mcp-server",
          include: ["packages/mcp-server/src/**/*.test.ts"],
          passWithNoTests: true,
        },
      },
      {
        extends: true,
        resolve: { alias: sharedAlias },
        test: {
          name: "cli",
          include: ["packages/cli/src/**/*.test.ts"],
          passWithNoTests: true,
        },
      },
      {
        extends: true,
        resolve: { alias: sharedAlias },
        test: {
          name: "testing",
          include: ["packages/testing/src/**/*.test.ts"],
          passWithNoTests: true,
        },
      },
      {
        extends: true,
        resolve: { alias: sharedAlias },
        esbuild: { jsx: "automatic", jsxImportSource: "react" },
        test: {
          name: "web",
          include: [
            "apps/web/lib/**/*.test.ts",
            "apps/web/app/**/*.test.ts",
            "apps/web/app/**/*.test.tsx",
            "apps/web/components/**/*.test.tsx",
          ],
          passWithNoTests: true,
        },
      },
    ],
    coverage: {
      // `v8` is the zero-config provider shipped via `@vitest/coverage-v8`.
      // It matches Node's built-in coverage instrumentation and plays nicely
      // with the TS source that resolves through our aliases above.
      provider: "v8",
      enabled: false,
      all: true,
      clean: true,
      reporter: ["text", "lcov", "json-summary", "html"],
      reportsDirectory: fromRoot("./.coverage-reports"),
      include: coverageInclude,
      exclude: coverageExclude,
    },
  },
});
