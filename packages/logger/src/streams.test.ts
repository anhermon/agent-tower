import { PassThrough } from "node:stream";

import { describe, expect, it } from "vitest";

import { createFanoutWriter, STDERR_LEVEL_FLOOR } from "./streams.js";

/**
 * Collect everything written to a PassThrough sink as a single utf8 string.
 * The fanout writes one chunk per line, so concatenating is sufficient.
 */
function makeSink(): { stream: PassThrough; read: () => string } {
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on("data", (chunk: Buffer) => {
    chunks.push(chunk);
  });
  return {
    stream,
    read: () => Buffer.concat(chunks).toString("utf8"),
  };
}

function writeLine(fanout: ReturnType<typeof createFanoutWriter>, payload: string): Promise<void> {
  return new Promise((resolve, reject) => {
    fanout.write(Buffer.from(payload, "utf8"), (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

describe("STDERR_LEVEL_FLOOR", () => {
  it("given_the_exported_constant__when_inspected__then_it_equals_pino_warn_level_40", () => {
    expect(STDERR_LEVEL_FLOOR).toBe(40);
  });
});

describe("createFanoutWriter — routing by level and component", () => {
  it("given_info_level_app_component__when_writing__then_routed_to_stdout", async () => {
    const stdout = makeSink();
    const stderr = makeSink();
    const requests = makeSink();
    const fanout = createFanoutWriter({
      stdoutStream: stdout.stream,
      stderrStream: stderr.stream,
      requestsStream: requests.stream,
    });
    await writeLine(fanout, `${JSON.stringify({ level: 30, component: "app", msg: "hi" })}\n`);
    expect(stdout.read()).toContain('"msg":"hi"');
    expect(stderr.read()).toBe("");
    expect(requests.read()).toBe("");
  });

  it("given_warn_level__when_writing__then_routed_to_stderr", async () => {
    const stdout = makeSink();
    const stderr = makeSink();
    const requests = makeSink();
    const fanout = createFanoutWriter({
      stdoutStream: stdout.stream,
      stderrStream: stderr.stream,
      requestsStream: requests.stream,
    });
    await writeLine(fanout, `${JSON.stringify({ level: 40, component: "app", msg: "warn" })}\n`);
    expect(stderr.read()).toContain('"msg":"warn"');
    expect(stdout.read()).toBe("");
    expect(requests.read()).toBe("");
  });

  it("given_error_level__when_writing__then_routed_to_stderr", async () => {
    const stdout = makeSink();
    const stderr = makeSink();
    const requests = makeSink();
    const fanout = createFanoutWriter({
      stdoutStream: stdout.stream,
      stderrStream: stderr.stream,
      requestsStream: requests.stream,
    });
    await writeLine(fanout, `${JSON.stringify({ level: 50, component: "app", msg: "err" })}\n`);
    expect(stderr.read()).toContain('"msg":"err"');
    expect(stdout.read()).toBe("");
    expect(requests.read()).toBe("");
  });

  it("given_request_component_at_info_level__when_writing__then_routed_to_requests", async () => {
    const stdout = makeSink();
    const stderr = makeSink();
    const requests = makeSink();
    const fanout = createFanoutWriter({
      stdoutStream: stdout.stream,
      stderrStream: stderr.stream,
      requestsStream: requests.stream,
    });
    await writeLine(
      fanout,
      `${JSON.stringify({ level: 30, component: "request", method: "GET" })}\n`
    );
    expect(requests.read()).toContain('"method":"GET"');
    expect(stdout.read()).toBe("");
    expect(stderr.read()).toBe("");
  });

  it("given_request_component_at_error_level__when_writing__then_component_wins_over_level", async () => {
    const stdout = makeSink();
    const stderr = makeSink();
    const requests = makeSink();
    const fanout = createFanoutWriter({
      stdoutStream: stdout.stream,
      stderrStream: stderr.stream,
      requestsStream: requests.stream,
    });
    await writeLine(
      fanout,
      `${JSON.stringify({ level: 50, component: "request", method: "GET" })}\n`
    );
    expect(requests.read()).toContain('"method":"GET"');
    expect(stderr.read()).toBe("");
    expect(stdout.read()).toBe("");
  });

  it("given_requestsStream_is_null_with_request_component__when_writing__then_falls_back_to_stdout", async () => {
    const stdout = makeSink();
    const stderr = makeSink();
    const fanout = createFanoutWriter({
      stdoutStream: stdout.stream,
      stderrStream: stderr.stream,
      requestsStream: null,
    });
    await writeLine(
      fanout,
      `${JSON.stringify({ level: 30, component: "request", method: "GET" })}\n`
    );
    expect(stdout.read()).toContain('"method":"GET"');
    expect(stderr.read()).toBe("");
  });

  it("given_malformed_json_input__when_writing__then_falls_back_to_stdout_without_crashing", async () => {
    const stdout = makeSink();
    const stderr = makeSink();
    const requests = makeSink();
    const fanout = createFanoutWriter({
      stdoutStream: stdout.stream,
      stderrStream: stderr.stream,
      requestsStream: requests.stream,
    });
    await writeLine(fanout, "this is not json\n");
    expect(stdout.read()).toBe("this is not json\n");
    expect(stderr.read()).toBe("");
    expect(requests.read()).toBe("");
  });
});
