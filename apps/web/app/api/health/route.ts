export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    ok: true,
    service: "@control-plane/web",
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
}
