import { listWebhookSessions } from "@/lib/webhook-session-store";
import { withAudit } from "@/lib/with-audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function webhookSessionsHandler(request: Request): Response {
  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam !== null ? Math.min(Math.max(1, Number(limitParam)), 500) : 100;

  const sessions = listWebhookSessions(Number.isFinite(limit) ? limit : 100);
  return Response.json({ ok: true, sessions, total: sessions.length });
}

export const GET = withAudit("api.webhook-sessions", webhookSessionsHandler);
