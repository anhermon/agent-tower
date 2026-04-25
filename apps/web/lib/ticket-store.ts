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
  var _ticketStore: InMemoryTicketRepository | undefined;
}

// ??= as a statement satisfies @typescript-eslint/prefer-nullish-coalescing
// without being an assignment-in-expression.
globalThis._ticketStore ??= new InMemoryTicketRepository();

export const ticketStore: InMemoryTicketRepository = globalThis._ticketStore;
