# Webhook-to-Agent Workflow Engine — Design Spec

## 1. Overview

Build an event-driven job queue that turns GitHub webhook events into agent-executed actions on repositories. The system is provider-agnostic at the pipeline level (GitHub today, BitBucket later) and requires zero control-plane-side registration — activation is purely repo-driven via a config file.

## 2. Goals

- Receive GitHub webhooks and route them to async agent workflows.
- Support per-repo configuration: which events to handle, what actions to take, instructions for the agent.
- Enable/disable workflows by adding/removing a config file in the repo.
- Keep the control plane as orchestrator; agent execution happens via a worker that performs GitHub API actions.
- Lay the groundwork for additional providers (BitBucket) with minimal pipeline changes.

## 3. Non-Goals

- Real-time bidirectional chat with agents during workflow execution.
- Persistent durable queue (Phase 1 uses in-memory event log; SQLite persistence is future work).
- Multi-step workflow DSL with conditionals, loops, or external action plugins.
- Webhook CRUD UI or subscription management.

## 4. Architecture

```
GitHub Webhook
      ↓
POST /api/webhooks/github
      ↓
Webhook Receiver (validate + normalize)
      ↓
EventBus.publish(WebhookReceived)
      ↓
Workflow Engine (subscriber)
      ↓
Repo Config Provider — fetch .opencode/workflow.yml via GitHub API
      ↓
Rule Matcher — event type + action + filters
      ↓
Job Queue (AppendOnlyEventLog) — WorkflowJob created
      ↓
Workflow Worker (polls queue)
      ↓
GitHub Action Executor — PR reviews, comments, issues
```

## 5. Repo Config Format

Each repo opts in by adding `.opencode/workflow.yml` to its default branch.

```yaml
version: 1
enabled: true

rules:
  - name: "Review PRs"
    events:
      - type: pull_request
        actions: [opened, synchronize]
    actions:
      - type: review_pr
        instructions: |
          Review this PR for code quality, security issues, and adherence to project conventions.
          Focus on: error handling, test coverage, and API design.

  - name: "Respond to issue comments"
    events:
      - type: issue_comment
        actions: [created]
    actions:
      - type: respond_comment
        instructions: |
          If the comment mentions a bug or feature request, acknowledge it and ask clarifying questions.

  - name: "Auto-create issues for CI failures"
    events:
      - type: check_run
        actions: [completed]
        filter: "payload.conclusion == 'failure'"
    actions:
      - type: create_issue
        title_template: "CI failure: {{payload.check_run.name}}"
        body_template: |
          The check run `{{payload.check_run.name}}` failed on commit {{payload.check_run.head_sha}}.
          Details: {{payload.check_run.details_url}}
```

### Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | `number` | Yes | Config format version. Must be `1`. |
| `enabled` | `boolean` | Yes | Master switch. If `false`, all rules are ignored. |
| `rules` | `Rule[]` | Yes | Ordered list of rules to evaluate. |

#### Rule

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Human-readable rule name (for logs/UI). |
| `events` | `EventTrigger[]` | Yes | Which events trigger this rule. |
| `actions` | `Action[]` | Yes | Actions to execute when rule matches. |

#### EventTrigger

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `string` | Yes | Canonical event type (`pull_request`, `issue_comment`, `check_run`, etc.). |
| `actions` | `string[]` | No | Sub-actions to match (`opened`, `synchronize`, `created`). |
| `filter` | `string` | No | Simple expression evaluated against payload. See **Filter Expression Language** below. |

#### Action

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `string` | Yes | Action kind: `review_pr`, `respond_comment`, `create_issue`. |
| `instructions` | `string` | No | Natural-language instructions for the agent performing the action. |
| `title_template` | `string` | No | Mustache-style template for issue titles. See **Template Rendering** below. |
| `body_template` | `string` | No | Mustache-style template for issue/comment bodies. See **Template Rendering** below. |

### Filter Expression Language

Filters use a simple, safe expression language evaluated against the webhook payload.

**Grammar:**
- Literals: strings (`'failure'`, `"success"`), numbers (`42`), booleans (`true`, `false`)
- Property access: dot notation only (`payload.conclusion`, `payload.pull_request.draft`)
- Comparison operators: `==`, `!=`, `<`, `>`, `<=`, `>=`
- Logical operators: `&&` (and), `||` (or)
- No function calls, no array indexing, no ternary operators.

**Security:** Expressions are parsed into an AST and evaluated against a read-only context. `eval()` or `new Function()` must never be used.

**Examples:**
- `payload.conclusion == 'failure'`
- `payload.pull_request.draft == false && payload.action == 'opened'`
- `payload.issue.state == 'open'`

**Failure mode:** If a filter expression has a syntax error, references a missing property, or violates the grammar, the rule is skipped and a warning is logged. The event continues to be evaluated against other rules.

### Template Rendering

Templates use Mustache-style `{{variable}}` syntax with dot-notation property access.

**Available variables:**
- `payload` — the full webhook payload object
- `event` — the canonical event metadata (`eventType`, `action`, `repositoryFullName`, `senderLogin`)

**Behavior:**
- Missing keys render as empty string (`""`).
- HTML in template values is NOT escaped (templates produce Markdown for GitHub).

**Examples:**
- `CI failure: {{payload.check_run.name}}`
- `The check run \`{{payload.check_run.name}}\` failed on commit {{payload.check_run.head_sha}}.`

**Failure mode:** If a template has invalid syntax, the action fails and the job is marked `failed` with the parse error in `result.error`.

## 6. Domain Types

### WorkflowJob

```typescript
interface WorkflowJob {
  readonly id: string;
  readonly type: "workflow.job_created";
  readonly status: "pending" | "running" | "completed" | "failed";
  readonly event: WebhookReceived;
  readonly ruleName: string;
  readonly actions: readonly WorkflowAction[];
  readonly repoFullName: string;
  readonly repoConfig: RepoWorkflowConfig;
  readonly createdAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly result?: WorkflowResult;
}
```

### WebhookReceived (Event Envelope)

```typescript
interface WebhookReceived {
  readonly id: string;
  readonly type: "webhook.received";
  readonly occurredAt: string;
  readonly source: {
    readonly kind: "webhook";
    readonly provider: "github" | "bitbucket";
    readonly id: string; // delivery id
  };
  readonly payload: {
    readonly eventType: string; // e.g., "pull_request"
    readonly action: string;    // e.g., "opened"
    readonly repositoryFullName: string;
    readonly senderLogin: string;
    readonly rawPayload: unknown;
  };
}
```

### RepoWorkflowConfig

```typescript
interface RepoWorkflowConfig {
  readonly version: number;
  readonly enabled: boolean;
  readonly rules: readonly WorkflowRule[];
}

interface WorkflowRule {
  readonly name: string;
  readonly events: readonly EventTrigger[];
  readonly actions: readonly WorkflowAction[];
}

interface WorkflowAction {
  readonly type: "review_pr" | "respond_comment" | "create_issue";
  readonly instructions?: string;
  readonly title_template?: string;
  readonly body_template?: string;
}

interface WorkflowResult {
  readonly success: boolean;
  readonly actionResults: readonly ActionResult[];
  readonly error?: string;
}

interface ActionResult {
  readonly actionType: string;
  readonly success: boolean;
  readonly githubApiResponse?: unknown;
  readonly error?: string;
}
```

## 7. Components

| Component | Location | Responsibility |
|-----------|----------|----------------|
| `WebhookReceiver` | `apps/web/app/api/webhooks/github/route.ts` | Validate signature, normalize payload, publish `WebhookReceived` to EventBus. |
| `EventBus` | `@control-plane/events` | Publish/subscribe domain events (already exists, needs wiring). |
| `WorkflowEngine` | `apps/web/lib/workflow-engine.ts` | Subscribe to `WebhookReceived`, fetch repo config, match rules, create jobs. |
| `RepoConfigProvider` | `apps/web/lib/repo-config.ts` | Fetch `.opencode/workflow.yml` from repo via GitHub API; parse and validate against schema. Caches configs in-memory with a 60-second TTL to avoid rate limits. |
| `JobQueue` | `@control-plane/events` (extend) | Store and retrieve `WorkflowJob` entries via `AppendOnlyEventLog`. |
| `WorkflowWorker` | `apps/web/lib/workflow-worker.ts` | Poll queue for pending jobs, execute actions, update status. |
| `GitHubActionExecutor` | `apps/web/lib/github-actions.ts` | Perform GitHub API operations: PR reviews, issue/PR comments, issue creation. |
| `WebhookEventNormalizer` | `apps/web/lib/webhook-normalizer.ts` | Map provider-specific payloads to canonical `WebhookReceived` shape. |

### WebhookEventNormalizer Interface

```typescript
interface WebhookEventNormalizer {
  normalize(params: {
    provider: "github" | "bitbucket";
    headers: Record<string, string | string[]>;
    body: unknown;
  }): WebhookReceived;
}
```

**Responsibilities:**
- Extract canonical fields (`eventType`, `action`, `repositoryFullName`, `senderLogin`) from provider-specific payload shapes.
- Generate a stable `source.id` from provider delivery identifiers (e.g., GitHub's `x-github-delivery` header).
- Preserve the raw payload under `payload.rawPayload` for template/filter evaluation.
- Throw `WebhookNormalizationError` if required fields cannot be extracted.

### GitHubActionExecutor Interface

```typescript
interface GitHubActionExecutor {
  reviewPullRequest(params: {
    repoFullName: string;
    pullRequestNumber: number;
    event: string; // The canonical event type, e.g. "pull_request"
    instructions?: string;
  }): Promise<{ reviewId: number }>;

  createComment(params: {
    repoFullName: string;
    issueNumber: number;
    body: string;
  }): Promise<{ commentId: number }>;

  createIssue(params: {
    repoFullName: string;
    title: string;
    body: string;
    labels?: string[];
  }): Promise<{ issueId: number; issueNumber: number }>;
}
```

### RepoConfigProvider Caching Strategy

Fetching `.opencode/workflow.yml` from the GitHub API on every webhook would quickly exhaust rate limits.

**Cache design:**
- In-memory LRU cache keyed by `provider:repoFullName`.
- **TTL:** 60 seconds for successful fetches.
- **Negative caching:** 300 seconds for 404 responses (repos without config files).
- **Cache size:** Maximum 1,000 entries. Eviction is LRU.
- **Invalidation:** Manual only (restart the process). No webhook-driven invalidation in Phase 1.

**Rate limit awareness:**
- If GitHub API returns rate limit headers (`X-RateLimit-Remaining`, `X-RateLimit-Reset`), log current remaining quota at `debug` level.
- If remaining quota drops below 100, log at `warn` level.

## 8. Data Flow

1. GitHub delivers webhook to `POST /api/webhooks/github`.
2. Receiver validates HMAC signature and required headers.
3. Receiver calls `normalizer.normalize("github", headers, body)` → `WebhookReceived`.
4. Receiver calls `eventBus.publish(webhookReceived)`.
5. `WorkflowEngine` subscriber receives the event.
6. Engine extracts `repositoryFullName` from event payload.
7. Engine calls `repoConfigProvider.fetchConfig(repoFullName)`.
   - If config missing or `enabled: false`, drop event (log at debug level).
8. Engine iterates rules; for each rule, checks if any `EventTrigger` matches:
   - `eventType` equals `trigger.type`
   - `action` is in `trigger.actions` (if specified)
   - `filter` expression evaluates to true (if specified)
9. For each matching rule, engine appends a `WorkflowJob` to the job queue.
10. `WorkflowWorker` polls the job queue for `pending` jobs at a fixed interval (e.g., every 5 seconds). In Phase 1, the worker runs as a background timer within the Next.js app process. Future iterations may use event-driven subscription for lower latency.
11. Worker marks job as `running`, then iterates actions:
    - `review_pr` → call `GitHubActionExecutor.reviewPullRequest(...)`
    - `respond_comment` → call `GitHubActionExecutor.createComment(...)`
    - `create_issue` → call `GitHubActionExecutor.createIssue(...)`
12. Worker marks job as `completed` or `failed` and appends result.

## 9. Enable / Disable Mechanism

- **Enabled**: Repository contains `.opencode/workflow.yml` at the repository root on the default branch, with `enabled: true`.
- **Disabled**: Repository lacks the file, or the file has `enabled: false`.
- No control-plane-side registry or database required.
- The Webhooks module UI can show a "Discovered Repos" list derived from webhook delivery logs that successfully matched a config.

## 10. Extensibility — BitBucket

- Add `POST /api/webhooks/bitbucket` route.
- Implement `BitbucketWebhookNormalizer` that produces the same `WebhookReceived` shape.
- The rest of the pipeline (`WorkflowEngine`, `JobQueue`, `Worker`) is provider-agnostic.
- `RepoConfigProvider` may need a provider-aware file fetcher if BitBucket API differs significantly.

## 11. Error Handling

### Webhook Validation
- **Invalid webhook signature**: Return 403, do not publish event.
- **Replay attacks**: Reject payloads older than 5 minutes. Compare webhook timestamp (if available in headers) or track `source.id` (delivery ID) in a short-lived deduplication set (e.g., LRU cache of last 10,000 delivery IDs, TTL 1 hour).
- **Malformed payload**: If required fields (`repositoryFullName`, `eventType`, `action`) are missing, log error with delivery ID and return 202 (so GitHub doesn't retry) without publishing to EventBus.

### Config Fetch
- **GitHub API rate limited (403 with rate limit headers)**: Back off according to `Retry-After` or `X-RateLimit-Reset`. If rate limit exceeded, drop event and log at `warn` level.
- **GitHub API unavailable (5xx)**: Retry up to 3 times with exponential backoff (1s, 2s, 4s). If all retries fail, drop event and log error.
- **Auth failure (401/403)**: Log error at `error` level with repo name. Do not retry — the token is likely misconfigured.
- **Config file not found (404)**: Normal case for repos without workflows. Log at `debug` level and drop event.
- **Invalid repo config**: Log warning with parse errors, skip repo, do not create jobs.

### Filter & Template Failures
- **Filter syntax error**: Skip the rule, log warning, continue evaluating other rules.
- **Filter references missing property**: Evaluate to `false`, skip rule, log at `debug` level.
- **Template syntax error**: Mark action as failed, set job status to `failed`, record parse error in `result.error`.
- **Template missing key**: Render as empty string (no failure).

### Action Execution
- **GitHub API rate limited during action**: Back off per rate limit headers. If still exceeded after backoff, mark job as `failed` with rate limit error.
- **Action execution failure**: Mark job as `failed`, append error details to job result, do not retry automatically (Phase 1).
- **Worker crash**: In-memory queue is lost on process restart. Acceptable for Phase 1.

### Deduplication / Idempotency
- Track webhook delivery IDs (`source.id`) in an in-memory LRU cache (capacity 10,000, TTL 1 hour).
- Before creating a job, check if the delivery ID was recently processed. If yes, drop the event and log at `debug` level.
- Jobs themselves are not idempotent in Phase 1 — duplicate GitHub API calls are possible if a job is retried manually. Future work: add idempotency keys to GitHub API calls.

## 12. Security Considerations

- Webhook signatures are validated with HMAC-SHA256 before any processing.
- Filter expressions are parsed into AST and evaluated in a restricted context — never use `eval()` or `new Function()`.
- GitHub API tokens are read from environment variables and must never be logged.
- Replay protection via delivery ID deduplication and optional timestamp tolerance.
- Repo config files are fetched over HTTPS and parsed with strict schema validation.

## 13. Testing Strategy

- **Unit**: Rule matcher logic, config parser/validator, normalizer mappings.
- **Integration**: Webhook receiver → EventBus → WorkflowEngine → JobQueue → Worker, using in-memory implementations.
- **E2E**: Use `msw` or similar to mock GitHub API for config fetching and action execution; send synthetic webhook payloads and assert on resulting GitHub API calls.

## 13. Phase 1 Scope

- GitHub webhook receiver wired to EventBus.
- `WorkflowEngine`, `RepoConfigProvider`, `JobQueue`, `WorkflowWorker`, and `GitHubActionExecutor` implemented.
- Support for `pull_request`, `issue_comment`, `check_run`, and `issues` events.
- Support for `review_pr`, `respond_comment`, and `create_issue` actions.
- In-memory event log and job queue (resets on restart).
- YAML config parser with strict schema validation.

## 14. Future Work

- SQLite-backed persistent queue.
- Automatic retry with backoff for failed jobs.
- Additional GitHub events (`pull_request_review`, `workflow_run`).
- BitBucket webhook receiver.
- Workflow execution UI in the control plane dashboard.
- Agent session integration — allow jobs to spawn interactive agent sessions instead of direct API actions.
