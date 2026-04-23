import type { JsonObject, JsonValue, MetadataCarrier } from "./common.js";

export const CHANNEL_KINDS = {
  Web: "web",
  Slack: "slack",
  Email: "email",
  Api: "api",
  Cli: "cli",
  Internal: "internal"
} as const;

export type ChannelKind = (typeof CHANNEL_KINDS)[keyof typeof CHANNEL_KINDS];

export const CHANNEL_MESSAGE_DIRECTIONS = {
  Inbound: "inbound",
  Outbound: "outbound"
} as const;

export type ChannelMessageDirection =
  (typeof CHANNEL_MESSAGE_DIRECTIONS)[keyof typeof CHANNEL_MESSAGE_DIRECTIONS];

export interface ChannelRef {
  readonly kind: ChannelKind;
  readonly id: string;
}

export interface ChannelIdentity extends MetadataCarrier {
  readonly id: string;
  readonly channel: ChannelRef;
  readonly displayName?: string;
  readonly externalUserId?: string;
}

export interface ChannelMessage extends MetadataCarrier {
  readonly id: string;
  readonly channel: ChannelRef;
  readonly direction: ChannelMessageDirection;
  readonly createdAt: string;
  readonly sender: ChannelIdentity;
  readonly text?: string;
  readonly payload?: JsonValue;
  readonly threadId?: string;
  readonly correlationId?: string;
}

export interface ChannelBinding {
  readonly id: string;
  readonly channel: ChannelRef;
  readonly agentId?: string;
  readonly sessionId?: string;
  readonly configuration?: JsonObject;
}
