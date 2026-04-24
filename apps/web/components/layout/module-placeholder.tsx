import { Badge, PhaseBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/state";

import type { ModuleDefinition } from "@/types/control-plane";
import type { ReactNode } from "react";

export interface CapabilityPreview {
  /** Short label for the preview card (e.g. "Deliveries"). */
  readonly label: string;
  /** Why this value is a dash — shown under the value as small muted text. */
  readonly detail: string;
}

interface ModulePlaceholderProps {
  /** The registry entry for this module; drives header label + phase badge. */
  readonly module: ModuleDefinition;
  /** Expanded one-to-two sentence description of what the module will do. */
  readonly description: string;
  /** Title shown in the central EmptyState. Preserves existing e2e wording. */
  readonly emptyTitle: string;
  /** Matching EmptyState description. */
  readonly emptyDescription: string;
  /** 2–4 dimmed capability cards. Values render as `—`. */
  readonly capabilities: readonly CapabilityPreview[];
  /** Optional trailing content rendered below the empty state. */
  readonly children?: ReactNode;
}

/**
 * Shared polished empty state for deferred / skeleton modules.
 *
 * Renders:
 *   - PageHeader-style banner with module label + adapter health Badge + PhaseBadge.
 *   - Capability preview grid (dimmed, `—` values, no fabricated data).
 *   - The canonical EmptyState block.
 *   - Footer link pointing at the module's spec in docs/modules.
 */
export function ModulePlaceholder({
  module,
  description,
  emptyTitle,
  emptyDescription,
  capabilities,
  children,
}: ModulePlaceholderProps) {
  return (
    <section>
      <header className="mb-6 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">Module</p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-ink md:text-[34px]">
              {module.label}
            </h1>
            <Badge state={module.status} />
            <PhaseBadge phase={module.phase} />
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">{description}</p>
        </div>
      </header>

      {capabilities.length > 0 ? (
        <dl
          className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          aria-label={`${module.label} capability preview`}
        >
          {capabilities.map((capability) => (
            <div
              key={capability.label}
              className="glass-panel-soft rounded-sm p-4 opacity-70"
              aria-disabled="true"
            >
              <dt className="eyebrow">{capability.label}</dt>
              <dd className="mt-2 text-2xl font-semibold text-muted-strong">—</dd>
              <p className="mt-1 text-xs leading-5 text-muted">{capability.detail}</p>
            </div>
          ))}
        </dl>
      ) : null}

      <EmptyState title={emptyTitle} description={emptyDescription} />

      {children}

      <p className="mt-5 text-xs text-muted">
        Spec:{" "}
        {/* Inert path label — the referenced markdown lives in the repo, not
            under `public/`, so a real anchor would 404. Render as code so
            users know where to look in the source tree. */}
        <code
          className="rounded bg-soft px-1.5 py-0.5 font-mono text-[11px] text-muted-strong"
          title="Relative to the repository root"
        >
          {module.docs}
        </code>
      </p>
    </section>
  );
}
