// No-op shim for `server-only` used only during vitest runs. The real
// package throws if imported into a Client Component bundle — which is the
// point of the `import "server-only"` guard in production code. Unit tests
// run outside that bundler, so we alias it to an empty module here (see
// `vitest.config.ts`).
export {};
