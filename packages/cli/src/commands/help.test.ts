import { describe, expect, it } from "vitest";
import { captureOutput } from "../test-helpers.js";
import { COMMANDS, runHelp } from "./help.js";

describe("runHelp", () => {
  it("given_help_invocation__when_running__then_lists_every_command", async () => {
    const { exitCode, stdout } = await captureOutput(() => runHelp());
    expect(exitCode).toBe(0);
    for (const cmd of COMMANDS) {
      expect(stdout).toContain(cmd.name);
    }
  });
});
