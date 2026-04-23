interface WebhookSecretBannerProps {
  readonly secretRef: string | undefined;
}

/**
 * Deliberately read-only banner. Secret management (creating, rotating, or
 * revealing secret values) is out of scope for Phase 2 v1 — see
 * `docs/architecture/security.md`. This component only surfaces the
 * `secretRef` pointer when the configuration provides one, so operators
 * can see _which_ secret is expected without ever reading the value.
 */
export function WebhookSecretBanner({ secretRef }: WebhookSecretBannerProps) {
  return (
    <div className="rounded-md border border-warn/40 bg-warn/[0.08] p-4 text-sm">
      <p className="font-semibold text-warn">Secret management is unavailable</p>
      <p className="mt-1 text-warn/90">
        Reading, writing, and rotating webhook secrets is not available in Phase 2 v1. Webhook
        secrets must be stored separately from display configuration — see{" "}
        <code className="font-mono text-xs">docs/architecture/security.md</code>.
      </p>
      <p className="mt-3 text-xs text-warn/80">
        <span className="font-mono uppercase tracking-wider text-warn/70">secretRef</span>{" "}
        {secretRef ? (
          <code className="ml-2 break-all font-mono text-xs text-ink">{secretRef}</code>
        ) : (
          <span className="ml-2 text-warn/70">— none declared —</span>
        )}
      </p>
    </div>
  );
}
