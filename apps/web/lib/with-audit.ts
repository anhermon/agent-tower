import "server-only";
import { randomUUID } from "node:crypto";

import { getLogger, type RequestAuditFields } from "@control-plane/logger";

/**
 * Wraps a Next.js App-Router route handler so every invocation emits a
 * canonical request-audit trio:
 *   - `request.start` (debug)   — on entry, before the handler runs.
 *   - `request.done`  (info)    — on successful return, with status + duration.
 *   - `request.error` (error)   — on throw, with serialized Error + duration.
 *
 * All records are emitted through `getLogger("request")`, which the logger's
 * fanout writer routes to `logs/requests.log`. The `requestId` (either the
 * inbound `x-request-id` header or a fresh UUIDv4) is propagated back to the
 * client via the same response header so downstream systems can correlate.
 *
 * The wrapper never swallows handler errors — it logs and re-throws so
 * Next's own error boundary still fires.
 */

type RouteHandler = (request: Request, ctx?: unknown) => Promise<Response> | Response;

export function withAudit(route: string, handler: RouteHandler): RouteHandler {
  const log = getLogger("request");

  return async function audited(request: Request, ctx?: unknown): Promise<Response> {
    const requestId = request.headers.get("x-request-id") ?? randomUUID();
    const method = request.method;
    const url = new URL(request.url);
    const path = url.pathname;
    const query = url.search.length > 0 ? url.search : undefined;
    const startedAt = performance.now();

    const startFields: RequestAuditFields = {
      requestId,
      method,
      route,
      path,
      ...(query !== undefined ? { query } : {}),
    };
    log.debug(startFields, "request.start");

    try {
      const response = await handler(request, ctx);
      const durationMs = Math.round(performance.now() - startedAt);

      // App Router Responses accept header mutation, but guard against the
      // rare immutable-headers case (e.g. a wrapped Response).
      let outgoing = response;
      try {
        outgoing.headers.set("x-request-id", requestId);
      } catch {
        outgoing = new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: new Headers(response.headers),
        });
        outgoing.headers.set("x-request-id", requestId);
      }

      const doneFields: RequestAuditFields = {
        requestId,
        method,
        route,
        path,
        ...(query !== undefined ? { query } : {}),
        status: outgoing.status,
        durationMs,
      };
      log.info(doneFields, "request.done");

      return outgoing;
    } catch (error: unknown) {
      const durationMs = Math.round(performance.now() - startedAt);
      const err = serializeError(error);
      const errorFields: RequestAuditFields = {
        requestId,
        method,
        route,
        path,
        ...(query !== undefined ? { query } : {}),
        durationMs,
        err,
      };
      log.error(errorFields, "request.error");
      throw error;
    }
  };
}

function serializeError(error: unknown): {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
} {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(typeof error.stack === "string" ? { stack: error.stack } : {}),
    };
  }
  return { name: "NonError", message: String(error) };
}
