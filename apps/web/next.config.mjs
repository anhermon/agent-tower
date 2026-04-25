/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Lint is enforced by `task lint` (flat-config ESLint). Skipping here
  // avoids a second round-trip through Next's bundled ESLint runner, which
  // also sidesteps the Next-15 "Cannot find module './*.js'" webpack
  // chunk-map corruption that fires when Next's lint step exits non-zero
  // mid-build.
  eslint: { ignoreDuringBuilds: true },
  // Honor NEXT_DIST_DIR so the isolated test server (Taskfile
  // test-server:up) can build into `.next.perf/` without clobbering the
  // dev server's `.next/` and vice-versa.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Keep Node-only logging deps out of the webpack bundle graph.
  // `@control-plane/logger` (imported from instrumentation.ts) pulls in
  // `pino` + `pino-pretty` whose transitive deps (pino-abstract-transport,
  // thread-stream, etc.) use Node built-ins like `stream` and
  // `worker_threads`. Bundling them breaks the instrumentation compile,
  // which cascades to a missing routes-manifest.json and 500s on every
  // request. Marking them external is the supported Next.js 15 path.
  serverExternalPackages: [
    "pino",
    "pino-pretty",
    "pino-abstract-transport",
    "thread-stream",
    "sonic-boom",
    "split2",
    "@control-plane/logger",
    "bullmq",
    "ioredis",
  ],
  // `serverExternalPackages` covers route handlers and pages, but the
  // dedicated `instrumentation` webpack entry doesn't honor it. Mark the
  // Node-only logging deps as externals for every server-side bundle so
  // pino, pino-pretty and their transitive Node built-ins stay out of
  // webpack's graph. Node 22+ supports `require()` of ESM packages,
  // which is why `@control-plane/logger` (ESM-only) can also be
  // externalized — see its package.json `exports.require` condition.
  webpack: (config, { isServer }) => {
    if (isServer) {
      const externals = Array.isArray(config.externals) ? config.externals : [];
      config.externals = [
        ...externals,
        "@control-plane/logger",
        "pino",
        "pino-pretty",
        "pino-abstract-transport",
        "thread-stream",
        "sonic-boom",
        "split2",
        "bullmq",
        "ioredis",
      ];
    }
    return config;
  },
};

export default nextConfig;
