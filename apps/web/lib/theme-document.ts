/**
 * Single source of truth for applying `class="dark"` to `<html>` and
 * `data-control-plane-theme`.  Must stay in sync with the inline blocking
 * script in `components/theme/theme-script.tsx` (runs before React; cannot
 * import this module).
 */
export const CONTROL_PLANE_THEME_STORAGE_KEY = "control-plane:theme";
export const CONTROL_PLANE_DARK_CLASS = "dark";

/** Derive dark vs light from localStorage + system preference. */
export function shouldUseDarkFromStorageAndMedia(): boolean {
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(CONTROL_PLANE_THEME_STORAGE_KEY);
  } catch {
    // Unavailable in private mode / blocked storage: follow system.
  }
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return stored === "dark" || (stored == null && prefersDark);
}

/** Apply follow-storage-or-system (used on boot, after hydration, on system change). */
export function applyControlPlaneThemeFromStorage(): void {
  const shouldUseDark = shouldUseDarkFromStorageAndMedia();
  const root = document.documentElement;
  root.classList.toggle(CONTROL_PLANE_DARK_CLASS, shouldUseDark);
  root.dataset.controlPlaneTheme = shouldUseDark ? "dark" : "light";
}

/**
 * User explicitly picked light or dark (overrides "follow system" until
 * they clear the key, which the UI does not expose yet).
 */
export function applyUserThemeChoice(theme: "light" | "dark"): void {
  const root = document.documentElement;
  const isDark = theme === "dark";
  root.classList.toggle(CONTROL_PLANE_DARK_CLASS, isDark);
  root.dataset.controlPlaneTheme = isDark ? "dark" : "light";
  try {
    window.localStorage.setItem(CONTROL_PLANE_THEME_STORAGE_KEY, theme);
  } catch {
    // Class + dataset still updated.
  }
}
