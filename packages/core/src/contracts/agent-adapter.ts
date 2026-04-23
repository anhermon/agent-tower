import type { AgentDescriptor, AgentState } from "../domain/agents.js";
import type { JsonObject } from "../domain/common.js";
import type { SessionDescriptor, SessionTurn } from "../domain/sessions.js";
import type { AdapterContext, AdapterLifecycle } from "./common.js";

export interface AgentSessionStartRequest {
  readonly agentId: string;
  readonly title?: string;
  readonly initialInput?: SessionTurn;
  readonly configuration?: JsonObject;
}

export interface AgentInputRequest {
  readonly sessionId: string;
  readonly input: SessionTurn;
}

export interface AgentAdapter extends AdapterLifecycle {
  readonly runtime: AgentDescriptor["runtime"];
  readonly describe: (context?: AdapterContext) => Promise<AgentDescriptor>;
  readonly getState: (agentId: string, context?: AdapterContext) => Promise<AgentState>;
  readonly startSession: (
    request: AgentSessionStartRequest,
    context?: AdapterContext
  ) => Promise<SessionDescriptor>;
  readonly sendInput: (
    request: AgentInputRequest,
    context?: AdapterContext
  ) => Promise<SessionTurn>;
  readonly stopSession: (
    sessionId: string,
    reason?: string,
    context?: AdapterContext
  ) => Promise<SessionDescriptor>;
}
