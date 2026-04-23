import type { ReplayData } from "@control-plane/core";

type Props = {
  readonly replay: ReplayData;
};

interface PrLink {
  readonly url: string;
  readonly title?: string;
}

const PR_URL_RE =
  /https?:\/\/(?:github\.com|gitlab\.com|bitbucket\.org)\/[^\s"'<>]+?\/(?:pull|pull-requests|merge_requests)\/\d+/g;

/**
 * Scans the replay for PR links in either explicit `pr-link` metadata entries
 * or substrings of assistant text / tool inputs / tool results. Best-effort —
 * renders nothing when no PR URL is found.
 */
function extractPrLinks(replay: ReplayData): readonly PrLink[] {
  const hits = new Map<string, string | undefined>();

  const scan = (text: string | undefined): void => {
    if (!text) return;
    const matches = text.match(PR_URL_RE);
    if (!matches) return;
    for (const url of matches) {
      if (!hits.has(url)) hits.set(url, undefined);
    }
  };

  for (const turn of replay.turns) {
    scan(turn.text);
    scan(turn.thinkingText);
    if (turn.toolCalls) {
      for (const tc of turn.toolCalls) scan(JSON.stringify(tc.input));
    }
    if (turn.toolResults) {
      for (const tr of turn.toolResults) scan(tr.content);
    }
  }

  return Array.from(hits, ([url, title]) => ({ url, title }));
}

export function PrLinkCard({ replay }: Props) {
  const links = extractPrLinks(replay);
  if (links.length === 0) return null;

  return (
    <section className="glass-panel rounded-md p-4">
      <p className="eyebrow">Pull requests</p>
      <ul className="mt-2 space-y-2">
        {links.map((link) => (
          <li key={link.url} className="flex items-center gap-2">
            <span aria-hidden className="text-accent">
              ◆
            </span>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all font-mono text-xs text-cyan hover:underline"
            >
              {link.url.replace(/^https?:\/\//, "")}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
