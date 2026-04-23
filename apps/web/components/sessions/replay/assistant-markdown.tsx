"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
// Use a dark theme that reads well against our panel backgrounds.
// eslint-disable-next-line import/no-unresolved -- subpath exports
import oneDark from "react-syntax-highlighter/dist/esm/styles/prism/one-dark";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

type Props = {
  readonly content: string;
  readonly className?: string;
};

/**
 * Renders Claude assistant text as GitHub-flavored markdown. Fenced code
 * blocks are rendered with Prism syntax highlighting and a copy button; inline
 * code blocks stay inline.
 */
export function AssistantMarkdown({ content, className }: Props) {
  return (
    <div className={cn("assistant-md text-sm leading-6 text-ink", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mt-4 mb-2 border-b border-line pb-1 text-lg font-bold first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-4 mb-2 text-base font-semibold first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-3 mb-1 text-sm font-semibold first:mt-0">{children}</h3>
          ),
          p: ({ children }) => (
            <p className="my-2 leading-relaxed first:mt-0 last:mb-0">{children}</p>
          ),
          ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed [&>p]:my-0">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-accent/40 pl-3 text-muted">
              {children}
            </blockquote>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-cyan underline decoration-cyan/50 underline-offset-2 hover:decoration-cyan"
            >
              {children}
            </a>
          ),
          strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
          em: ({ children }) => <em className="italic text-muted">{children}</em>,
          hr: () => <hr className="my-4 border-line" />,
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto rounded-md border border-line">
              <table className="w-full min-w-[16rem] border-collapse text-[13px]">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-white/[0.04]">{children}</thead>,
          th: ({ children }) => (
            <th className="border-b border-line px-2 py-1.5 text-left font-semibold">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border-b border-line/60 px-2 py-1.5 align-top">{children}</td>
          ),
          code: CodeRenderer,
          pre: ({ children }) => <>{children}</>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

type CodeProps = {
  readonly className?: string;
  readonly children?: React.ReactNode;
};

function CodeRenderer({ className, children }: CodeProps) {
  const languageMatch = /language-(\w+)/.exec(className ?? "");
  const raw = String(children ?? "");
  const isBlock = !!languageMatch || raw.includes("\n");
  if (!isBlock) {
    return (
      <code className="rounded-xs bg-white/[0.06] px-1.5 py-0.5 font-mono text-[12px] text-ink">
        {children}
      </code>
    );
  }
  const language = languageMatch?.[1] ?? "text";
  const stripped = raw.replace(/\n$/, "");
  return <CodeBlock code={stripped} language={language} />;
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard is best-effort; swallow.
    }
  };

  return (
    <div className="group relative my-3">
      <div className="absolute right-2 top-2 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
        <span className="rounded-xs border border-line/60 bg-black/50 px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted">
          {language}
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="rounded-xs border border-line/60 bg-black/50 px-2 py-0.5 font-mono text-[10px] uppercase text-muted hover:bg-black/70"
          aria-label="Copy code"
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <SyntaxHighlighter
        language={language}
        style={oneDark as { [key: string]: React.CSSProperties }}
        customStyle={{
          margin: 0,
          padding: "0.75rem",
          borderRadius: "0.5rem",
          background: "rgba(0,0,0,0.5)",
          fontSize: "12.5px",
          lineHeight: "1.55",
        }}
        wrapLongLines
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
