"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

/**
 * Client-side wrapper around `Button` that triggers a soft Next.js router
 * refresh. Replaces the previously inert `<Button>Refresh</Button>` pattern
 * that rendered on pages where data already re-fetches on navigation but
 * users still expected a usable refresh control.
 */
export function RefreshButton({ label = "Refresh" }: { readonly label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [justRefreshed, setJustRefreshed] = useState(false);

  return (
    <Button
      onClick={() =>
        startTransition(() => {
          router.refresh();
          setJustRefreshed(true);
          // Clear the "refreshed" hint on the next tick so rapid clicks don't
          // confuse users — the visual flash is just a successful-click ack.
          setTimeout(() => {
            setJustRefreshed(false);
          }, 800);
        })
      }
      disabled={pending}
      aria-label={label}
    >
      {pending ? "Refreshing…" : justRefreshed ? "Refreshed" : label}
    </Button>
  );
}
