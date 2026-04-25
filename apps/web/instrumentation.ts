/**
 * Next.js 15 `register()` hook — invoked exactly once on server boot, before
 * the first request hits a route handler. We use it to bootstrap the shared
 * logger for `@control-plane/web` so every subsequent `getLogger(component)`
 * call across the app picks up the same root binding + fanout streams.
 *
 * The logger is imported dynamically to keep it out of the edge-runtime
 * bundler graph — `@control-plane/logger` is a Node-only package (pino +
 * node:fs).
 */
export async function register(): Promise<void> {
  const { initLogger, getLogger } = await import(/* webpackIgnore: true */ "@control-plane/logger");
  initLogger({ defaultService: "@control-plane/web" });
  const log = getLogger("web");
  log.info({ nodeEnv: process.env.NODE_ENV, pid: process.pid }, "web.boot");

  const { startWorkflowEngine } = await import("./lib/workflow-bootstrap");
  startWorkflowEngine();
  log.info("workflow.engine.started");
}
