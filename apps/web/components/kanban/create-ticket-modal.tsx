"use client";

import { useEffect, useRef, useState } from "react";

import { TICKET_PRIORITIES, type TicketPriority } from "@control-plane/core";

import { Button } from "@/components/ui/button";

interface Agent {
  readonly id: string;
  readonly name: string;
  readonly role: string;
}

interface CreateTicketModalProps {
  readonly onClose: () => void;
  readonly onCreated: () => void;
  readonly projectId?: string;
}

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  [TICKET_PRIORITIES.Low]: "Low",
  [TICKET_PRIORITIES.Normal]: "Normal",
  [TICKET_PRIORITIES.High]: "High",
  [TICKET_PRIORITIES.Urgent]: "Urgent",
};

export function CreateTicketModal({ onClose, onCreated, projectId }: CreateTicketModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TicketPriority>(TICKET_PRIORITIES.Normal);
  const [assigneeAgentId, setAssigneeAgentId] = useState("");
  const [agents, setAgents] = useState<readonly Agent[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Load agents for dropdown
  useEffect(() => {
    fetch("/api/kanban/agents")
      .then((r) => r.json() as Promise<{ ok: boolean; agents?: Agent[] }>)
      .then((data) => {
        if (data.ok && data.agents) setAgents(data.agents);
      })
      .catch(() => {
        /* agents dropdown degrades gracefully */
      });
  }, []);

  // Focus title on mount
  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        priority,
      };
      if (description.trim()) body.description = description.trim();
      if (assigneeAgentId) body.assigneeAgentId = assigneeAgentId;
      if (projectId) body.projectId = projectId;

      const res = await fetch("/api/kanban/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok: boolean; message?: string };
      if (!data.ok) {
        setError(data.message ?? "Failed to create ticket");
        return;
      }
      onCreated();
    } catch {
      setError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      ref={backdropRef}
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className="glass-panel w-full max-w-lg rounded-lg p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-ticket-title"
      >
        <h2 id="create-ticket-title" className="mb-5 text-lg font-semibold text-ink">
          New ticket
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Title */}
          <div>
            <label htmlFor="ticket-title" className="mb-1.5 block text-xs font-medium text-muted">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              id="ticket-title"
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short, descriptive title"
              className="w-full rounded-xs border border-line/80 bg-ink/[0.04] px-3 py-2 text-sm text-ink placeholder:text-muted/50 focus:border-info/60 focus:outline-none"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="ticket-description"
              className="mb-1.5 block text-xs font-medium text-muted"
            >
              Description
            </label>
            <textarea
              id="ticket-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Context, acceptance criteria, links…"
              rows={3}
              className="w-full resize-none rounded-xs border border-line/80 bg-ink/[0.04] px-3 py-2 text-sm text-ink placeholder:text-muted/50 focus:border-info/60 focus:outline-none"
            />
          </div>

          {/* Priority */}
          <div>
            <label
              htmlFor="ticket-priority"
              className="mb-1.5 block text-xs font-medium text-muted"
            >
              Priority
            </label>
            <select
              id="ticket-priority"
              aria-label="Priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as TicketPriority)}
              className="w-full rounded-xs border border-line/80 bg-ink/[0.04] px-3 py-2 text-sm text-ink focus:border-info/60 focus:outline-none"
            >
              {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Assignee */}
          <div>
            <label
              htmlFor="ticket-assignee"
              className="mb-1.5 block text-xs font-medium text-muted"
            >
              Assign to agent
            </label>
            <select
              id="ticket-assignee"
              aria-label="Assign to agent"
              value={assigneeAgentId}
              onChange={(e) => setAssigneeAgentId(e.target.value)}
              className="w-full rounded-xs border border-line/80 bg-ink/[0.04] px-3 py-2 text-sm text-ink focus:border-info/60 focus:outline-none"
            >
              <option value="">— unassigned —</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} ({agent.role})
                </option>
              ))}
            </select>
          </div>

          {error ? <p className="text-xs text-red-400">{error}</p> : null}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={submitting || !title.trim()}>
              {submitting ? "Creating…" : "Create ticket"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
