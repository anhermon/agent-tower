/**
 * React 19 / @testing-library/react compatibility.
 *
 * The root-level vitest.config.ts sets `define: { "process.env.NODE_ENV":
 * JSON.stringify("test") }` so esbuild substitutes the string at pre-bundle
 * time.  This causes react/index.js to load the development CJS bundle (which
 * exports `act`) rather than the production bundle (which omits it), fixing
 * "TypeError: React.act is not a function" with React 19 + testing-library 16.
 *
 * No runtime patching is needed here; this file is kept as a placeholder so
 * the directory structure remains in place if callers reference it.
 */

export {};
