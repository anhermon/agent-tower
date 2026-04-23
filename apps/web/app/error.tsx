"use client";

import { ErrorState } from "@/components/ui/state";

export default function Error() {
  return (
    <ErrorState
      title="Dashboard failed to render"
      description="The shell caught a route error before live adapters were available."
    />
  );
}
