"use client";

import { useState } from "react";

import type { JsonValue } from "@control-plane/core";

import { cn } from "@/lib/utils";

interface TodoItem {
  readonly content: string;
  readonly status: "pending" | "in_progress" | "completed" | string;
  readonly activeForm?: string;
}

interface Props {
  readonly input: JsonValue;
}

function extractTodosArray(input: JsonValue): JsonValue[] | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const obj = input as Record<string, JsonValue>;
  const todos = obj.todos;
  return Array.isArray(todos) ? todos : null;
}

function parseSingleTodo(raw: JsonValue): TodoItem | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, JsonValue>;
  const content = r.content;
  const status = r.status;
  if (typeof content !== "string" || typeof status !== "string") return null;
  return {
    content,
    status,
    activeForm: typeof r.activeForm === "string" ? r.activeForm : undefined,
  };
}

function parseTodos(input: JsonValue): readonly TodoItem[] | null {
  const todosArray = extractTodosArray(input);
  if (!todosArray) return null;
  const parsed: TodoItem[] = [];
  for (const raw of todosArray) {
    const item = parseSingleTodo(raw);
    if (item) parsed.push(item);
  }
  return parsed.length > 0 ? parsed : null;
}

const STATUS_TONE: Record<string, { icon: string; text: string }> = {
  completed: { icon: "✓", text: "text-ok" },
  in_progress: { icon: "◐", text: "text-info" },
  pending: { icon: "◯", text: "text-muted" },
};

export function TodoWritePanel({ input }: Props) {
  const [open, setOpen] = useState(true);
  const todos = parseTodos(input);
  if (!todos) return null;

  const completed = todos.filter((t) => t.status === "completed").length;
  const total = todos.length;

  return (
    <div className="my-2 rounded-md border border-line/60 bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-white/[0.04]"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span aria-hidden>☑︎</span>
          TodoWrite
          <span className="font-mono text-xs text-muted">
            {completed}/{total}
          </span>
        </span>
        <span
          className={cn("shrink-0 text-xs text-muted transition-transform", open && "rotate-180")}
        >
          ▾
        </span>
      </button>
      {open ? (
        <ul className="space-y-1 border-t border-line/60 px-3 py-2">
          {todos.map((todo, i) => {
            const tone = STATUS_TONE[todo.status] ?? STATUS_TONE.pending;
            return (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className={cn("mt-0.5 font-mono text-xs", tone.text)} aria-hidden>
                  {tone.icon}
                </span>
                <span
                  className={cn(
                    "flex-1 leading-relaxed",
                    todo.status === "completed" ? "text-muted line-through" : "text-ink"
                  )}
                >
                  {todo.status === "in_progress" && todo.activeForm
                    ? todo.activeForm
                    : todo.content}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
