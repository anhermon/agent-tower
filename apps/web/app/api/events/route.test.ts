import { describe, expect, it } from "vitest";
import { GET } from "./route.js";

describe("/api/events GET", () => {
  it("given_no_source_is_wired__when_requested__then_the_body_is_the_inert_retry_stub_with_no_data_frames", async () => {
    const response = GET();

    expect(response.headers.get("Content-Type")).toContain("text/event-stream");

    const body = await response.text();
    expect(body).toContain("retry:");
    expect(body).toContain(": no events");
    // No fabricated envelopes may leak into the stream.
    expect(body).not.toMatch(/(^|\n)data:/);
  });
});
