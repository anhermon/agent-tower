import { readFile, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Pure resolver split out from route.ts so unit tests can exercise the
 * path-validation logic without pulling in the rest of the web app's module
 * graph. The route imports this and calls it with the real fs APIs.
 */
export async function resolveAndServe({
  cwd,
  requestedPath,
  readFileImpl = readFile,
  statImpl = stat,
}: {
  readonly cwd: string;
  readonly requestedPath: string;
  readonly readFileImpl?: typeof readFile;
  readonly statImpl?: typeof stat;
}): Promise<Response> {
  const cwdResolved = path.resolve(cwd);
  const candidate = path.isAbsolute(requestedPath)
    ? path.resolve(requestedPath)
    : path.resolve(cwdResolved, requestedPath);

  const withSep = cwdResolved.endsWith(path.sep) ? cwdResolved : cwdResolved + path.sep;
  if (candidate !== cwdResolved && !candidate.startsWith(withSep)) {
    return new Response("Forbidden: path must be under session cwd", { status: 403 });
  }

  const statError = await validateFileStat(candidate, statImpl);
  if (statError) return statError;

  return readAndServe(candidate, readFileImpl);
}

async function validateFileStat(
  candidate: string,
  statImpl: typeof stat
): Promise<Response | null> {
  let fileStat: Awaited<ReturnType<typeof stat>>;
  try {
    fileStat = await statImpl(candidate);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!fileStat.isFile()) return new Response("Not a file", { status: 415 });
  if (fileStat.size > 2 * 1024 * 1024)
    return new Response("File too large (>2MB)", { status: 413 });
  if (!hasSafeExtension(candidate))
    return new Response("Unsupported content type", { status: 415 });
  return null;
}

async function readAndServe(candidate: string, readFileImpl: typeof readFile): Promise<Response> {
  try {
    const buf = await readFileImpl(candidate);
    return new Response(buf.toString("utf8"), {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Served-Path": candidate,
      },
    });
  } catch (error) {
    return new Response(`Read error: ${(error as Error).message}`, { status: 500 });
  }
}

const SAFE_EXTENSIONS = new Set<string>([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".mdx",
  ".txt",
  ".yml",
  ".yaml",
  ".toml",
  ".ini",
  ".env",
  ".sh",
  ".py",
  ".go",
  ".rs",
  ".rb",
  ".css",
  ".scss",
  ".html",
  ".xml",
  ".sql",
  ".log",
  ".gitignore",
  ".editorconfig",
  "",
]);

function hasSafeExtension(p: string): boolean {
  const ext = path.extname(p).toLowerCase();
  if (SAFE_EXTENSIONS.has(ext)) return true;
  const base = path.basename(p).toLowerCase();
  if (base === "readme" || base === "license" || base === "changelog") return true;
  return false;
}
