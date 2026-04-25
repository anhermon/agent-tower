/**
 * Process-level singleton for the in-memory ticket store.
 *
 * Next.js hot-reloads modules in development which would recreate the store on every
 * code change. Attaching to `globalThis` preserves the state across HMR boundaries
 * while keeping a single instance in production.
 *
 * Server-only: never import this from a client component.
 */
import { InMemoryTicketRepository } from "@control-plane/storage";

declare global {
  // eslint-disable-next-line no-var -- intentional global augmentation for HMR persistence
  var _ticketStore: InMemoryTicketRepository | undefined;
}

if (!globalThis._ticketStore) {
  globalThis._ticketStore = new InMemoryTicketRepository();
}

export const ticketStore: InMemoryTicketRepository = globalThis._ticketStore;
