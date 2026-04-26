import { createWebhookSubscription } from "@/lib/webhooks-write";
import { withAudit } from "@/lib/with-audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function postHandler(request: Request): Promise<Response> {
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

  if (typeof url !== "string" || url.trim().length === 0) {
    return Response.json({ ok: false, error: "url_required" }, { status: 422 });
  }
  if (!Array.isArray(eventTypes) || eventTypes.length === 0) {
    return Response.json({ ok: false, error: "event_types_required" }, { status: 422 });
  }

  const result = await createWebhookSubscription({
    displayName: typeof displayName === "string" ? displayName : "",
    url: url.trim(),
    eventTypes: eventTypes.filter((e): e is string => typeof e === "string"),
    enabled: typeof enabled === "boolean" ? enabled : true,
    secretRef:
      typeof secretRef === "string" && secretRef.trim().length > 0 ? secretRef.trim() : undefined,
  });

  if (!result.ok) {
    const status = result.reason === "unconfigured" ? 503 : 400;
    return Response.json({ ok: false, error: result.reason, message: result.message }, { status });
  }

  return Response.json({ ok: true, subscription: result.value }, { status: 201 });
}

export const POST = withAudit("api.webhooks.subscriptions.create", postHandler);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
