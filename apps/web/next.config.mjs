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
};

export default nextConfig;
