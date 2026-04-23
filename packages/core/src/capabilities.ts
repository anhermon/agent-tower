export const CONTROL_PLANE_CAPABILITIES = {
  SessionStreaming: "session.streaming",
  SessionAnalytics: "session-analytics",
  ToolCalling: "tool.calling",
  McpClient: "mcp.client",
  RuntimeControl: "runtime.control",
  ChannelIngress: "channel.ingress",
  ChannelEgress: "channel.egress",
  Pricing: "pricing",
  Replay: "replay",
  Webhooks: "webhooks",
  Tickets: "tickets",
  Skills: "skills",
} as const;

export type ControlPlaneCapability =
  (typeof CONTROL_PLANE_CAPABILITIES)[keyof typeof CONTROL_PLANE_CAPABILITIES];

export const CLAUDE_FIRST_CAPABILITIES = [
  CONTROL_PLANE_CAPABILITIES.SessionStreaming,
  CONTROL_PLANE_CAPABILITIES.ToolCalling,
  CONTROL_PLANE_CAPABILITIES.McpClient,
  CONTROL_PLANE_CAPABILITIES.RuntimeControl,
  CONTROL_PLANE_CAPABILITIES.Skills,
] as const satisfies readonly ControlPlaneCapability[];

export const AGENT_AGNOSTIC_CAPABILITIES = [
  CONTROL_PLANE_CAPABILITIES.ChannelIngress,
  CONTROL_PLANE_CAPABILITIES.ChannelEgress,
  CONTROL_PLANE_CAPABILITIES.Pricing,
  CONTROL_PLANE_CAPABILITIES.Replay,
  CONTROL_PLANE_CAPABILITIES.SessionAnalytics,
  CONTROL_PLANE_CAPABILITIES.Webhooks,
  CONTROL_PLANE_CAPABILITIES.Tickets,
] as const satisfies readonly ControlPlaneCapability[];

export const DEFAULT_CONTROL_PLANE_CAPABILITIES = [
  ...CLAUDE_FIRST_CAPABILITIES,
  ...AGENT_AGNOSTIC_CAPABILITIES,
] as const satisfies readonly ControlPlaneCapability[];

export interface CapabilitySet {
  readonly required: readonly ControlPlaneCapability[];
  readonly optional?: readonly ControlPlaneCapability[];
}

export const capabilitySet = (
  required: readonly ControlPlaneCapability[],
  optional?: readonly ControlPlaneCapability[]
): CapabilitySet =>
  optional === undefined
    ? { required }
    : {
        required,
        optional,
      };
