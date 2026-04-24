import { listTools } from "@/lib/token-optimizer-source";
import { withAudit } from "@/lib/with-audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function toolsGetHandler(_request: Request): Promise<Response> {
  try {
    const tools = await listTools();
    return Response.json({ ok: true, tools });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export const GET = withAudit("api.token-optimizer.tools", toolsGetHandler);
