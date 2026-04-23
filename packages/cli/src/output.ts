/**
 * Shared output helpers for the `cp` CLI.
 *
 * Every command emits either a single JSON document (default) or a plain-text
 * pretty rendering. Pretty mode is intentionally ANSI-light: we only add bold
 * headings when stdout is a TTY so piped output stays grep/awk-friendly.
 */

export interface OutputOptions {
  readonly json: boolean;
  readonly pretty: boolean;
}

export function resolveOutputMode(args: {
  readonly json?: boolean | undefined;
  readonly pretty?: boolean | undefined;
}): OutputOptions {
  const pretty = args.pretty === true;
  // JSON is the default unless --pretty is explicitly set. `--json` is accepted
  // for intent even though it's implied.
  const json = !pretty;
  return { json, pretty };
}

export function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function writeLine(line = ""): void {
  process.stdout.write(`${line}\n`);
}

export function writeError(line: string): void {
  process.stderr.write(`${line}\n`);
}

export function supportsAnsi(): boolean {
  return Boolean(process.stdout.isTTY);
}

export function bold(text: string): string {
  return supportsAnsi() ? `[1m${text}[22m` : text;
}

export function dim(text: string): string {
  return supportsAnsi() ? `[2m${text}[22m` : text;
}

/** Renders a simple space-aligned table. No borders, no colors. */
export function renderTable(
  headers: readonly string[],
  rows: readonly (readonly string[])[]
): string {
  const widths = headers.map((h, columnIndex) => {
    let width = h.length;
    for (const row of rows) {
      const cell = row[columnIndex] ?? "";
      if (cell.length > width) width = cell.length;
    }
    return width;
  });
  const pad = (cell: string, columnIndex: number): string => {
    const width = widths[columnIndex] ?? cell.length;
    return cell.padEnd(width, " ");
  };
  const headerLine = headers.map(pad).join("  ");
  const separator = widths.map((w) => "-".repeat(w)).join("  ");
  const bodyLines = rows.map((row) =>
    row.map((cell, columnIndex) => pad(cell, columnIndex)).join("  ")
  );
  return [bold(headerLine), separator, ...bodyLines].join("\n");
}
