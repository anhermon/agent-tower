import { withAudit } from "@/lib/with-audit";

export const dynamic = "force-dynamic";

function healthHandler(): Response {
  return Response.json({
    ok: true,
    service: "@control-plane/web",
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
}

export const GET = withAudit("api.health", healthHandler);
