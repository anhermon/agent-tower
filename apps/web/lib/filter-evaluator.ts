export class FilterSyntaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FilterSyntaxError";
  }
}

type TokenType =
  | "IDENTIFIER"
  | "STRING"
  | "NUMBER"
  | "BOOLEAN"
  | "EQ"
  | "NEQ"
  | "LT"
  | "GT"
  | "LTE"
  | "GTE"
  | "AND"
  | "OR"
  | "DOT"
  | "EOF";

interface Token {
  type: TokenType;
  value: string;
}

interface LiteralNode {
  type: "literal";
  value: string | number | boolean;
}

interface PropertyNode {
  type: "property";
  path: string[];
}

interface BinaryNode {
  type: "binary";
  operator: string;
  left: ASTNode;
  right: ASTNode;
}

type ASTNode = LiteralNode | PropertyNode | BinaryNode;

// eslint-disable-next-line complexity, sonarjs/cognitive-complexity -- lexer; branching follows character-class dispatch
function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (ch === ".") {
      tokens.push({ type: "DOT", value: "." });
      i++;
      continue;
    }

    if (ch === "'" || ch === '"') {
      const quote = ch;
      let value = "";
      i++;
      while (i < input.length && input[i] !== quote) {
        value += input[i];
        i++;
      }
      if (i >= input.length) {
        throw new FilterSyntaxError("Unterminated string literal");
      }
      i++;
      tokens.push({ type: "STRING", value });
      continue;
    }

    if (/[0-9]/.test(ch)) {
      let value = "";
      while (i < input.length && /[0-9.]/.test(input[i])) {
        value += input[i];
        i++;
      }
      tokens.push({ type: "NUMBER", value });
      continue;
    }

    if (/[a-zA-Z_]/.test(ch)) {
      let value = "";
      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i])) {
        value += input[i];
        i++;
      }
      if (value === "true" || value === "false") {
        tokens.push({ type: "BOOLEAN", value });
      } else {
        tokens.push({ type: "IDENTIFIER", value });
      }
      continue;
    }

    if (ch === "&" && input[i + 1] === "&") {
      tokens.push({ type: "AND", value: "&&" });
      i += 2;
      continue;
    }

    if (ch === "|" && input[i + 1] === "|") {
      tokens.push({ type: "OR", value: "||" });
      i += 2;
      continue;
    }

    if (ch === "=" && input[i + 1] === "=") {
      tokens.push({ type: "EQ", value: "==" });
      i += 2;
      continue;
    }

    if (ch === "!" && input[i + 1] === "=") {
      tokens.push({ type: "NEQ", value: "!=" });
      i += 2;
      continue;
    }

    if (ch === "<" && input[i + 1] === "=") {
      tokens.push({ type: "LTE", value: "<=" });
      i += 2;
      continue;
    }

    if (ch === ">" && input[i + 1] === "=") {
      tokens.push({ type: "GTE", value: ">=" });
      i += 2;
      continue;
    }

    if (ch === "<") {
      tokens.push({ type: "LT", value: "<" });
      i++;
      continue;
    }

    if (ch === ">") {
      tokens.push({ type: "GT", value: ">" });
      i++;
      continue;
    }

    throw new FilterSyntaxError(`Unexpected character: ${ch}`);
  }

  tokens.push({ type: "EOF", value: "" });
  return tokens;
}

function parse(input: string): ASTNode {
  const tokens = tokenize(input);
  let pos = 0;

  function current(): Token {
    return tokens[pos];
  }

  function consume(expected?: TokenType): Token {
    const token = tokens[pos];
    if (expected && token.type !== expected) {
      throw new FilterSyntaxError(`Expected ${expected} but got ${token.type}`);
    }
    pos++;
    return token;
  }

  function parseExpression(): ASTNode {
    return parseOr();
  }

  function parseOr(): ASTNode {
    let left = parseAnd();
    while (current().type === "OR") {
      const operator = consume().value;
      const right = parseAnd();
      left = { type: "binary", operator, left, right };
    }
    return left;
  }

  function parseAnd(): ASTNode {
    let left = parseComparison();
    while (current().type === "AND") {
      const operator = consume().value;
      const right = parseComparison();
      left = { type: "binary", operator, left, right };
    }
    return left;
  }

  function parseComparison(): ASTNode {
    const left = parsePrimary();
    const opTypes: TokenType[] = ["EQ", "NEQ", "LT", "GT", "LTE", "GTE"];
    if (opTypes.includes(current().type)) {
      const operator = consume().value;
      const right = parsePrimary();
      return { type: "binary", operator, left, right };
    }
    return left;
  }

  function parsePrimary(): ASTNode {
    const token = current();

    if (token.type === "STRING") {
      consume();
      return { type: "literal", value: token.value };
    }

    if (token.type === "NUMBER") {
      consume();
      const num = parseFloat(token.value);
      if (Number.isNaN(num)) {
        throw new FilterSyntaxError(`Invalid number: ${token.value}`);
      }
      return { type: "literal", value: num };
    }

    if (token.type === "BOOLEAN") {
      consume();
      return { type: "literal", value: token.value === "true" };
    }

    if (token.type === "IDENTIFIER") {
      consume();
      const path = [token.value];
      while (current().type === "DOT") {
        consume("DOT");
        const next = current();
        if (next.type !== "IDENTIFIER") {
          throw new FilterSyntaxError(`Expected identifier after dot, got ${next.type}`);
        }
        consume();
        path.push(next.value);
      }
      return { type: "property", path };
    }

    throw new FilterSyntaxError(`Unexpected token: ${token.type}`);
  }

  const ast = parseExpression();
  if (current().type !== "EOF") {
    throw new FilterSyntaxError(`Unexpected token after expression: ${current().type}`);
  }
  return ast;
}

function getPropertyValue(obj: unknown, path: string[]): unknown {
  let current = obj;
  for (const key of path) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

// eslint-disable-next-line complexity -- AST evaluator; switch case per node type
function evaluateNode(node: ASTNode, context: unknown): unknown {
  switch (node.type) {
    case "literal":
      return node.value;

    case "property": {
      const value = getPropertyValue(context, node.path);
      if (value === undefined) {
        // Return a sentinel for missing properties that comparison handles
        return { __missing: true };
      }
      return value;
    }

    case "binary": {
      const left = evaluateNode(node.left, context);
      const right = evaluateNode(node.right, context);

      if (node.operator === "&&") {
        return !!left && !!right;
      }

      if (node.operator === "||") {
        return !!left || !!right;
      }

      // If either side is a missing property, comparison is false
      if (
        (left && typeof left === "object" && (left as Record<string, unknown>).__missing) ||
        (right && typeof right === "object" && (right as Record<string, unknown>).__missing)
      ) {
        return false;
      }

      switch (node.operator) {
        case "==":
          return left === right;
        case "!=":
          return left !== right;
        case "<":
          return (left as number) < (right as number);
        case ">":
          return (left as number) > (right as number);
        case "<=":
          return (left as number) <= (right as number);
        case ">=":
          return (left as number) >= (right as number);
        default:
          throw new FilterSyntaxError(`Unknown operator: ${node.operator}`);
      }
    }
  }
}

export function evaluateFilter(expression: string, context: unknown): boolean {
  if (!expression || expression.trim() === "") {
    throw new FilterSyntaxError("Empty expression");
  }
  const ast = parse(expression);
  const result = evaluateNode(ast, context);
  return !!result;
}
