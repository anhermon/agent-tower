"use client";

import { useCallback, useReducer, useRef, type ReactNode } from "react";

import type { WebhookEventType, WebhookSubscription } from "@control-plane/core";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";


// ---------------------------------------------------------------------------
// Event-type catalog (canonical values from @control-plane/core)
// ---------------------------------------------------------------------------

const EVENT_TYPE_OPTIONS: readonly { value: WebhookEventType; label: string }[] = [
  { value: "agent.changed", label: "Agent changed" },
  { value: "session.changed", label: "Session changed" },
  { value: "session.turn_created", label: "Session turn created" },
  { value: "tool_call.changed", label: "Tool call changed" },
  { value: "cost.recorded", label: "Cost recorded" },
  { value: "ticket.changed", label: "Ticket changed" },
  { value: "replay.completed", label: "Replay completed" },
] as const;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface SettingsState {
  readonly subscriptions: WebhookSubscription[];
  readonly form: FormState;
  readonly editingId: string | null;
  readonly deleteConfirmId: string | null;
  readonly saving: boolean;
  readonly error: string | null;
}

interface FormState {
  readonly displayName: string;
  readonly url: string;
  readonly eventTypes: readonly WebhookEventType[];
  readonly enabled: boolean;
  readonly secretRef: string;
}

const EMPTY_FORM: FormState = {
  displayName: "",
  url: "",
  eventTypes: [],
  enabled: true,
  secretRef: "",
};

type SettingsAction =
  | { type: "UPDATE_FORM"; patch: Partial<FormState> }
  | { type: "TOGGLE_EVENT"; eventType: WebhookEventType }
  | { type: "START_EDIT"; subscription: WebhookSubscription }
  | { type: "CANCEL_EDIT" }
  | { type: "START_DELETE"; id: string }
  | { type: "CANCEL_DELETE" }
  | { type: "SET_SAVING"; saving: boolean }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "ADD_SUBSCRIPTION"; subscription: WebhookSubscription }
  | { type: "UPDATE_SUBSCRIPTION"; subscription: WebhookSubscription }
  | { type: "DELETE_SUBSCRIPTION"; id: string };

function reducer(state: SettingsState, action: SettingsAction): SettingsState {
  switch (action.type) {
    case "UPDATE_FORM":
      return { ...state, form: { ...state.form, ...action.patch } };
    case "TOGGLE_EVENT": {
      const has = state.form.eventTypes.includes(action.eventType);
      return {
        ...state,
        form: {
          ...state.form,
          eventTypes: has
            ? state.form.eventTypes.filter((e) => e !== action.eventType)
            : [...state.form.eventTypes, action.eventType],
        },
      };
    }
    case "START_EDIT":
      return {
        ...state,
        editingId: action.subscription.id,
        deleteConfirmId: null,
        error: null,
        form: {
          displayName: action.subscription.displayName ?? "",
          url: action.subscription.url,
          eventTypes: [...action.subscription.eventTypes],
          enabled: action.subscription.enabled,
          secretRef: action.subscription.secretRef ?? "",
        },
      };
    case "CANCEL_EDIT":
      return { ...state, editingId: null, form: EMPTY_FORM, error: null };
    case "START_DELETE":
      return { ...state, deleteConfirmId: action.id };
    case "CANCEL_DELETE":
      return { ...state, deleteConfirmId: null };
    case "SET_SAVING":
      return { ...state, saving: action.saving };
    case "SET_ERROR":
      return { ...state, error: action.error };
    case "ADD_SUBSCRIPTION":
      return {
        ...state,
        subscriptions: [...state.subscriptions, action.subscription],
        form: EMPTY_FORM,
        editingId: null,
        error: null,
      };
    case "UPDATE_SUBSCRIPTION":
      return {
        ...state,
        subscriptions: state.subscriptions.map((s) =>
          s.id === action.subscription.id ? action.subscription : s
        ),
        form: EMPTY_FORM,
        editingId: null,
        error: null,
      };
    case "DELETE_SUBSCRIPTION":
      return {
        ...state,
        subscriptions: state.subscriptions.filter((s) => s.id !== action.id),
        deleteConfirmId: null,
      };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface WebhookSettingsClientProps {
  readonly initialSubscriptions: readonly WebhookSubscription[];
}

export function WebhookSettingsClient({ initialSubscriptions }: WebhookSettingsClientProps) {
  const [state, dispatch] = useReducer(reducer, {
    subscriptions: [...initialSubscriptions],
    form: EMPTY_FORM,
    editingId: null,
    deleteConfirmId: null,
    saving: false,
    error: null,
  });

  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = useCallback(async () => {
    const { form, editingId } = state;
    if (form.url.trim().length === 0 || form.eventTypes.length === 0) {
      dispatch({ type: "SET_ERROR", error: "URL and at least one event type are required." });
      return;
    }

    dispatch({ type: "SET_SAVING", saving: true });
    dispatch({ type: "SET_ERROR", error: null });

    try {
      if (editingId) {
        const res = await fetch(`/api/webhooks/subscriptions/${encodeURIComponent(editingId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            displayName: form.displayName,
            url: form.url,
            eventTypes: form.eventTypes,
            enabled: form.enabled,
            secretRef: form.secretRef,
          }),
        });
        const data = (await res.json()) as {
          ok: boolean;
          subscription?: WebhookSubscription;
          message?: string;
        };
        if (!data.ok) {
          dispatch({ type: "SET_ERROR", error: data.message ?? "Failed to update subscription." });
        } else if (data.subscription) {
          dispatch({ type: "UPDATE_SUBSCRIPTION", subscription: data.subscription });
        }
      } else {
        const res = await fetch("/api/webhooks/subscriptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            displayName: form.displayName,
            url: form.url,
            eventTypes: form.eventTypes,
            enabled: form.enabled,
            secretRef: form.secretRef,
          }),
        });
        const data = (await res.json()) as {
          ok: boolean;
          subscription?: WebhookSubscription;
          message?: string;
        };
        if (!data.ok) {
          dispatch({ type: "SET_ERROR", error: data.message ?? "Failed to create subscription." });
        } else if (data.subscription) {
          dispatch({ type: "ADD_SUBSCRIPTION", subscription: data.subscription });
        }
      }
    } catch {
      dispatch({ type: "SET_ERROR", error: "Network error — could not save subscription." });
    } finally {
      dispatch({ type: "SET_SAVING", saving: false });
    }
  }, [state]);

  const handleDelete = useCallback(async (id: string) => {
    dispatch({ type: "SET_SAVING", saving: true });
    try {
      const res = await fetch(`/api/webhooks/subscriptions/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { ok: boolean; message?: string };
      if (!data.ok) {
        dispatch({ type: "SET_ERROR", error: data.message ?? "Failed to delete subscription." });
      } else {
        dispatch({ type: "DELETE_SUBSCRIPTION", id });
      }
    } catch {
      dispatch({ type: "SET_ERROR", error: "Network error — could not delete subscription." });
    } finally {
      dispatch({ type: "SET_SAVING", saving: false });
    }
  }, []);

  const handleToggleEnabled = useCallback(async (subscription: WebhookSubscription) => {
    const res = await fetch(`/api/webhooks/subscriptions/${encodeURIComponent(subscription.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !subscription.enabled }),
    });
    const data = (await res.json()) as {
      ok: boolean;
      subscription?: WebhookSubscription;
      message?: string;
    };
    if (data.ok && data.subscription) {
      dispatch({ type: "UPDATE_SUBSCRIPTION", subscription: data.subscription });
    }
  }, []);

  const isEditing = state.editingId !== null;
  const formValid = state.form.url.trim().length > 0 && state.form.eventTypes.length > 0;

  return (
    <div className="space-y-8">
      {/* Subscription list */}
      <div>
        <h2 className="eyebrow mb-3">Registered subscriptions</h2>
        {state.subscriptions.length === 0 ? (
          <div className="rounded-xs border border-dashed border-line/80 bg-ink/[0.02] p-6 text-center text-sm text-muted">
            No subscriptions yet. Use the form below to register your first one.
          </div>
        ) : (
          <ul className="space-y-3">
            {state.subscriptions.map((sub) => (
              <SubscriptionRow
                key={sub.id}
                subscription={sub}
                isConfirmingDelete={state.deleteConfirmId === sub.id}
                onEdit={() => dispatch({ type: "START_EDIT", subscription: sub })}
                onToggleEnabled={() => handleToggleEnabled(sub)}
                onDeleteClick={() => dispatch({ type: "START_DELETE", id: sub.id })}
                onDeleteConfirm={() => handleDelete(sub.id)}
                onDeleteCancel={() => dispatch({ type: "CANCEL_DELETE" })}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Create / edit form */}
      <div className="rounded-lg border border-line bg-panel p-5 shadow-control">
        <h2 className="text-base font-semibold text-ink">
          {isEditing ? "Edit subscription" : "Register new subscription"}
        </h2>

        <form
          ref={formRef}
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Display name (optional)">
              <input
                className="input-text"
                placeholder="e.g. GitHub main repo"
                value={state.form.displayName}
                onChange={(e) =>
                  dispatch({ type: "UPDATE_FORM", patch: { displayName: e.target.value } })
                }
              />
            </Field>
            <Field label="Target URL *">
              <input
                className="input-text font-mono"
                placeholder="https://example.com/webhook"
                value={state.form.url}
                onChange={(e) => dispatch({ type: "UPDATE_FORM", patch: { url: e.target.value } })}
              />
            </Field>
          </div>

          <Field label="Secret reference (optional)">
            <input
              className="input-text font-mono"
              placeholder="env:MY_WEBHOOK_SECRET"
              value={state.form.secretRef}
              onChange={(e) =>
                dispatch({ type: "UPDATE_FORM", patch: { secretRef: e.target.value } })
              }
            />
            <p className="mt-1 text-xs text-muted">
              A pointer to the secret (e.g. <code>env:VAR_NAME</code>). The secret value is never
              stored here.
            </p>
          </Field>

          <div>
            <p className="eyebrow mb-2">Event types *</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {EVENT_TYPE_OPTIONS.map((opt) => {
                const checked = state.form.eventTypes.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    className={cn(
                      "flex cursor-pointer items-start gap-2 rounded-xs border p-2.5 transition-all",
                      checked
                        ? "border-cyan/60 bg-cyan/10"
                        : "border-line/80 bg-ink/[0.02] hover:border-info/60 hover:bg-info/10"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      className="mt-0.5 h-4 w-4 accent-[rgb(var(--color-cyan))]"
                      onChange={() => dispatch({ type: "TOGGLE_EVENT", eventType: opt.value })}
                    />
                    <span className="text-xs font-medium text-ink">{opt.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={state.form.enabled}
              className="h-4 w-4 accent-[rgb(var(--color-cyan))]"
              onChange={(e) =>
                dispatch({ type: "UPDATE_FORM", patch: { enabled: e.target.checked } })
              }
            />
            Active (start receiving events immediately)
          </label>

          {state.error ? (
            <p className="text-sm text-danger" role="alert">
              {state.error}
            </p>
          ) : null}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={!formValid || state.saving}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xs border border-transparent accent-gradient px-4 text-sm font-semibold text-[rgb(7_11_20)] shadow-glow disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon name="plus" className="h-4 w-4" />
              {state.saving ? "Saving…" : isEditing ? "Save changes" : "Register subscription"}
            </button>
            {isEditing ? (
              <button
                type="button"
                className="inline-flex h-10 items-center gap-2 rounded-xs border border-line/80 bg-ink/[0.04] px-3.5 text-sm font-medium text-ink hover:border-info/60"
                onClick={() => dispatch({ type: "CANCEL_EDIT" })}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SubscriptionRow
// ---------------------------------------------------------------------------

function SubscriptionRow({
  subscription,
  isConfirmingDelete,
  onEdit,
  onToggleEnabled,
  onDeleteClick,
  onDeleteConfirm,
  onDeleteCancel,
}: {
  readonly subscription: WebhookSubscription;
  readonly isConfirmingDelete: boolean;
  readonly onEdit: () => void;
  readonly onToggleEnabled: () => void;
  readonly onDeleteClick: () => void;
  readonly onDeleteConfirm: () => void;
  readonly onDeleteCancel: () => void;
}) {
  return (
    <li className="rounded-lg border border-line bg-panel p-4 shadow-control">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-ink">
              {subscription.displayName ?? subscription.url}
            </span>
            <span
              className={cn("pill text-[11px]", subscription.enabled ? "text-ok" : "text-muted")}
            >
              {subscription.enabled ? "Active" : "Paused"}
            </span>
          </div>
          {subscription.displayName ? (
            <p className="mt-0.5 truncate font-mono text-xs text-muted">{subscription.url}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {subscription.eventTypes.map((et) => (
              <span key={et} className="pill text-[11px] text-info">
                {et}
              </span>
            ))}
          </div>
          {subscription.secretRef ? (
            <p className="mt-2 font-mono text-[11px] text-muted">
              secret: {subscription.secretRef}
            </p>
          ) : null}
        </div>

        {isConfirmingDelete ? (
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-sm text-danger">Delete this subscription?</span>
            <button
              type="button"
              onClick={onDeleteConfirm}
              className="inline-flex h-8 items-center rounded-xs border border-danger/60 bg-danger/10 px-3 text-xs font-medium text-danger hover:bg-danger/20"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={onDeleteCancel}
              className="inline-flex h-8 items-center rounded-xs border border-line/80 bg-ink/[0.04] px-3 text-xs font-medium text-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onToggleEnabled}
              className="inline-flex h-8 items-center rounded-xs border border-line/80 bg-ink/[0.04] px-3 text-xs font-medium text-muted hover:border-info/60 hover:text-ink"
            >
              {subscription.enabled ? "Pause" : "Enable"}
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex h-8 items-center rounded-xs border border-line/80 bg-ink/[0.04] px-3 text-xs font-medium text-muted hover:border-info/60 hover:text-ink"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={onDeleteClick}
              className="inline-flex h-8 items-center rounded-xs border border-line/80 bg-ink/[0.04] px-3 text-xs font-medium text-muted hover:border-danger/60 hover:text-danger"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Field helper
// ---------------------------------------------------------------------------

function Field({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <span className="mt-2 block">{children}</span>
    </label>
  );
}
