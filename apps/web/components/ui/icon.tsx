import type { ModuleDefinition } from "@/types/control-plane";

interface IconProps {
  name:
    | ModuleDefinition["icon"]
    | "search"
    | "bell"
    | "chevron"
    | "trend-up"
    | "trend-down"
    | "minus"
    | "plus"
    | "sun"
    | "moon";
  className?: string;
}

const paths: Record<IconProps["name"], string> = {
  grid: "M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z",
  terminal: "m4 7 5 5-5 5m8 0h8",
  hook: "M8 4v9a4 4 0 1 0 4-4h-1m5-5v10a4 4 0 1 1-4-4h1",
  agent: "M12 4v3m-5 4a5 5 0 0 1 10 0v5a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3v-5Zm2 1h.01M15 12h.01",
  board: "M5 4h14v16H5V4Zm5 0v16m5-16v16",
  bolt: "m13 2-8 12h6l-1 8 8-12h-6l1-8Z",
  plug: "M9 7V3m6 4V3M7 7h10v4a5 5 0 0 1-10 0V7Zm5 9v5",
  signal: "M5 12a7 7 0 0 1 14 0m-4 0a3 3 0 0 0-6 0m3 4h.01",
  replay: "M4 12a8 8 0 1 0 2.34-5.66L4 8m0 0V3m0 5h5",
  search: "M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Zm5.3-2.2L21 21",
  bell: "M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-4 12a2 2 0 0 1-4 0",
  chevron: "m9 18 6-6-6-6",
  "trend-up": "M4 17 10 11l4 4 6-8m0 0h-5m5 0v5",
  "trend-down": "m4 7 6 6 4-4 6 8m0 0v-5m0 5h-5",
  minus: "M5 12h14",
  plus: "M12 5v14M5 12h14",
  sun: "M12 4V2m0 20v-2m8-8h2M2 12h2m13.66-5.66 1.41-1.41M4.93 19.07l1.41-1.41m0-11.32L4.93 4.93m14.14 14.14-1.41-1.41M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  moon: "M21 14.5A8.5 8.5 0 0 1 9.5 3 7 7 0 1 0 21 14.5Z",
};

export function Icon({ name, className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    >
      <path d={paths[name]} />
    </svg>
  );
}
