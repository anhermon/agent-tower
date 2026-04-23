"use client";

import { useLayoutEffect } from "react";
import {
  applyControlPlaneThemeFromStorage,
  CONTROL_PLANE_THEME_STORAGE_KEY,
  shouldUseDarkFromStorageAndMedia,
} from "@/lib/theme-document";

/**
 * Re-applies theme on the client **after** React hydrates. The inline
 * `ThemeScript` still runs first (no flash); this repairs any case where
 * hydration drops `class="dark"` from `<html>`, and keeps
 * `prefers-color-scheme` in sync when the user has no explicit storage value.
 */
export function ThemeInitializer() {
  useLayoutEffect(() => {
    applyControlPlaneThemeFromStorage();
    // #region agent log
    try {
      const root = document.documentElement;
      const canvas = getComputedStyle(root).getPropertyValue("--color-canvas").trim();
      fetch("http://127.0.0.1:7735/ingest/3f85a983-40b3-4a81-90a2-c1548bdaf42b", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "fbf592" },
        body: JSON.stringify({
          sessionId: "fbf592",
          hypothesisId: "H-hydration",
          runId: "post-fix-2",
          location: "theme-initializer.tsx:useLayoutEffect",
          message: "post-hydration theme apply",
          data: {
            stored: (() => {
              try {
                return window.localStorage.getItem(CONTROL_PLANE_THEME_STORAGE_KEY);
              } catch {
                return null;
              }
            })(),
            htmlClass: root.className,
            hasDarkClass: root.classList.contains("dark"),
            colorCanvas: canvas,
            shouldUseDark: shouldUseDarkFromStorageAndMedia(),
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
    } catch {
      // ignore
    }
    // #endregion
  }, []);

  useLayoutEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      try {
        if (window.localStorage.getItem(CONTROL_PLANE_THEME_STORAGE_KEY) != null) return;
      } catch {
        return;
      }
      applyControlPlaneThemeFromStorage();
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return null;
}
