import { describe, expect, it } from "vitest";
import { evaluateFilter, FilterSyntaxError } from "./filter-evaluator";

describe("evaluateFilter", () => {
  it("evaluates simple equality comparison to true", () => {
    const result = evaluateFilter("payload.conclusion == 'failure'", {
      payload: { conclusion: "failure" },
    });
    expect(result).toBe(true);
  });

  it("evaluates simple equality comparison to false", () => {
    const result = evaluateFilter("payload.conclusion == 'failure'", {
      payload: { conclusion: "success" },
    });
    expect(result).toBe(false);
  });

  it("evaluates logical AND with dot notation", () => {
    const result = evaluateFilter(
      "payload.pull_request.draft == false && payload.action == 'opened'",
      {
        payload: {
          pull_request: { draft: false },
          action: "opened",
        },
      }
    );
    expect(result).toBe(true);
  });

  it("evaluates logical AND to false when one side is false", () => {
    const result = evaluateFilter(
      "payload.pull_request.draft == false && payload.action == 'opened'",
      {
        payload: {
          pull_request: { draft: true },
          action: "opened",
        },
      }
    );
    expect(result).toBe(false);
  });

  it("returns false for missing property", () => {
    const result = evaluateFilter("payload.missing == 'value'", {
      payload: {},
    });
    expect(result).toBe(false);
  });

  it("throws FilterSyntaxError for syntax error", () => {
    expect(() => evaluateFilter("payload.conclusion ==", {})).toThrow(FilterSyntaxError);
  });

  it("throws FilterSyntaxError for unsupported operators", () => {
    expect(() => evaluateFilter("payload.conclusion + 'x'", {})).toThrow(FilterSyntaxError);
  });

  it("throws FilterSyntaxError for function calls", () => {
    expect(() => evaluateFilter("fn() == true", {})).toThrow(FilterSyntaxError);
  });

  it("throws FilterSyntaxError for array indexing", () => {
    expect(() => evaluateFilter("payload[0] == true", {})).toThrow(FilterSyntaxError);
  });

  it("supports inequality operator", () => {
    const result = evaluateFilter("payload.status != 'pending'", {
      payload: { status: "completed" },
    });
    expect(result).toBe(true);
  });

  it("supports greater-than operator", () => {
    const result = evaluateFilter("payload.count > 5", {
      payload: { count: 10 },
    });
    expect(result).toBe(true);
  });

  it("supports less-than operator", () => {
    const result = evaluateFilter("payload.count < 5", {
      payload: { count: 3 },
    });
    expect(result).toBe(true);
  });

  it("supports greater-than-or-equal operator", () => {
    const result = evaluateFilter("payload.count >= 5", {
      payload: { count: 5 },
    });
    expect(result).toBe(true);
  });

  it("supports less-than-or-equal operator", () => {
    const result = evaluateFilter("payload.count <= 5", {
      payload: { count: 5 },
    });
    expect(result).toBe(true);
  });

  it("supports logical OR", () => {
    const result = evaluateFilter("payload.action == 'opened' || payload.action == 'synchronize'", {
      payload: { action: "synchronize" },
    });
    expect(result).toBe(true);
  });

  it("supports boolean literals", () => {
    const result = evaluateFilter("payload.draft == false", {
      payload: { draft: false },
    });
    expect(result).toBe(true);
  });

  it("supports number literals", () => {
    const result = evaluateFilter("payload.count == 42", {
      payload: { count: 42 },
    });
    expect(result).toBe(true);
  });

  it("supports double-quoted strings", () => {
    const result = evaluateFilter('payload.status == "active"', {
      payload: { status: "active" },
    });
    expect(result).toBe(true);
  });
});
