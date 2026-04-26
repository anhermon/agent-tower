import { deleteWebhookSubscription, updateWebhookSubscription } from "@/lib/webhooks-write";
import { withAudit } from "@/lib/with-audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function patchHandler(request: Request, ctx: unknown): Promise<Response> {
  const id = extractId(ctx);
  if (!id) return Response.json({ ok: false, error: "missing_id" }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!isPlainObject(body)) {
    return Response.json({ ok: false, error: "body_must_be_object" }, { status: 400 });
  }

  const { displayName, url, eventTypes, enabled, secretRef } = body;

  const result = await updateWebhookSubscription(id, {
    ...(typeof displayName === "string" ? { displayName } : {}),
    ...(typeof url === "string" && url.trim().length > 0 ? { url: url.trim() } : {}),
    ...(Array.isArray(eventTypes)
      ? { eventTypes: eventTypes.filter((e): e is string => typeof e === "string") }
      : {}),
    ...(typeof enabled === "boolean" ? { enabled } : {}),
    ...(typeof secretRef === "string" ? { secretRef } : {}),
  });

  if (!result.ok) {
    const status =
      result.reason === "unconfigured" ? 503 : result.reason === "not_found" ? 404 : 400;
    return Response.json({ ok: false, error: result.reason, message: result.message }, { status });
  }

  return Response.json({ ok: true, subscription: result.value });
}

async function deleteHandler(_request: Request, ctx: unknown): Promise<Response> {
  const id = extractId(ctx);
  if (!id) return Response.json({ ok: false, error: "missing_id" }, { status: 400 });

  const result = await deleteWebhookSubscription(id);

  if (!result.ok) {
    const status =
      result.reason === "unconfigured" ? 503 : result.reason === "not_found" ? 404 : 400;
    return Response.json({ ok: false, error: result.reason, message: result.message }, { status });
  }

  return Response.json({ ok: true, deleted: result.value.deleted });
}

export const PATCH = withAudit("api.webhooks.subscriptions.update", patchHandler);
export const DELETE = withAudit("api.webhooks.subscriptions.delete", deleteHandler);

function extractId(ctx: unknown): string | null {
  if (!isPlainObject(ctx)) return null;
  const params = ctx.params;
  if (!isPlainObject(params)) return null;
  const id = params.id;
  return typeof id === "string" && id.trim().length > 0 ? decodeURIComponent(id.trim()) : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
