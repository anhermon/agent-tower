import { describe, expect, it } from "vitest";
import { runCli } from "./cli.js";
import { captureOutput } from "./test-helpers.js";

describe("runCli global-flag handling", () => {
  it("given_pretty_flag_before_subcommand__when_dispatching__then_it_reaches_health_without_usage_error", async () => {
    const { exitCode, stdout } = await captureOutput(() => runCli(["--pretty", "health"]));
    expect(exitCode).toBe(0);
    // Pretty output is not valid JSON — that's the whole point of the flag.
    expect(() => JSON.parse(stdout)).toThrow();
    expect(stdout.toLowerCase()).toMatch(/data root|sessions|skills/);
  });

  it("given_json_flag_before_subcommand__when_dispatching__then_health_emits_json", async () => {
    const { exitCode, stdout } = await captureOutput(() => runCli(["--json", "health"]));
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toHaveProperty("ok");
  });

  it("given_help_short_flag__when_dispatching__then_runs_help", async () => {
    const { exitCode, stdout } = await captureOutput(() => runCli(["-h"]));
    expect(exitCode).toBe(0);
    expect(stdout).toContain("cp");
  });

  it("given_no_args__when_dispatching__then_runs_help", async () => {
    const { exitCode, stdout } = await captureOutput(() => runCli([]));
    expect(exitCode).toBe(0);
    expect(stdout).toContain("cp");
  });

  it("given_unknown_command__when_dispatching__then_exits_with_usage_code", async () => {
    const { exitCode, stderr } = await captureOutput(() => runCli(["bogus"]));
    expect(exitCode).toBe(2);
    expect(stderr.toLowerCase()).toContain("unknown command");
  });
});
