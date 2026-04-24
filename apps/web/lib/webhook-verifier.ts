import { createHmac, timingSafeEqual } from "node:crypto";

export interface WebhookVerificationResult {
  readonly verified: boolean;
  readonly provider: string;
  readonly eventId?: string;
  readonly eventType?: string;
}

export interface WebhookVerifier {
  readonly provider: string;
  verify(request: Request, rawBody: string, secret: string): WebhookVerificationResult;
  extractEventId(headers: Headers): string | undefined;
  extractEventType(headers: Headers): string | undefined;
}

export class GitHubWebhookVerifier implements WebhookVerifier {
  readonly provider = "github";

  verify(_request: Request, rawBody: string, secret: string): WebhookVerificationResult {
    const signatureHeader = _request.headers.get("x-hub-signature-256") ?? "";
    if (!signatureHeader) {
      return { verified: false, provider: this.provider };
    }

    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const actual = signatureHeader.replace(/^sha256=/, "");

    try {
      const verified =
        actual.length === expected.length &&
        timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
      return {
        verified,
        provider: this.provider,
        eventId: this.extractEventId(_request.headers),
        eventType: this.extractEventType(_request.headers),
      };
    } catch {
      return { verified: false, provider: this.provider };
    }
  }

  extractEventId(headers: Headers): string | undefined {
    return headers.get("x-github-delivery") ?? undefined;
  }

  extractEventType(headers: Headers): string | undefined {
    return headers.get("x-github-event") ?? undefined;
  }
}

export class SlackWebhookVerifier implements WebhookVerifier {
  readonly provider = "slack";

  verify(request: Request, rawBody: string, secret: string): WebhookVerificationResult {
    const timestampHeader = request.headers.get("x-slack-request-timestamp") ?? "";
    const signatureHeader = request.headers.get("x-slack-signature") ?? "";

    if (!timestampHeader || !signatureHeader) {
      return { verified: false, provider: this.provider };
    }

    const timestamp = Number(timestampHeader);
    const now = Math.floor(Date.now() / 1000);
    if (Number.isNaN(timestamp) || Math.abs(now - timestamp) > 300) {
      return { verified: false, provider: this.provider };
    }

    const baseString = `v0:${timestampHeader}:${rawBody}`;
    const expected = createHmac("sha256", secret).update(baseString).digest("hex");
    const actual = signatureHeader.replace(/^v0=/, "");

    try {
      const verified =
        actual.length === expected.length &&
        timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
      return {
        verified,
        provider: this.provider,
        eventId: this.extractEventId(request.headers),
        eventType: this.extractEventType(request.headers),
      };
    } catch {
      return { verified: false, provider: this.provider };
    }
  }

  extractEventId(_headers: Headers): string | undefined {
    return undefined;
  }

  extractEventType(_headers: Headers): string | undefined {
    return undefined;
  }
}

export class StripeWebhookVerifier implements WebhookVerifier {
  readonly provider = "stripe";

  verify(request: Request, rawBody: string, secret: string): WebhookVerificationResult {
    const signatureHeader = request.headers.get("stripe-signature") ?? "";
    if (!signatureHeader) {
      return { verified: false, provider: this.provider };
    }

    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const signatures = signatureHeader.split(",").map((s) => s.trim());
    const actual = signatures.find((s) => s.startsWith("v1="))?.replace(/^v1=/, "");

    if (!actual) {
      return { verified: false, provider: this.provider };
    }

    try {
      const verified =
        actual.length === expected.length &&
        timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
      return {
        verified,
        provider: this.provider,
        eventId: this.extractEventId(request.headers),
        eventType: this.extractEventType(request.headers),
      };
    } catch {
      return { verified: false, provider: this.provider };
    }
  }

  extractEventId(headers: Headers): string | undefined {
    return headers.get("id") ?? undefined;
  }

  extractEventType(headers: Headers): string | undefined {
    return headers.get("type") ?? undefined;
  }
}

const verifiers = new Map<string, WebhookVerifier>([
  ["github", new GitHubWebhookVerifier()],
  ["slack", new SlackWebhookVerifier()],
  ["stripe", new StripeWebhookVerifier()],
]);

export function getWebhookVerifier(provider: string): WebhookVerifier | undefined {
  return verifiers.get(provider.toLowerCase());
}

export function registerWebhookVerifier(provider: string, verifier: WebhookVerifier): void {
  verifiers.set(provider.toLowerCase(), verifier);
}
