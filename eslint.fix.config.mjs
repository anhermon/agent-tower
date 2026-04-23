// @ts-check
/**
 * Lightweight ESLint fix-only config — no TypeScript projectService.
 *
 * Use this for fast auto-fix of purely syntactic rules:
 *   pnpm eslint --config eslint.fix.config.mjs --fix .
 *
 * Covered rules (no type info needed):
 *   import/order, import/no-duplicates, import/first, import/newline-after-import
 *   @typescript-eslint/array-type, @typescript-eslint/consistent-type-definitions
 *
 * This does NOT replace the full lint. Run `task lint` for the complete
 * type-aware check (projectService, no-unsafe-*, complexity, etc.).
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import importPlugin from "eslint-plugin-import";
import globals from "globals";
import tseslint from "typescript-eslint";

// tseslint.plugin gives the raw plugin object without any rules config.
const tsPlugin = tseslint.plugin;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default tseslint.config(
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
      "**/.claude/**",
      "**/*.tsbuildinfo",
      "**/playwright-report/**",
      "**/test-results/**",
      "packages/testing/fixtures/**",
      "apps/web/next-env.d.ts",
    ],
  },
  {
    files: ["**/*.{ts,tsx,mjs,cjs}"],
    languageOptions: {
      parser: tseslint.parser,
      ecmaVersion: 2024,
      sourceType: "module",
      parserOptions: {
        // No projectService — purely syntactic parsing, ~2 min instead of ~40 min.
        projectService: false,
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.es2024,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      import: importPlugin,
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
      // --- Import group ordering (matches main eslint.config.mjs exactly) -----
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
      "import/first": "error",
      "import/newline-after-import": "error",

      // --- Purely syntactic TS style rules -----------------------------------
      "@typescript-eslint/array-type": ["error", { default: "array" }],
      "@typescript-eslint/consistent-type-definitions": ["error", "interface"],
    },
  }
);
