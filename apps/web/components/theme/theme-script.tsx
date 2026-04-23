const THEME_STORAGE_KEY = "control-plane:theme";
const DARK_THEME_CLASS = "dark";

// MUST stay aligned with `applyControlPlaneThemeFromStorage` in
// `lib/theme-document.ts` (this runs before the module graph loads).

const themeScript = `
(() => {
  try {
    const storageKey = "${THEME_STORAGE_KEY}";
    const darkClass = "${DARK_THEME_CLASS}";
    const storedTheme = window.localStorage.getItem(storageKey);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const shouldUseDark = storedTheme === "dark" || (storedTheme == null && prefersDark);
    const root = document.documentElement;
    root.classList.toggle(darkClass, shouldUseDark);
    root.dataset.controlPlaneTheme = shouldUseDark ? "dark" : "light";
  } catch {
    const root = document.documentElement;
    root.classList.remove("${DARK_THEME_CLASS}");
    root.dataset.controlPlaneTheme = "light";
  }
})();
`;

export function ThemeScript() {
  // biome-ignore lint/security/noDangerouslySetInnerHtml: controlled template string, required for flash-free theme hydration
  return <script dangerouslySetInnerHTML={{ __html: themeScript }} />;
}
