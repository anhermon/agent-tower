import { AppShell } from "@/components/layout/app-shell";
import { ThemeInitializer } from "@/components/theme/theme-initializer";
import { ThemeScript } from "@/components/theme/theme-script";

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Modular Agents Control Plane",
  description: "Operational dashboard shell for modular agent orchestration.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent" },
  icons: [{ rel: "icon", url: "/icon.svg", type: "image/svg+xml" }],
};

export const viewport: Viewport = {
  themeColor: "#06b6d4",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <ThemeInitializer />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
