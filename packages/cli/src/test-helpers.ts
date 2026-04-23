/**
 * Test-only helpers — NOT exported from `index.ts`. Co-located so both the
 * commands under `src/commands/` and the dispatcher tests can share a single
 * stdout-capturing harness without leaking into the package's public surface.
 */
export interface CaptureResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export async function captureOutput(run: () => Promise<number> | number): Promise<CaptureResult> {
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  process.stdout.write = ((chunk: unknown) => {
    stdoutChunks.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: unknown) => {
    stderrChunks.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;

  try {
    const exitCode = await run();
    return {
      exitCode,
      stdout: stdoutChunks.join(""),
      stderr: stderrChunks.join(""),
    };
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }
}
