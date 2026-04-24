"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";

type RootShellProps = {
  readonly children: ReactNode;
};

const STANDALONE_PREFIXES = ["/webhooks/standalone"] as const;

export function RootShell({ children }: RootShellProps) {
  const pathname = usePathname() ?? "";
  const standalone = STANDALONE_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (standalone) {
    return <>{children}</>;
  }

  return <AppShell>{children}</AppShell>;
}
