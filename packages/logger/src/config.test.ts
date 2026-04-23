import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveLoggerConfig } from "./config.js";

describe("resolveLoggerConfig — LOG_LEVEL parsing", () => {
  it("given_a_valid_log_level__when_resolving__then_it_is_used_verbatim", () => {
    const cfg = resolveLoggerConfig({ env: { LOG_LEVEL: "warn" }, isTTY: false, cwd: "/tmp" });
    expect(cfg.level).toBe("warn");
  });

  it("given_an_uppercase_log_level__when_resolving__then_it_is_normalized_to_lowercase", () => {
    const cfg = resolveLoggerConfig({ env: { LOG_LEVEL: "ERROR" }, isTTY: false, cwd: "/tmp" });
    expect(cfg.level).toBe("error");
  });

  it("given_an_unknown_log_level__when_resolving__then_it_falls_back_to_the_env_default", () => {
    // Non-production default is "debug".
    const nonProd = resolveLoggerConfig({
      env: { LOG_LEVEL: "loud" },
      isTTY: false,
      cwd: "/tmp",
    });
    expect(nonProd.level).toBe("debug");

    // Production default is "info".
    const prod = resolveLoggerConfig({
      env: { LOG_LEVEL: "loud", NODE_ENV: "production" },
      isTTY: false,
      cwd: "/tmp",
    });
    expect(prod.level).toBe("info");
  });
});

describe("resolveLoggerConfig — default level by NODE_ENV", () => {
  it("given_NODE_ENV_is_production__when_LOG_LEVEL_unset__then_default_is_info", () => {
    const cfg = resolveLoggerConfig({
      env: { NODE_ENV: "production" },
      isTTY: false,
      cwd: "/tmp",
    });
    expect(cfg.level).toBe("info");
  });

  it("given_NODE_ENV_is_not_production__when_LOG_LEVEL_unset__then_default_is_debug", () => {
    const cfg = resolveLoggerConfig({ env: {}, isTTY: false, cwd: "/tmp" });
    expect(cfg.level).toBe("debug");

    const devCfg = resolveLoggerConfig({
      env: { NODE_ENV: "development" },
      isTTY: false,
      cwd: "/tmp",
    });
    expect(devCfg.level).toBe("debug");
  });
});

describe("resolveLoggerConfig — LOG_PRETTY tristate", () => {
  it("given_LOG_PRETTY_is_1__when_resolving__then_pretty_is_true_regardless_of_isTTY", () => {
    const cfg = resolveLoggerConfig({ env: { LOG_PRETTY: "1" }, isTTY: false, cwd: "/tmp" });
    expect(cfg.pretty).toBe(true);
  });

  it("given_LOG_PRETTY_is_0__when_resolving__then_pretty_is_false_regardless_of_isTTY", () => {
    const cfg = resolveLoggerConfig({ env: { LOG_PRETTY: "0" }, isTTY: true, cwd: "/tmp" });
    expect(cfg.pretty).toBe(false);
  });

  it("given_LOG_PRETTY_is_auto__when_resolving__then_it_follows_isTTY", () => {
    const onTty = resolveLoggerConfig({
      env: { LOG_PRETTY: "auto" },
      isTTY: true,
      cwd: "/tmp",
    });
    expect(onTty.pretty).toBe(true);

    const offTty = resolveLoggerConfig({
      env: { LOG_PRETTY: "auto" },
      isTTY: false,
      cwd: "/tmp",
    });
    expect(offTty.pretty).toBe(false);
  });

  it("given_LOG_PRETTY_is_unset__when_resolving__then_it_follows_isTTY", () => {
    const onTty = resolveLoggerConfig({ env: {}, isTTY: true, cwd: "/tmp" });
    expect(onTty.pretty).toBe(true);

    const offTty = resolveLoggerConfig({ env: {}, isTTY: false, cwd: "/tmp" });
    expect(offTty.pretty).toBe(false);
  });
});

describe("resolveLoggerConfig — LOG_FILES defaults and overrides", () => {
  it("given_NODE_ENV_is_not_production__when_LOG_FILES_unset__then_writeFiles_is_true", () => {
    const cfg = resolveLoggerConfig({ env: {}, isTTY: false, cwd: "/tmp" });
    expect(cfg.writeFiles).toBe(true);
  });

  it("given_NODE_ENV_is_production__when_LOG_FILES_unset__then_writeFiles_is_false", () => {
    const cfg = resolveLoggerConfig({
      env: { NODE_ENV: "production" },
      isTTY: false,
      cwd: "/tmp",
    });
    expect(cfg.writeFiles).toBe(false);
  });

  it("given_LOG_FILES_is_1__when_resolving__then_writeFiles_is_true_even_in_production", () => {
    const cfg = resolveLoggerConfig({
      env: { NODE_ENV: "production", LOG_FILES: "1" },
      isTTY: false,
      cwd: "/tmp",
    });
    expect(cfg.writeFiles).toBe(true);
  });

  it("given_LOG_FILES_is_0__when_resolving__then_writeFiles_is_false_even_in_development", () => {
    const cfg = resolveLoggerConfig({
      env: { LOG_FILES: "0" },
      isTTY: false,
      cwd: "/tmp",
    });
    expect(cfg.writeFiles).toBe(false);
  });
});

describe("resolveLoggerConfig — LOG_REQUESTS default and override", () => {
  it("given_LOG_REQUESTS_unset__when_resolving__then_writeRequests_is_true", () => {
    const cfg = resolveLoggerConfig({ env: {}, isTTY: false, cwd: "/tmp" });
    expect(cfg.writeRequests).toBe(true);
  });

  it("given_LOG_REQUESTS_is_0__when_resolving__then_writeRequests_is_false", () => {
    const cfg = resolveLoggerConfig({
      env: { LOG_REQUESTS: "0" },
      isTTY: false,
      cwd: "/tmp",
    });
    expect(cfg.writeRequests).toBe(false);
  });
});

describe("resolveLoggerConfig — LOG_DIR resolution", () => {
  it("given_LOG_DIR_unset__when_resolving__then_logDir_is_cwd_slash_logs", () => {
    const cfg = resolveLoggerConfig({ env: {}, isTTY: false, cwd: "/workspace/app" });
    expect(cfg.logDir).toBe(path.join("/workspace/app", "logs"));
  });

  it("given_LOG_DIR_is_relative__when_resolving__then_it_is_joined_with_cwd", () => {
    const cfg = resolveLoggerConfig({
      env: { LOG_DIR: "var/log" },
      isTTY: false,
      cwd: "/workspace/app",
    });
    expect(cfg.logDir).toBe(path.join("/workspace/app", "var/log"));
  });

  it("given_LOG_DIR_is_absolute__when_resolving__then_it_is_preserved", () => {
    const cfg = resolveLoggerConfig({
      env: { LOG_DIR: "/var/log/myapp" },
      isTTY: false,
      cwd: "/workspace/app",
    });
    expect(cfg.logDir).toBe("/var/log/myapp");
  });
});

describe("resolveLoggerConfig — LOG_SERVICE resolution", () => {
  it("given_LOG_SERVICE_set__when_resolving__then_env_value_wins", () => {
    const cfg = resolveLoggerConfig({
      env: { LOG_SERVICE: "@control-plane/from-env" },
      isTTY: false,
      cwd: "/tmp",
      defaultService: "@control-plane/arg-value",
    });
    expect(cfg.service).toBe("@control-plane/from-env");
  });

  it("given_LOG_SERVICE_unset__when_defaultService_arg_provided__then_arg_wins", () => {
    const cfg = resolveLoggerConfig({
      env: {},
      isTTY: false,
      cwd: "/tmp",
      defaultService: "@control-plane/web",
    });
    expect(cfg.service).toBe("@control-plane/web");
  });

  it("given_LOG_SERVICE_unset_and_no_defaultService_arg__when_resolving__then_falls_back_to_unknown", () => {
    const cfg = resolveLoggerConfig({ env: {}, isTTY: false, cwd: "/tmp" });
    expect(cfg.service).toBe("@control-plane/unknown");
  });
});
