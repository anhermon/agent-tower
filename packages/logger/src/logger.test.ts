import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getLogger, initLogger, resetLoggerForTests } from "./logger.js";

/**
 * These tests exercise the real pino pipeline:
 *   initLogger → buildStreams (writeFiles=on) → fanout writer → log files.
 *
 * We point LOG_DIR at a mkdtempSync directory, force pretty off and files on,
 * and then synchronously read the resulting JSON lines. Pino streams flush on
 * each write; a single setImmediate tick after the call has been sufficient in
 * practice to let the fanout drain into the file.
 */

let tmp: string;
let savedEnv: {
  LOG_DIR: string | undefined;
  LOG_FILES: string | undefined;
  LOG_PRETTY: string | undefined;
  LOG_REQUESTS: string | undefined;
  LOG_LEVEL: string | undefined;
  LOG_SERVICE: string | undefined;
  NODE_ENV: string | undefined;
};

/** Wait for pino + fs.WriteStream to flush the just-written line. */
async function waitForFlush(filePath: string, match: string, maxTicks = 20): Promise<string> {
  for (let i = 0; i < maxTicks; i++) {
    await new Promise((resolve) => setImmediate(resolve));
    try {
      const contents = readFileSync(filePath, "utf8");
      if (contents.includes(match)) return contents;
    } catch {
      // File may not exist yet on the very first tick — keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  // Final read, even if it's empty — lets expect() produce a useful diff.
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "cp-logger-test-"));
  savedEnv = {
    LOG_DIR: process.env.LOG_DIR,
    LOG_FILES: process.env.LOG_FILES,
    LOG_PRETTY: process.env.LOG_PRETTY,
    LOG_REQUESTS: process.env.LOG_REQUESTS,
    LOG_LEVEL: process.env.LOG_LEVEL,
    LOG_SERVICE: process.env.LOG_SERVICE,
    NODE_ENV: process.env.NODE_ENV,
  };
  process.env.LOG_DIR = tmp;
  process.env.LOG_FILES = "1";
  process.env.LOG_PRETTY = "0";
  process.env.LOG_REQUESTS = "1";
  process.env.LOG_LEVEL = "debug";
  delete process.env.LOG_SERVICE;
  resetLoggerForTests();
});

afterEach(() => {
  resetLoggerForTests();
  for (const [key, value] of Object.entries(savedEnv) as Array<
    [keyof typeof savedEnv, string | undefined]
  >) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(tmp, { recursive: true, force: true });
});

describe("initLogger + getLogger — file fanout", () => {
  it("given_a_web_component_at_info__when_logging__then_stdout_log_contains_component_and_service", async () => {
    initLogger({ defaultService: "test-svc" });
    const log = getLogger("web");
    log.info({ x: 1 }, "hello");

    const stdoutPath = path.join(tmp, "stdout.log");
    const contents = await waitForFlush(stdoutPath, '"msg":"hello"');
    expect(contents).toContain('"component":"web"');
    expect(contents).toContain('"service":"test-svc"');
    expect(contents).toContain('"x":1');
    expect(contents).toContain('"msg":"hello"');
  });

  it("given_an_error_level_call__when_logging__then_it_lands_in_stderr_log_not_stdout_log", async () => {
    initLogger({ defaultService: "test-svc" });
    const log = getLogger("web");
    log.error({ code: "boom" }, "exploded");

    const stderrPath = path.join(tmp, "stderr.log");
    const stderrContents = await waitForFlush(stderrPath, '"msg":"exploded"');
    expect(stderrContents).toContain('"msg":"exploded"');
    expect(stderrContents).toContain('"component":"web"');
    expect(stderrContents).toContain('"service":"test-svc"');

    const stdoutPath = path.join(tmp, "stdout.log");
    let stdoutContents = "";
    try {
      stdoutContents = readFileSync(stdoutPath, "utf8");
    } catch {
      // stdout.log may not have been created if nothing was routed to it.
    }
    expect(stdoutContents).not.toContain('"msg":"exploded"');
  });

  it("given_a_request_component__when_logging__then_line_lands_in_requests_log", async () => {
    initLogger({ defaultService: "test-svc" });
    const log = getLogger("request");
    log.info({ method: "GET" }, "audit");

    const requestsPath = path.join(tmp, "requests.log");
    const contents = await waitForFlush(requestsPath, '"msg":"audit"');
    expect(contents).toContain('"component":"request"');
    expect(contents).toContain('"method":"GET"');
    expect(contents).toContain('"service":"test-svc"');

    const stdoutPath = path.join(tmp, "stdout.log");
    let stdoutContents = "";
    try {
      stdoutContents = readFileSync(stdoutPath, "utf8");
    } catch {
      // stdout.log may not have been created.
    }
    expect(stdoutContents).not.toContain('"msg":"audit"');
  });
});
