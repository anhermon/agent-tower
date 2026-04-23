"use client";

import { useLayoutEffect } from "react";

import {
  applyControlPlaneThemeFromStorage,
  CONTROL_PLANE_THEME_STORAGE_KEY,
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
