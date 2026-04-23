import type { AdapterContext, AdapterLifecycle, Subscription } from "./common.js";
import type {
  ChannelBinding,
  ChannelKind,
  ChannelMessage,
  ChannelRef,
} from "../domain/channels.js";

export interface ChannelSendRequest {
  readonly binding: ChannelBinding;
  readonly message: ChannelMessage;
}

export interface ChannelSendResult {
  readonly messageId: string;
  readonly externalMessageId?: string;
  readonly deliveredAt?: string;
}

export interface ChannelAdapter extends AdapterLifecycle {
  readonly kind: ChannelKind;
  readonly bind: (channel: ChannelRef, context?: AdapterContext) => Promise<ChannelBinding>;
  readonly send: (
    request: ChannelSendRequest,
    context?: AdapterContext
  ) => Promise<ChannelSendResult>;
  readonly subscribe: (
    binding: ChannelBinding,
    onMessage: (message: ChannelMessage) => Promise<void>,
    context?: AdapterContext
  ) => Promise<Subscription>;
}
