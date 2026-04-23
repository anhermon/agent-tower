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
          // Baseline set at actual measured coverage (2026-04-24): page/component
          // files in apps/web/app and apps/web/components are 0% covered by unit
          // tests (they are tested via E2E); raise these as unit coverage grows.
          perFile: false,
          lines: 35,
          functions: 60,
          branches: 55,
          statements: 35,

          // Pure-logic packages — strictest bar.
          "packages/core/src/**": {
            lines: 80,
            functions: 80,
            branches: 70,
            statements: 80,
          },
          // Baseline set at 2026-04-24 actual: 46% lines/stmts/fns, 50% branches.
          "packages/events/src/**": {
            lines: 42,
            functions: 42,
            branches: 45,
            statements: 42,
          },
          // Baseline set at 2026-04-24 actual: 80% lines/stmts, 86% branches, 40% fns.
          "packages/storage/src/**": {
            lines: 75,
            functions: 35,
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
