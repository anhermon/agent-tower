export const dynamic = "force-dynamic";

/**
 * Inert SSE endpoint. Phase 1 has no event source wired, so we emit only the
 * client's `retry:` hint and a comment indicating the stream is empty, then
 * close the response. No `data:` frames, no fabricated envelopes — consumers
 * that connect get an honest "nothing to stream yet" signal.
 */
export function GET(): Response {
  return new Response("retry: 3000\n\n: no events\n\n", {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
