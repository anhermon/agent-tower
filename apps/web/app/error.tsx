"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/state";

// Next's App Router error boundary. `reset()` re-renders the failing segment
// without a full reload, which is what the in-UI "Retry" affordance should do.
export default function Error({
  error,
  reset,
}: {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    if (typeof console !== "undefined") {
      console.error("[control-plane] route error", error);
    }
  }, [error]);

  return (
    <ErrorState
      title="Dashboard failed to render"
      description="The shell caught a route error before live adapters were available."
      action={
        <Button
          type="button"
          onClick={reset}
          className="border-danger/40 bg-transparent text-danger hover:bg-danger/10"
        >
          Retry
        </Button>
      }
    />
  );
}
