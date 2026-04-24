import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { WebhookTimelineStep } from "../types";

interface ProcessingTimelineProps {
  readonly steps: readonly WebhookTimelineStep[];
  readonly isActive: boolean;
  readonly processingMs?: number;
  readonly retryCount?: number;
  readonly maxRetries?: number;
}

/* ─── Icons ─── */

function CheckIcon({ className }: { readonly className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2.5}
      viewBox="0 0 24 24"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon({ className }: { readonly className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2.5}
      viewBox="0 0 24 24"
    >
      <line x1={18} x2={6} y1={6} y2={18} />
      <line x1={6} x2={18} y1={6} y2={18} />
    </svg>
  );
}

function DotIcon({ className }: { readonly className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
      <circle cx={12} cy={12} r={6} />
    </svg>
  );
}

function SkullIcon({ className }: { readonly className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <circle cx={9} cy={12} fill="currentColor" r={1.5} stroke="none" />
      <circle cx={15} cy={12} fill="currentColor" r={1.5} stroke="none" />
      <path d="M9 16h6" />
      <path d="M10 20v2" />
      <path d="M14 20v2" />
      <path d="M12 2a7 7 0 0 0-7 7c0 2 1 3 2 4l-1 3h12l-1-3c1-1 2-2 2-4a7 7 0 0 0-7-7z" />
    </svg>
  );
}

/* ─── Constants ─── */

const STEP_LABELS: Record<WebhookTimelineStep["step"], string> = {
  triggered: "Triggered",
  queued: "Queued",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
  dlq: "DLQ",
};

const STEP_COLORS: Record<WebhookTimelineStep["step"], string> = {
  triggered: "text-info",
  queued: "text-warn",
  processing: "text-purple-500",
  completed: "text-ok",
  failed: "text-danger",
  dlq: "text-red-700",
};

/* ─── Helpers ─── */

function getConnectorStyle(
  currentStep: WebhookTimelineStep,
  nextStep: WebhookTimelineStep
): string {
  if (currentStep.status === "failed") {
    return "border-t-2 border-danger/50";
  }
  if (currentStep.status === "completed" && nextStep.status === "completed") {
    return "border-t-2 border-ok/50";
  }
  return "border-t-2 border-dashed border-muted/40";
}

function StepIconComponent({
  step,
  isFailedTimeline,
  isActive,
}: {
  readonly step: WebhookTimelineStep;
  readonly isFailedTimeline: boolean;
  readonly isActive: boolean;
}) {
  const isGrayedOut = isFailedTimeline && step.status === "pending";
  const isProcessingActive = step.step === "processing" && isActive && step.status === "pending";

  if (step.step === "dlq") {
    return <SkullIcon className={cn("h-5 w-5", isGrayedOut ? "text-muted" : "text-red-700")} />;
  }

  if (step.status === "failed") {
    return <XIcon className="h-5 w-5 text-danger" />;
  }

  if (step.status === "completed") {
    return <CheckIcon className={cn("h-5 w-5", STEP_COLORS[step.step] ?? "text-ok")} />;
  }

  if (isProcessingActive) {
    return (
      <DotIcon className={cn("h-5 w-5 animate-pulse", STEP_COLORS[step.step] ?? "text-muted")} />
    );
  }

  return (
    <DotIcon
      className={cn(
        "h-5 w-5",
        isGrayedOut ? "text-muted" : (STEP_COLORS[step.step] ?? "text-muted")
      )}
    />
  );
}

function getStepBorderColor(step: WebhookTimelineStep, isGrayedOut: boolean): string {
  if (isGrayedOut) return "border-muted";
  if (step.status === "failed") return "border-danger";
  if (step.status === "completed") return "border-current";
  return "border-muted";
}

/* ─── Component ─── */

export function ProcessingTimeline({
  steps,
  isActive,
  processingMs,
  retryCount,
  maxRetries,
}: ProcessingTimelineProps) {
  const failedIndex = steps.findIndex((s) => s.status === "failed");
  const hasFailure = failedIndex !== -1;

  return (
    <div className="space-y-4">
      {/* Timeline */}
      <div
        className="relative grid"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      >
        {steps.map((step, i) => {
          const isGrayedOut = hasFailure && i > failedIndex;
          const borderColor = getStepBorderColor(step, isGrayedOut);

          return (
            <div key={step.step} className="flex flex-col items-center text-center relative">
              {/* Connector line to next step */}
              {i < steps.length - 1 && (
                <div
                  className={cn(
                    "absolute left-1/2 top-5 h-0 z-0",
                    getConnectorStyle(step, steps[i + 1])
                  )}
                  style={{ width: "100%" }}
                />
              )}

              {/* Icon ring */}
              <div
                className={cn(
                  "relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 bg-panel",
                  borderColor,
                  isGrayedOut && "text-muted"
                )}
              >
                <StepIconComponent step={step} isFailedTimeline={hasFailure} isActive={isActive} />
              </div>

              {/* Label */}
              <span
                className={cn("mt-2 text-xs font-medium", isGrayedOut ? "text-muted" : "text-ink")}
              >
                {STEP_LABELS[step.step]}
              </span>

              {/* Timestamp */}
              <span className="mt-1 text-[10px] text-muted">{step.timestamp}</span>

              {/* Duration */}
              {step.durationMs !== undefined && (
                <span className="mt-0.5 text-[10px] text-muted/70">{step.durationMs}ms</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Error message */}
      {steps.map((step) =>
        step.error ? (
          <div
            key={`error-${step.step}`}
            className="rounded-xs border border-danger/30 bg-danger/10 px-3 py-2"
          >
            <p className="text-xs font-semibold text-danger">{STEP_LABELS[step.step]} Error</p>
            <p className="mt-1 text-xs leading-relaxed text-danger/80">{step.error}</p>
          </div>
        ) : null
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-muted">
        {processingMs !== undefined && <span>Total: {formatDuration(processingMs)}</span>}
        {retryCount !== undefined && maxRetries !== undefined && (
          <span>
            Retry {retryCount}/{maxRetries}
          </span>
        )}
      </div>
    </div>
  );
}
