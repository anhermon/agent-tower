export class TemplateSyntaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateSyntaxError";
  }
}

export function renderTemplate(template: string, context: Record<string, unknown>): string {
  const regex = /\{\{([^{}]*)\}\}/g;

  const result = template.replace(regex, (_match, path: string) => {
    const trimmedPath = path.trim();

    if (trimmedPath === "") {
      throw new TemplateSyntaxError("Empty template variable");
    }

    const segments = trimmedPath.split(".");
    let current: unknown = context;

    for (const segment of segments) {
      if (current === null || current === undefined) {
        return "";
      }

      if (typeof current !== "object" || !(segment in current)) {
        return "";
      }

      current = (current as Record<string, unknown>)[segment];
    }

    return current === null || current === undefined ? "" : String(current);
  });

  if (result.includes("{{") || result.includes("}}")) {
    throw new TemplateSyntaxError("Unmatched template braces");
  }

  return result;
}
