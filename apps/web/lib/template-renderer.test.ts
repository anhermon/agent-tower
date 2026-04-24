import { describe, expect, it } from "vitest";

import { renderTemplate, TemplateSyntaxError } from "./template-renderer";

describe("renderTemplate", () => {
  it("renders nested payload property", () => {
    const result = renderTemplate("{{payload.check_run.name}}", {
      payload: { check_run: { name: "test" } },
    });
    expect(result).toBe("test");
  });

  it("renders event property", () => {
    const result = renderTemplate("{{event.repositoryFullName}}", {
      event: { repositoryFullName: "owner/repo" },
    });
    expect(result).toBe("owner/repo");
  });

  it("replaces missing key with empty string", () => {
    const result = renderTemplate("{{payload.missing}}", {
      payload: {},
    });
    expect(result).toBe("");
  });

  it("renders nested dot notation", () => {
    const result = renderTemplate("{{payload.pull_request.title}}", {
      payload: { pull_request: { title: "Fix bug" } },
    });
    expect(result).toBe("Fix bug");
  });

  it("throws TemplateSyntaxError for invalid syntax", () => {
    expect(() => renderTemplate("{{payload.check_run", {})).toThrow(TemplateSyntaxError);
  });

  it("renders mixed literal text and variables", () => {
    const result = renderTemplate("CI failure: {{payload.check_run.name}}", {
      payload: { check_run: { name: "test" } },
    });
    expect(result).toBe("CI failure: test");
  });

  it("does not escape HTML", () => {
    const result = renderTemplate("{{payload.html}}", {
      payload: { html: "<b>bold</b>" },
    });
    expect(result).toBe("<b>bold</b>");
  });
});
