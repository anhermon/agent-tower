import type { AgentState } from "../domain/agents.js";
import type { JsonObject } from "../domain/common.js";
import type { SessionDescriptor } from "../domain/sessions.js";
import type { AdapterContext, AdapterLifecycle } from "./common.js";

export interface RuntimeControlCommand {
  readonly target: RuntimeTarget;
  readonly action: RuntimeAction;
  readonly reason?: string;
  readonly parameters?: JsonObject;
}

export type RuntimeTarget =
  | { readonly kind: "agent"; readonly agentId: string }
  | { readonly kind: "session"; readonly sessionId: string };

export const RUNTIME_ACTIONS = {
  Start: "start",
  Pause: "pause",
  Resume: "resume",
  Stop: "stop",
  Restart: "restart",
} as const;

export type RuntimeAction = (typeof RUNTIME_ACTIONS)[keyof typeof RUNTIME_ACTIONS];

export type RuntimeControlResult =
  | { readonly kind: "agent"; readonly state: AgentState }
  | { readonly kind: "session"; readonly session: SessionDescriptor };

export interface RuntimeControlAdapter extends AdapterLifecycle {
  readonly apply: (
    command: RuntimeControlCommand,
    context?: AdapterContext
  ) => Promise<RuntimeControlResult>;
}
