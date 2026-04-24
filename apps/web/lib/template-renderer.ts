import Mustache from "mustache";

export class TemplateSyntaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateSyntaxError";
  }
}

export function renderTemplate(template: string, context: Record<string, unknown>): string {
  try {
    return Mustache.render(template, context, undefined, { escape: (text) => String(text ?? "") });
  } catch (error) {
    if (error instanceof Error) {
      throw new TemplateSyntaxError(error.message);
    }
    throw new TemplateSyntaxError(String(error));
  }
}
