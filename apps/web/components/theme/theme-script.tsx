const THEME_STORAGE_KEY = "control-plane:theme";
const DARK_THEME_CLASS = "dark";

const themeScript = `
(() => {
  try {
    const storageKey = "${THEME_STORAGE_KEY}";
    const darkClass = "${DARK_THEME_CLASS}";
    const storedTheme = window.localStorage.getItem(storageKey);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const shouldUseDark = storedTheme === "dark" || (!storedTheme && prefersDark);
    document.documentElement.classList.toggle(darkClass, shouldUseDark);
  } catch {
    document.documentElement.classList.remove("${DARK_THEME_CLASS}");
  }
})();
`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: themeScript }} />;
}
