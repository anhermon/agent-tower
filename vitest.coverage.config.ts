import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig, { coverageExclude, coverageInclude } from "./vitest.config";

// Coverage-enforcing config for CI. `task ci:fast` runs:
//   pnpm vitest run --config vitest.coverage.config.ts
//
// We inherit everything from the base config (projects, aliases, include,
// reporter set, output directory) and only flip coverage on + layer on the
// threshold policy. The threshold object uses the Vitest v3 patterned-
// threshold API:
//   thresholds: Thresholds | ({ [glob]: Pick<Thresholds, "lines"|...> } & Thresholds)
// i.e. global keys live at the top and per-glob buckets are sibling entries
// whose values are Thresholds *without* `perFile` / `autoUpdate`. The glob
// buckets short-circuit the global numbers for files they match, so we lift
// the bar for the pure-logic packages that should have near-total coverage.

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      coverage: {
        provider: "v8",
        enabled: true,
        all: true,
        clean: true,
        reporter: ["text", "lcov", "json-summary", "html"],
        reportsDirectory: "./.coverage-reports",
        include: coverageInclude,
        exclude: coverageExclude,
        thresholds: {
          // Global floor — applies to any file not matched by a pattern below.
          perFile: false,
          lines: 60,
          functions: 60,
          branches: 55,
          statements: 60,

          // Pure-logic packages — strictest bar.
          "packages/core/src/**": {
            lines: 80,
            functions: 80,
            branches: 70,
            statements: 80,
          },
          "packages/events/src/**": {
            lines: 80,
            functions: 80,
            branches: 70,
            statements: 80,
          },
          "packages/storage/src/**": {
            lines: 75,
            functions: 75,
            branches: 65,
            statements: 75,
          },

          // Adapter packages — still pure TS but exercise real I/O shapes.
          "packages/adapter-claude-code/src/**": {
            lines: 70,
            functions: 70,
            branches: 60,
            statements: 70,
          },

          // Web app server-side helpers. UI components and route files are
          // still subject to the global floor.
          "apps/web/lib/**": {
            lines: 65,
            functions: 65,
            branches: 55,
            statements: 65,
          },
        },
      },
    },
  })
);
