"use client";

import { useLayoutEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { applyUserThemeChoice, CONTROL_PLANE_DARK_CLASS } from "@/lib/theme-document";

type Theme = "light" | "dark";

function getResolvedTheme(): Theme {
  if (typeof window === "undefined") {
    return "light";
  }

  return document.documentElement.classList.contains(CONTROL_PLANE_DARK_CLASS) ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useLayoutEffect(() => {
    // ThemeInitializer already re-synced <html> after hydration; read icon state.
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
        applyUserThemeChoice(nextTheme);
        setTheme(nextTheme);
      }}
    />
  );
}
