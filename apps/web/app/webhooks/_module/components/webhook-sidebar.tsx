"use client";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

import { WEBHOOK_PROVIDER_CATALOG } from "../catalog";
import { getIntegrationStatus } from "../state";

import type {
  RegisteredWebhookIntegration,
  WebhookIntegrationStatus,
  WebhookProviderId,
} from "../types";

interface WebhookSidebarProps {
  readonly selectedView: "overview" | WebhookProviderId | "dlq" | "add";
  readonly integrations: RegisteredWebhookIntegration[];
  readonly dlqCount: number;
  readonly onSelectView: (view: "overview" | WebhookProviderId | "dlq" | "add") => void;
  readonly isOpen?: boolean;
  readonly onClose?: () => void;
}

const STATUS_TONES: Record<WebhookIntegrationStatus, string> = {
  live: "text-ok",
  planned: "text-warn",
  setup: "text-muted",
};

const STATUS_LABELS: Record<WebhookIntegrationStatus, string> = {
  live: "Live",
  planned: "Planned",
  setup: "Setup",
};

export function WebhookSidebar({
  selectedView,
  integrations,
  dlqCount,
  onSelectView,
  isOpen,
  onClose,
}: WebhookSidebarProps) {
  return (
    <>
      {/* Mobile overlay backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-line/80 bg-panel transition-all lg:static",
          "w-[180px]",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b border-line/80 px-4">
          <Icon name="hook" className="h-5 w-5 text-cyan" />
          <span className="text-sm font-semibold text-ink">Webhooks</span>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto p-3">
          {/* Overview Group */}
          <div>
            <p className="eyebrow px-2">Overview</p>
            <SidebarItem
              icon="grid"
              label="All Events"
              isActive={selectedView === "overview"}
              onClick={() => onSelectView("overview")}
            />
          </div>

          {/* Integrations Group */}
          <div>
            <p className="eyebrow px-2">Integrations</p>
            <div className="mt-1 space-y-1">
              {integrations.length === 0 ? (
                <p className="px-2 py-2 text-xs text-muted">No integrations</p>
              ) : (
                integrations.map((integration) => {
                  const status = getIntegrationStatus(integration);
                  return (
                    <SidebarItem
                      key={integration.id}
                      icon="plug"
                      label={integration.name}
                      badge={STATUS_LABELS[status]}
                      badgeTone={STATUS_TONES[status]}
                      isActive={selectedView === integration.providerId}
                      onClick={() => onSelectView(integration.providerId)}
                    />
                  );
                })
              )}
            </div>
          </div>

          {/* Manage Group */}
          <div>
            <p className="eyebrow px-2">Manage</p>
            <div className="mt-1 space-y-1">
              <SidebarItem
                icon="plus"
                label="Add Integration"
                isActive={selectedView === "add"}
                onClick={() => onSelectView("add")}
              />
              <SidebarItem
                icon="bell"
                label="Dead Letter Queue"
                badge={dlqCount > 0 ? String(dlqCount) : undefined}
                badgeTone={dlqCount > 0 ? "text-danger" : undefined}
                isActive={selectedView === "dlq"}
                onClick={() => onSelectView("dlq")}
              />
            </div>
          </div>
        </nav>
      </aside>
    </>
  );
}

function SidebarItem({
  icon,
  label,
  isActive,
  onClick,
  badge,
  badgeTone,
}: {
  readonly icon: "grid" | "plug" | "plus" | "bell" | "hook";
  readonly label: string;
  readonly isActive: boolean;
  readonly onClick: () => void;
  readonly badge?: string;
  readonly badgeTone?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-xs px-2 py-2 text-left text-sm transition-all",
        isActive
          ? "border border-cyan/70 bg-cyan/10 shadow-glow"
          : "border border-transparent hover:border-info/60 hover:bg-info/10"
      )}
    >
      <Icon name={icon} className="h-4 w-4 shrink-0 text-muted" />
      <span className={cn("flex-1 truncate", isActive ? "text-ink" : "text-muted")}>{label}</span>
      {badge && <span className={cn("pill text-[11px]", badgeTone ?? "text-muted")}>{badge}</span>}
    </button>
  );
}
