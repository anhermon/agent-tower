import type { JsonValue, ReplayData, ReplayTurn } from "@control-plane/core";

interface Props {
  readonly replay: ReplayData;
}

interface TaskInvocation {
  readonly id: string;
  readonly turnIndex: number;
  readonly description: string;
  readonly subagent?: string;
  readonly prompt?: string;
  readonly hasResult: boolean;
}

/**
 * Renders Task tool invocations (sub-agent hand-offs) as a tree. Each entry
 * captures the description, chosen sub-agent, and whether a result was
 * observed. Heavier sub-session JSONL linkage (parentUuid) is left for a later
 * wave — this view reads entirely from the canonical ReplayData.
 */
export function AgentTree({ replay }: Props) {
  const tasks = extractTaskInvocations(replay);
  if (tasks.length === 0) return null;

  return (
    <section className="glass-panel rounded-md p-4">
      <h3 className="eyebrow mb-3">Sub-agents</h3>
      <ul className="space-y-2">
        {tasks.map((task) => (
          <li key={task.id} className="rounded-md border border-cyan/30 bg-cyan/5 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono text-cyan">@{task.subagent ?? "task"}</span>
              <span className="font-mono text-[10px] text-muted">turn {task.turnIndex}</span>
              {task.hasResult ? (
                <span className="rounded-xs border border-ok/30 px-1 py-0 text-[10px] font-semibold uppercase tracking-wide text-ok">
                  done
                </span>
              ) : (
                <span className="rounded-xs border border-muted/30 px-1 py-0 text-[10px] text-muted">
                  pending
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-ink/90">{task.description}</p>
            {task.prompt ? (
              <p className="mt-1 line-clamp-2 text-xs text-muted/80">{task.prompt}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function extractTaskInvocations(replay: ReplayData): readonly TaskInvocation[] {
  const results = new Set<string>();
  for (const turn of replay.turns) {
    if (!turn.toolResults) continue;
    for (const tr of turn.toolResults) results.add(tr.toolUseId);
  }

  const items: TaskInvocation[] = [];
  replay.turns.forEach((turn, i) => {
    if (!turn.toolCalls) return;
    for (const tc of turn.toolCalls) {
      if (tc.name !== "Task") continue;
      const { description, subagent, prompt } = readTaskInput(tc.input);
      items.push({
        id: tc.id,
        turnIndex: i,
        description: description ?? "Sub-agent task",
        subagent,
        prompt,
        hasResult: results.has(tc.id),
      });
    }
    void turnIsAssistant(turn); // tree-shake guard
  });
  return items;
}

function turnIsAssistant(_t: ReplayTurn): void {
  /* intentionally empty */
}

function readTaskInput(input: JsonValue): {
  description?: string;
  subagent?: string;
  prompt?: string;
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const obj = input as Record<string, JsonValue>;
  const pick = (k: string): string | undefined => {
    const v = obj[k];
    return typeof v === "string" && v.length > 0 ? v : undefined;
  };
  return {
    description: pick("description"),
    subagent: pick("subagent_type") ?? pick("subagent"),
    prompt: pick("prompt"),
  };
}
