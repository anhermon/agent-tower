import type { HarnessInfo } from "@control-plane/core";

interface HarnessListProps {
  readonly harnesses: readonly HarnessInfo[];
}

/** Read-only list of detected AI coding assistant harnesses on the local machine. */
export function HarnessList({ harnesses }: HarnessListProps) {
  if (harnesses.length === 0) {
    return (
      <p className="text-sm text-muted">
        No known harnesses detected on this machine.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {harnesses.map((h) => (
        <li
          key={h.kind}
          className="flex items-center gap-3 rounded-md border border-line bg-panel p-3 shadow-control"
        >
          <span
            aria-hidden="true"
            className="h-2 w-2 shrink-0 rounded-full bg-ok shadow-[0_0_6px_rgb(var(--color-ok))]"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-ink">{h.displayName}</span>
            <span
              className="block truncate font-mono text-xs text-muted/80"
              title={h.detectedPath}
            >
              {h.detectedPath}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
