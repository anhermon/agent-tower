import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({
  className,
  icon,
  children,
  variant = "secondary",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-xs border px-3.5 text-sm font-medium transition-all",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" &&
          "border-transparent accent-gradient text-[rgb(7_11_20)] shadow-glow hover:brightness-110 hover:-translate-y-px",
        variant === "secondary" &&
          "border-line/80 bg-white/[0.04] text-ink hover:-translate-y-px hover:border-info/50 hover:bg-info/10",
        variant === "ghost" &&
          "border-transparent bg-transparent text-muted hover:bg-white/5 hover:text-ink",
        className
      )}
      type="button"
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
