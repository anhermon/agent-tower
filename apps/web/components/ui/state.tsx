import type { ReactNode } from "react";

interface StateBlockProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export function LoadingState({ title = "Loading", description }: Partial<StateBlockProps>) {
  return (
    <div className="flex min-h-48 items-center justify-center rounded-md border border-dashed border-line/70 bg-white/[0.02] p-6">
      <div className="flex max-w-sm items-center gap-4">
        <span className="h-9 w-9 animate-pulse rounded-full border-4 border-line/70 border-t-cyan" />
        <div>
          <p className="text-sm font-semibold text-ink">{title}</p>
          <p className="mt-1 text-sm text-muted">
            {description ?? "Fetching the latest control-plane state."}
          </p>
        </div>
      </div>
    </div>
  );
}

export function EmptyState({ title, description, action }: StateBlockProps) {
  return (
    <div className="flex min-h-48 items-center justify-center rounded-md border border-dashed border-line/70 bg-white/[0.02] p-6 text-center">
      <div className="max-w-sm">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mt-2 text-sm leading-6 text-muted">{description}</p>
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </div>
  );
}

export function ErrorState({ title, description, action }: StateBlockProps) {
  return (
    <div
      role="alert"
      className="flex min-h-48 items-center justify-center rounded-md border border-danger/40 bg-danger/[0.08] p-6 text-center"
    >
      <div className="max-w-sm">
        <p className="text-sm font-semibold text-danger">{title}</p>
        <p className="mt-2 text-sm leading-6 text-danger/90">{description}</p>
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </div>
  );
}
