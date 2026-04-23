import "server-only";
import { loadSessionUsageOrEmpty } from "@/lib/sessions-source";
import { resolveAndServe } from "./resolver";

/**
 * GET /sessions/:id/file?path=<relative-or-absolute>
 *
 * Read-only file preview scoped strictly to the session's recorded cwd. The
 * actual path-validation + mime gating lives in `resolver.ts` so it can be
 * unit-tested without pulling in the rest of the web module graph.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params;
  const url = new URL(request.url);
  const rawPath = url.searchParams.get("path");
  if (!rawPath) {
    return new Response("Missing ?path query param", { status: 400 });
  }

  const usage = await loadSessionUsageOrEmpty(id);
  if (!usage.ok) {
    const status = usage.reason === "unconfigured" ? 503 : 500;
    return new Response(`Session unavailable: ${usage.reason}`, { status });
  }
  if (!usage.value) {
    return new Response(`Session not found: ${id}`, { status: 404 });
  }
  const cwd = usage.value.cwd;
  if (!cwd) {
    return new Response("Session has no recorded cwd; preview disabled", { status: 403 });
  }

  return resolveAndServe({ cwd, requestedPath: rawPath });
}
