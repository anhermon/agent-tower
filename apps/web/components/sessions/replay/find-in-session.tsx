"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface Props {
  /** Only captures ⌘F/Ctrl+F when true — the caller toggles this when the
   *  replay panel has focus so we don't hijack the global browser find. */
  readonly enabled?: boolean;
  /** Selector of the scrollable element whose text we'll search. */
  readonly targetSelector?: string;
}

const HIGHLIGHT_CLASS = "cp-find-hit";
const ACTIVE_CLASS = "cp-find-active";

/**
 * In-page find overlay. Activates on ⌘F / Ctrl+F and hijacks the default
 * browser find when `enabled` is true. Uses window.find as a low-cost
 * highlighter via a naive text-walker — no external dependencies.
 */
export function FindInSession({ enabled = true, targetSelector = "[data-find-scope]" }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<readonly HTMLElement[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const clearHighlights = useCallback(() => {
    const prior = document.querySelectorAll<HTMLElement>(`.${HIGHLIGHT_CLASS}`);
    prior.forEach((el) => {
      const parent = el.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(el.textContent ?? ""), el);
      parent.normalize();
    });
  }, []);

  const applyHighlights = useCallback(
    (q: string): HTMLElement[] => {
      if (!q) return [];
      const scope = document.querySelector(targetSelector);
      if (!scope) return [];
      const re = new RegExp(escapeRegExp(q), "gi");
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
          if (!(node.parentElement instanceof HTMLElement)) return NodeFilter.FILTER_REJECT;
          const tag = node.parentElement.tagName;
          if (tag === "SCRIPT" || tag === "STYLE") return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      const hits: HTMLElement[] = [];
      const textNodes: Text[] = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
      for (const tn of textNodes) {
        const text = tn.nodeValue ?? "";
        if (!re.test(text)) continue;
        re.lastIndex = 0;
        const frag = document.createDocumentFragment();
        let last = 0;
        let m: RegExpExecArray | null = re.exec(text);
        while (m !== null) {
          if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
          const mark = document.createElement("mark");
          mark.className = HIGHLIGHT_CLASS;
          mark.textContent = m[0];
          frag.appendChild(mark);
          hits.push(mark);
          last = m.index + m[0].length;
          m = re.exec(text);
        }
        if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
        tn.parentNode?.replaceChild(frag, tn);
      }
      return hits;
    },
    [targetSelector]
  );

  const runSearch = useCallback(
    (q: string) => {
      clearHighlights();
      const hits = applyHighlights(q);
      setMatches(hits);
      setActive(hits.length > 0 ? 0 : -1);
      if (hits.length > 0) scrollActive(hits, 0);
    },
    [applyHighlights, clearHighlights]
  );

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    clearHighlights();
    setMatches([]);
    setActive(0);
  }, [clearHighlights]);

  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent): void => {
      const isFind = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f";
      if (isFind) {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      } else if (e.key === "Escape" && open) {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, open, close]);

  useEffect(() => {
    if (!open) return;
    runSearch(query);
  }, [query, open, runSearch]);

  const total = matches.length;

  const next = useCallback(() => {
    if (total === 0) return;
    const i = (active + 1) % total;
    setActive(i);
    scrollActive(matches, i);
  }, [active, matches, total]);

  const prev = useCallback(() => {
    if (total === 0) return;
    const i = (active - 1 + total) % total;
    setActive(i);
    scrollActive(matches, i);
  }, [active, matches, total]);

  // active highlight
  useEffect(() => {
    matches.forEach((m, i) => {
      m.classList.toggle(ACTIVE_CLASS, i === active);
    });
  }, [matches, active]);

  // Always-mounted style shim (no global CSS change).
  const styleTag = useMemo(
    () =>
      `.${HIGHLIGHT_CLASS}{background:rgba(234,179,8,0.28);color:inherit;border-radius:2px;}` +
      `.${HIGHLIGHT_CLASS}.${ACTIVE_CLASS}{background:rgba(250,204,21,0.75);color:#111;}`,
    []
  );

  if (!open) return <style>{styleTag}</style>;

  return (
    <>
      <style>{styleTag}</style>
      <div
        role="dialog"
        aria-label="Find in session"
        className={cn(
          "fixed right-6 top-20 z-50 flex items-center gap-2 rounded-md border border-line bg-panel/95 px-3 py-2 shadow-xl backdrop-blur"
        )}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (e.shiftKey) prev();
              else next();
            }
          }}
          className="h-8 w-56 rounded-xs border border-line/60 bg-black/30 px-2 font-mono text-xs text-ink outline-none focus:border-cyan"
          placeholder="Find…"
        />
        <span className="font-mono text-xs text-muted">
          {total === 0 ? "0" : `${active + 1}/${total}`}
        </span>
        <button
          type="button"
          onClick={prev}
          className="rounded-xs border border-line/60 px-1.5 py-1 text-xs text-muted hover:text-cyan"
          aria-label="Previous match"
        >
          ↑
        </button>
        <button
          type="button"
          onClick={next}
          className="rounded-xs border border-line/60 px-1.5 py-1 text-xs text-muted hover:text-cyan"
          aria-label="Next match"
        >
          ↓
        </button>
        <button
          type="button"
          onClick={close}
          className="rounded-xs border border-line/60 px-1.5 py-1 text-xs text-muted hover:text-danger"
          aria-label="Close find"
        >
          ✕
        </button>
      </div>
    </>
  );
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function scrollActive(hits: readonly HTMLElement[], index: number): void {
  const el = hits[index];
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
}
