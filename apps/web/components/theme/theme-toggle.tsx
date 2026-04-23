"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

const THEME_STORAGE_KEY = "control-plane:theme";
const DARK_THEME_CLASS = "dark";

type Theme = "light" | "dark";

function getResolvedTheme(): Theme {
  if (typeof window === "undefined") {
    return "light";
  }

  return document.documentElement.classList.contains(DARK_THEME_CLASS) ? "dark" : "light";
}

function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle(DARK_THEME_CLASS, theme === "dark");
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Theme class still updates even when storage is unavailable.
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(getResolvedTheme());
  }, []);

  const nextTheme: Theme = theme === "dark" ? "light" : "dark";
  const label = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  return (
    <Button
      aria-label={label}
      aria-pressed={theme === "dark"}
      className="w-10 px-0"
      icon={<Icon name={theme === "dark" ? "sun" : "moon"} className="h-4 w-4" />}
      onClick={() => {
        applyTheme(nextTheme);
        setTheme(nextTheme);
      }}
    />
  );
}
