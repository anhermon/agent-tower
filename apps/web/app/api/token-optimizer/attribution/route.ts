import { computeAttribution } from "@/lib/token-optimizer-source";
import { withAudit } from "@/lib/with-audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function attributionGetHandler(_request: Request): Promise<Response> {
  try {
    const report = await computeAttribution();
    return Response.json({ ok: true, report });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export const GET = withAudit("api.token-optimizer.attribution", attributionGetHandler);
