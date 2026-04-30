import "server-only";

import { listPaperclipAgents } from "@/lib/paperclip-kanban";
import { withAudit } from "@/lib/with-audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/kanban/agents
 * Returns the list of Paperclip agents for the assignee dropdown.
 */
export const GET = withAudit("api.kanban.agents.list", async (_req: Request): Promise<Response> => {
  const result = await listPaperclipAgents();
  if (!result.ok) {
    const status = result.reason === "unconfigured" ? 503 : 502;
    return Response.json({ ok: false, reason: result.reason, message: result.message }, { status });
  }
  return Response.json({ ok: true, agents: result.agents });
});
