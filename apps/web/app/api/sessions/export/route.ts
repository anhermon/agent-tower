import "server-only";
import type {
  SessionExportBundle,
  SessionExportRow,
  SessionExportScope,
} from "@control-plane/core";
import { getCostBreakdown, listProjects, type Result } from "@/lib/sessions-analytics";
import { listSessionSummariesOrEmpty } from "@/lib/sessions-source";
import { withAudit } from "@/lib/with-audit";

/**
 * GET /api/sessions/export
 *
 * Canonical-JSON export bundle. Accepts optional:
 *   - `ids=<csv>` — restrict to explicit session ids.
 *   - `projectId=<slug>` — restrict to one project.
 *   - `from=<YYYY-MM-DD>&to=<YYYY-MM-DD>` — restrict to a calendar range.
 *   - `scope=session|project|all` — echoed back on the bundle for the import
 *     side. Defaults to `all` unless `ids` or `projectId` is provided.
 *
 * Response headers set `Content-Disposition: attachment` with a date-stamped
 * filename so browsers save rather than render it. The body is typed against
 * the canonical `SessionExportBundle` shape in `@control-plane/core`.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function exportHandler(request: Request): Promise<Response> {
  const url = new URL(request.url);

  const idsRaw = url.searchParams.get("ids");
  const projectId = url.searchParams.get("projectId") ?? undefined;
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  const rawScope = url.searchParams.get("scope");

  const ids = idsRaw
    ? idsRaw
        .split(",")
        .map((v) => v.trim())
        .filter((v) => v.length > 0)
    : undefined;

  const range = from && to ? { from, to } : undefined;

  const scope: SessionExportScope = resolveScope(rawScope, ids, projectId, range);

  const [summariesResult, costsResult, projectsResult] = await Promise.all([
    listSessionSummariesOrEmpty(
      projectId || range
        ? {
            ...(projectId ? { projectId } : {}),
            ...(range ? { range } : {}),
          }
        : undefined
    ),
    getCostBreakdown(range),
    listProjects(),
  ]);

  if (!summariesResult.ok) {
    return errorResponse(summariesResult);
  }
  if (!costsResult.ok) {
    return errorResponse(costsResult);
  }
  if (!projectsResult.ok) {
    return errorResponse(projectsResult);
  }

  const idSet = ids && ids.length > 0 ? new Set(ids) : null;
  const filtered = idSet
    ? summariesResult.value.filter((s) => idSet.has(s.sessionId))
    : summariesResult.value;

  const rows: SessionExportRow[] = filtered.map((summary) => ({
    summary,
    flags: summary.flags,
    compactions: summary.compactions,
  }));

  const bundle: SessionExportBundle = {
    version: 1,
    exportedAt: new Date().toISOString(),
    scope,
    sessions: rows,
    costs: costsResult.value,
    projects: projectsResult.value,
  };

  const todayStamp = new Date().toISOString().slice(0, 10);
  const filename = `control-plane-sessions-${todayStamp}.json`;

  return new Response(JSON.stringify(bundle), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export const GET = withAudit("api.sessions.export", exportHandler);

function resolveScope(
  raw: string | null,
  ids: readonly string[] | undefined,
  projectId: string | undefined,
  range: { readonly from: string; readonly to: string } | undefined
): SessionExportScope {
  const kind =
    raw === "session" || raw === "project" || raw === "all"
      ? raw
      : ids && ids.length > 0
        ? "session"
        : projectId
          ? "project"
          : "all";

  return {
    kind,
    ...(ids && ids.length > 0 ? { ids } : {}),
    ...(range ? { from: range.from, to: range.to } : {}),
  };
}

function errorResponse(result: Extract<Result<unknown>, { ok: false }>): Response {
  if (result.reason === "unconfigured") {
    return new Response(JSON.stringify({ error: "Analytics source is not configured." }), {
      status: 503,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
  return new Response(JSON.stringify({ error: result.message }), {
    status: 500,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
