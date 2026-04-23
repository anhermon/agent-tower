// @ts-check
/**
 * ESLint 9 flat config for the Modular Agents Control Plane.
 *
 * Biome owns formatting + basic lint. ESLint is the deep semantic layer:
 * TypeScript type-aware rules, React/React-hooks, a11y, import order,
 * cognitive complexity (sonarjs), and Next.js App Router rules.
 *
 * Formatter-overlapping rules (indent/quotes/semi/comma-dangle/...) are OFF.
 * Biome's import sort does NOT enforce group ordering, so we keep `import/order`.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import importPlugin from "eslint-plugin-import";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import sonarjs from "eslint-plugin-sonarjs";
import globals from "globals";
import tseslint from "typescript-eslint";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default tseslint.config(
  // ------------------------------------------------------------------
  // Global ignores (top-level `ignores` object — must be the only key).
  // ------------------------------------------------------------------
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/build/**",
      "**/coverage/**",
      "**/.coverage-reports/**",
      "**/.lighthouseci/**",
      "**/.ci/**",
      "**/*.tsbuildinfo",
      "**/playwright-report/**",
      "**/test-results/**",
      // Session JSONL fixtures — data, not source code.
      "packages/testing/fixtures/**",
    ],
  },

  // ------------------------------------------------------------------
  // Base JS + TS recommended (type-aware).
  // ------------------------------------------------------------------
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // ------------------------------------------------------------------
  // Shared language options + plugin wiring for all lintable files.
  // ------------------------------------------------------------------
  {
    files: ["**/*.{ts,tsx,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      parserOptions: {
        // `projectService` is faster and more memory-efficient than
        // `project: true` on large pnpm monorepos (TS >=5.3).
        projectService: true,
        tsconfigRootDir: __dirname,
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.es2024,
      },
    },
    plugins: {
      import: importPlugin,
      sonarjs,
    },
    settings: {
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: ["./tsconfig.json", "./apps/*/tsconfig.json", "./packages/*/tsconfig.json"],
        },
        node: true,
      },
      "import/internal-regex": "^@control-plane/",
    },
    rules: {
      // --- Unused vars: allow underscore escape hatch -----------------
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],

      // --- Type imports (downgraded below to warn for the baseline)

      // --- Import hygiene & order ------------------------------------
      "import/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
            "object",
            "type",
          ],
          pathGroups: [
            {
              pattern: "@control-plane/**",
              group: "internal",
              position: "before",
            },
          ],
          pathGroupsExcludedImportTypes: ["builtin"],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      "import/no-duplicates": ["error", { "prefer-inline": true }],
      "import/no-self-import": "error",
      "import/no-cycle": ["error", { maxDepth: 5, ignoreExternal: true }],
      "import/first": "error",
      "import/newline-after-import": "error",

      // --- SonarJS: cognitive/cyclomatic complexity ------------------
      // `cognitive-complexity`, `no-duplicate-string`, `no-identical-functions`,
      // and `no-collapsible-if` are downgraded below for the baseline.
      "sonarjs/no-redundant-boolean": "error",
      "sonarjs/no-useless-catch": "error",

      // Core ESLint cyclomatic complexity (sonarjs doesn't ship one).
      complexity: ["warn", 10],

      // --- Type-aware strictness: demoted to warnings ----------------
      // These rules fire heavily on untyped boundaries (JSONL parsing,
      // MCP tool inputs, dynamic skill/adapter inputs). They are useful
      // signal but not a ship-blocker gate — flipping them to `warn`
      // keeps the feedback visible without failing `task ci:fast` on
      // pre-existing code. Tighten per-package once types are added.
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/require-await": "warn",
      "@typescript-eslint/prefer-nullish-coalescing": "warn",
      "@typescript-eslint/no-redundant-type-constituents": "warn",
      "@typescript-eslint/no-unnecessary-type-assertion": "warn",
      "@typescript-eslint/restrict-template-expressions": "warn",
      "@typescript-eslint/no-base-to-string": "warn",
      "@typescript-eslint/only-throw-error": "warn",
      "@typescript-eslint/no-floating-promises": "warn",
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      "@typescript-eslint/consistent-type-exports": "warn",
      "@typescript-eslint/restrict-plus-operands": "warn",
      "@typescript-eslint/no-empty-function": "warn",
      "@typescript-eslint/triple-slash-reference": "warn",
      "no-throw-literal": "warn",
      "sonarjs/no-duplicate-string": ["warn", { threshold: 5 }],
      "sonarjs/no-identical-functions": "warn",
      "sonarjs/no-collapsible-if": "warn",
      "sonarjs/cognitive-complexity": ["warn", 15],

      // --- Formatter-overlapping rules: OFF (Biome owns these) -------
      indent: "off",
      quotes: "off",
      semi: "off",
      "comma-dangle": "off",
      "max-len": "off",
      "no-mixed-spaces-and-tabs": "off",
      "eol-last": "off",
      "no-trailing-spaces": "off",
      "@typescript-eslint/indent": "off",
      "@typescript-eslint/quotes": "off",
      "@typescript-eslint/semi": "off",
      "@typescript-eslint/comma-dangle": "off",

      // --- Misc TS tuning --------------------------------------------
      // Async components / event handlers in React legitimately return promises.
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
    },
  },

  // ------------------------------------------------------------------
  // React + React Hooks + a11y — apply to any TSX across the repo.
  // React 19: no `React` in scope required.
  // ------------------------------------------------------------------
  {
    files: ["**/*.{tsx,jsx}"],
    ...reactPlugin.configs.flat.recommended,
  },
  {
    files: ["**/*.{tsx,jsx}"],
    ...reactPlugin.configs.flat["jsx-runtime"],
  },
  {
    files: ["**/*.{tsx,jsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
    },
    settings: {
      react: { version: "19.0" },
    },
    rules: {
      // React 19 / new JSX transform.
      "react/react-in-jsx-scope": "off",
      "react/jsx-uses-react": "off",
      "react/prop-types": "off",

      // Hooks — non-negotiable.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",

      // a11y recommended set — downgraded to warn for the baseline so
      // existing violations surface as signal without failing the gate.
      // Tighten per-component as the design system is revisited.
      ...Object.fromEntries(
        Object.entries(jsxA11y.flatConfigs.recommended.rules).map(([name, config]) => [
          name,
          Array.isArray(config) ? ["warn", ...config.slice(1)] : "warn",
        ])
      ),
    },
  },

  // ------------------------------------------------------------------
  // Next.js — only the dashboard app.
  // Rules come straight from @next/eslint-plugin-next (flat config).
  // The legacy `next/core-web-vitals` preset requires `eslint-config-next`
  // which we intentionally don't install — the plugin rules below cover it.
  // ------------------------------------------------------------------
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "@next/next": nextPlugin },
    rules: {
      ...Object.fromEntries(
        Object.entries({
          ...nextPlugin.configs.recommended.rules,
          ...nextPlugin.configs["core-web-vitals"].rules,
        }).map(([name, config]) => [
          name,
          Array.isArray(config) ? ["warn", ...config.slice(1)] : "warn",
        ])
      ),
    },
  },

  // ------------------------------------------------------------------
  // Tests: relax the strictest structural rules — fixtures and
  // arrange/act/assert blocks legitimately repeat strings and are long.
  // ------------------------------------------------------------------
  {
    files: [
      "**/*.test.{ts,tsx}",
      "**/*.spec.{ts,tsx}",
      "e2e/**/*.{ts,tsx}",
      "**/__tests__/**/*.{ts,tsx}",
    ],
    rules: {
      "sonarjs/no-duplicate-string": "off",
      "sonarjs/no-identical-functions": "off",
      "sonarjs/cognitive-complexity": ["error", 25],
      complexity: ["error", 20],
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },

  // ------------------------------------------------------------------
  // Config files + build/test glue (this file, vitest.config,
  // playwright.config, scripts/**, test/shims/**, etc.) — these live
  // outside the TS project graph so type-aware linting must be off,
  // otherwise the project-service parser emits "was not found by the
  // project service" errors for every file.
  // ------------------------------------------------------------------
  {
    files: [
      "**/*.config.{ts,mts,cts,mjs,cjs,js}",
      "eslint.config.mjs",
      "scripts/**/*.{ts,mts,cts,mjs,cjs,js}",
      "test/**/*.{ts,mts,cts,mjs,cjs,js}",
      // Tests: package tsconfigs exclude `**/*.test.ts` so the
      // type-aware parser has no project for them. Lint without
      // type info rather than bolt on a shared tsconfig.
      "**/*.test.{ts,tsx}",
      "**/*.spec.{ts,tsx}",
      "**/test-helpers.{ts,tsx}",
      "e2e/**/*.{ts,tsx}",
    ],
    languageOptions: {
      parserOptions: { projectService: false, project: null },
    },
    ...tseslint.configs.disableTypeChecked,
  }
);
