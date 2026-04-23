/**
 * Canonical field shape for HTTP request-audit log lines. Keep these stable —
 * they are the contract between the logger and any log-analysis tooling
 * (grep-friendly JSON, future SIEM shipping).
 *
 * Call sites pass `component: "request"` so the fanout writer routes the line
 * into requests.log.
 */
export interface RequestAuditFields {
  /** UUIDv4 assigned per request. Propagated to clients via x-request-id. */
  readonly requestId: string;
  /** HTTP verb. */
  readonly method: string;
  /** Stable route key — e.g. "api.health", not the templated URL. */
  readonly route: string;
  /** Requested pathname (path only, no query string). */
  readonly path: string;
  /** Query string verbatim (including leading "?"), or undefined. */
  readonly query?: string;
  /** HTTP status code. Present on request.done / request.error, absent on request.start. */
  readonly status?: number;
  /** Wall-clock duration from handler entry to Response return, in ms. */
  readonly durationMs?: number;
  /** Serialized error — populated on request.error only. */
  readonly err?: {
    readonly name: string;
    readonly message: string;
    readonly stack?: string;
  };
}
