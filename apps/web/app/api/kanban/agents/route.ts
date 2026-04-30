import "server-only";

import { listAgentsOrEmpty } from "@/lib/agents-source";
import { withAudit } from "@/lib/with-audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/kanban/agents
 * Returns the list of known agents for the assignee dropdown.
 *
 * Agents are derived from the same Claude Code adapter source used by the
 * /agents page — no Paperclip dependency. Each entry has id and name only;
 * the UI uses these for the dropdown display and stores the id on the ticket.
 */
export const GET = withAudit("api.kanban.agents.list", async (_req: Request): Promise<Response> => {
  const result = await listAgentsOrEmpty();
  if (!result.ok) {
    // Unconfigured or error → return empty list so the dropdown is available
    // but empty; ticket creation without an assignee is always valid.
    return Response.json({ ok: true, agents: [] });
  }

  const agents = result.agents.map((item) => ({
    id: item.descriptor.id,
    name: item.descriptor.displayName,
  }));

  return Response.json({ ok: true, agents });
});
