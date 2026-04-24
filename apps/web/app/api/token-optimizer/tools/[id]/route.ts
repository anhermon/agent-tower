import type { TokenOptimizerToolId } from "@control-plane/core";

import { listTools, toggleTool, updateToolTags } from "@/lib/token-optimizer-source";
import { withAudit } from "@/lib/with-audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TAG_MAX_LEN = 64;
const TAG_PRINTABLE_ASCII = /^[\x20-\x7E]+$/;

async function parseBody(request: Request): Promise<Record<string, unknown> | Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  if (typeof raw !== "object" || raw === null) {
    return Response.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  return raw as Record<string, unknown>;
}

function validateBody(body: Record<string, unknown>): Response | null {
  if (!("enabled" in body) && !("tags" in body)) {
    return Response.json({ ok: false, error: "no_fields" }, { status: 400 });
  }
  if ("enabled" in body && typeof body.enabled !== "boolean") {
    return Response.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  if ("tags" in body) {
    if (!Array.isArray(body.tags) || !(body.tags as unknown[]).every((t) => typeof t === "string")) {
      return Response.json({ ok: false, error: "invalid_body" }, { status: 400 });
    }
    const tags = body.tags as string[];
    const invalidTag = tags.find((t) => t.length > TAG_MAX_LEN || !TAG_PRINTABLE_ASCII.test(t));
    if (invalidTag !== undefined) {
      return Response.json({ ok: false, error: "invalid_tags" }, { status: 400 });
    }
  }
  return null;
}

async function toolPatchHandler(request: Request, ctx?: unknown): Promise<Response> {
  // Next.js 15: dynamic params arrive as a Promise in the route context.
  const rawCtx = ctx as { params?: Promise<{ id?: string }> | { id?: string } } | undefined;
  const paramsResolved = rawCtx?.params instanceof Promise ? await rawCtx.params : rawCtx?.params;
  const id = paramsResolved?.id ?? "";

  // Validate id against the live registry — no static allowlist to drift.
  const tools = await listTools();
  if (!tools.some((t) => t.id === id)) {
    return Response.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const bodyOrError = await parseBody(request);
  if (bodyOrError instanceof Response) return bodyOrError;
  const body = bodyOrError;

  const validationError = validateBody(body);
  if (validationError !== null) return validationError;

  try {
    if (typeof body.enabled === "boolean") {
      await toggleTool(id as TokenOptimizerToolId, body.enabled);
    }
    if (Array.isArray(body.tags)) {
      await updateToolTags(id as TokenOptimizerToolId, body.tags as string[]);
    }

    const freshTools = await listTools();
    const tool = freshTools.find((t) => t.id === id);
    if (!tool) {
      return Response.json({ ok: false, error: "tool_not_found" }, { status: 404 });
    }
    return Response.json({ ok: true, tool });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export const PATCH = withAudit("api.token-optimizer.tools.id", toolPatchHandler);
