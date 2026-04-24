# Webhook-to-Agent Workflow Engine Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an event-driven job queue that turns GitHub webhooks into agent-executed repository actions, driven by per-repo `.opencode/workflow.yml` configs.

**Architecture:** Webhook → EventBus → WorkflowEngine fetches repo config → creates WorkflowJob → Worker polls queue → GitHubActionExecutor performs actions.

**Tech Stack:** TypeScript, Next.js App Router, Vitest, pnpm workspaces, `@control-plane/events`, `@control-plane/core`, `@control-plane/storage`

**Worktree:** `.worktrees/webhook-agent-workflow`

---

## Chunk 1: Foundation — EventBus Wiring and Webhook Normalization

### Task 1: Wire EventBus in apps/web

**Files:**
- Create: `apps/web/lib/event-bus.ts`
- Modify: `apps/web/app/api/webhooks/github/route.ts`

**Pre-flight:**
- [ ] Read `packages/events/src/index.ts` to understand exports
- [ ] Read `packages/events/src/bus.ts` to understand EventBus interface
- [ ] Read `apps/web/app/api/webhooks/github/route.ts` current implementation
- [ ] Read `apps/web/app/api/webhooks/github/route.test.ts` to understand test patterns

- [ ] **Step 1: Create EventBus singleton**

Create `apps/web/lib/event-bus.ts`:
```typescript
import { InMemoryEventBus } from "@control-plane/events";
import type { EventEnvelope } from "@control-plane/events";

// Singleton event bus for the web app process
export const eventBus = new InMemoryEventBus<EventEnvelope>();
```

- [ ] **Step 2: Modify webhook receiver to publish events**

In `apps/web/app/api/webhooks/github/route.ts`:
- After signature validation and normalization, call `eventBus.publish(webhookReceived)` before returning 202.
- Keep existing JSONL logging intact (don't break existing behavior).

- [ ] **Step 3: Add tests**

Add test in `apps/web/app/api/webhooks/github/route.test.ts`:
- Verify that publishing to eventBus is called with correct shape.
- Use a mock/spy on the eventBus singleton.

- [ ] **Step 4: Run tests**

```bash
pnpm test -- apps/web/app/api/webhooks/github/route.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/event-bus.ts apps/web/app/api/webhooks/github/route.ts apps/web/app/api/webhooks/github/route.test.ts
git commit -m "feat(webhooks): wire EventBus and publish WebhookReceived events"
```

---

### Task 2: Create WebhookEventNormalizer

**Files:**
- Create: `apps/web/lib/webhook-normalizer.ts`
- Create: `apps/web/lib/webhook-normalizer.test.ts`

**Pre-flight:**
- [ ] Read `packages/core/src/domain/webhooks.ts` for canonical types
- [ ] Read `docs/superpowers/specs/2026-04-24-webhook-agent-workflow-design.md` Section 6 for WebhookReceived interface

- [ ] **Step 1: Write failing test**

Create `apps/web/lib/webhook-normalizer.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { normalizeGithubWebhook } from "./webhook-normalizer";

describe("normalizeGithubWebhook", () => {
  it("given pull_request opened payload, returns canonical WebhookReceived", () => {
    const payload = {
      action: "opened",
      number: 42,
      pull_request: { id: 1, number: 42 },
      repository: { full_name: "owner/repo" },
      sender: { login: "testuser" },
    };
    
    const result = normalizeGithubWebhook({
      headers: { "x-github-delivery": "del-123", "x-github-event": "pull_request" },
      body: payload,
    });
    
    expect(result.type).toBe("webhook.received");
    expect(result.source.provider).toBe("github");
    expect(result.source.id).toBe("del-123");
    expect(result.payload.eventType).toBe("pull_request");
    expect(result.payload.action).toBe("opened");
    expect(result.payload.repositoryFullName).toBe("owner/repo");
    expect(result.payload.senderLogin).toBe("testuser");
    expect(result.payload.rawPayload).toBe(payload);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- apps/web/lib/webhook-normalizer.test.ts
```

- [ ] **Step 3: Implement normalizer**

Create `apps/web/lib/webhook-normalizer.ts`:
```typescript
import { randomUUID } from "node:crypto";

export interface WebhookReceived {
  readonly id: string;
  readonly type: "webhook.received";
  readonly occurredAt: string;
  readonly source: {
    readonly kind: "webhook";
    readonly provider: "github" | "bitbucket";
    readonly id: string;
  };
  readonly payload: {
    readonly eventType: string;
    readonly action: string;
    readonly repositoryFullName: string;
    readonly senderLogin: string;
    readonly rawPayload: unknown;
  };
}

export function normalizeGithubWebhook(params: {
  headers: Record<string, string | string[]>;
  body: unknown;
}): WebhookReceived {
  const body = params.body as Record<string, unknown>;
  const deliveryId = String(params.headers["x-github-delivery"] ?? randomUUID());
  
  return {
    id: randomUUID(),
    type: "webhook.received",
    occurredAt: new Date().toISOString(),
    source: {
      kind: "webhook",
      provider: "github",
      id: deliveryId,
    },
    payload: {
      eventType: String(body?.action ?? ""),
      action: String((body as Record<string, unknown>)?.action ?? ""),
      repositoryFullName: String((body?.repository as Record<string, unknown>)?.full_name ?? ""),
      senderLogin: String((body?.sender as Record<string, unknown>)?.login ?? ""),
      rawPayload: body,
    },
  };
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test -- apps/web/lib/webhook-normalizer.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/webhook-normalizer.ts apps/web/lib/webhook-normalizer.test.ts
git commit -m "feat(webhooks): add WebhookEventNormalizer for GitHub payloads"
```

---

## Chunk 2: Config and Rules Engine

### Task 3: Create Filter Expression Evaluator

**Files:**
- Create: `apps/web/lib/filter-evaluator.ts`
- Create: `apps/web/lib/filter-evaluator.test.ts`

**Pre-flight:**
- [ ] Read spec Section 5 "Filter Expression Language"

- [ ] **Step 1: Write failing tests**

Create `apps/web/lib/filter-evaluator.test.ts` with tests for:
- `payload.conclusion == 'failure'` → true/false
- `payload.pull_request.draft == false && payload.action == 'opened'`
- Missing property → false
- Syntax error → throws FilterSyntaxError
- Unsupported operators/function calls → throws

- [ ] **Step 2: Implement evaluator**

Create `apps/web/lib/filter-evaluator.ts`:
- Parse expression into simple AST
- Support: literals (string, number, boolean), dot-notation property access, comparison operators (==, !=, <, >, <=, >=), logical operators (&&, ||)
- Evaluate against provided context object
- Never use eval() or new Function()

- [ ] **Step 3: Run tests**

```bash
pnpm test -- apps/web/lib/filter-evaluator.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/filter-evaluator.ts apps/web/lib/filter-evaluator.test.ts
git commit -m "feat(workflow): add safe filter expression evaluator"
```

---

### Task 4: Create Template Renderer

**Files:**
- Create: `apps/web/lib/template-renderer.ts`
- Create: `apps/web/lib/template-renderer.test.ts`

**Pre-flight:**
- [ ] Read spec Section 5 "Template Rendering"

- [ ] **Step 1: Write failing tests**

Create `apps/web/lib/template-renderer.test.ts` with tests for:
- `{{payload.check_run.name}}` → "test"
- `{{event.repositoryFullName}}` → "owner/repo"
- Missing key → empty string
- Nested access → works
- Invalid syntax → throws TemplateSyntaxError

- [ ] **Step 2: Implement renderer**

Create `apps/web/lib/template-renderer.ts`:
- Parse `{{variable}}` syntax
- Support dot notation for nested properties
- Replace missing keys with empty string
- No HTML escaping

- [ ] **Step 3: Run tests**

```bash
pnpm test -- apps/web/lib/template-renderer.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/template-renderer.ts apps/web/lib/template-renderer.test.ts
git commit -m "feat(workflow): add Mustache-style template renderer"
```

---

### Task 5: Create RepoConfigProvider

**Files:**
- Create: `apps/web/lib/repo-config.ts`
- Create: `apps/web/lib/repo-config.test.ts`

**Pre-flight:**
- [ ] Read spec Section 7 "RepoConfigProvider Caching Strategy"
- [ ] Read spec Section 5 for config schema

- [ ] **Step 1: Write failing tests**

Create `apps/web/lib/repo-config.test.ts` with tests for:
- Fetch config from GitHub API mock
- Parse valid YAML config
- Return null for 404
- Cache hit returns cached config
- Cache miss fetches again
- Invalid YAML returns null and logs warning

- [ ] **Step 2: Implement provider**

Create `apps/web/lib/repo-config.ts`:
- Fetch `.opencode/workflow.yml` from GitHub API
- Parse YAML using a library (check if yaml is available, otherwise add js-yaml or similar)
- Validate against schema (version, enabled, rules structure)
- In-memory LRU cache with 60s TTL for hits, 300s for 404s
- Max 1000 entries

- [ ] **Step 3: Run tests**

```bash
pnpm test -- apps/web/lib/repo-config.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/repo-config.ts apps/web/lib/repo-config.test.ts
git commit -m "feat(workflow): add RepoConfigProvider with caching"
```

---

## Chunk 3: Workflow Engine and Job Queue

### Task 6: Create WorkflowEngine

**Files:**
- Create: `apps/web/lib/workflow-engine.ts`
- Create: `apps/web/lib/workflow-engine.test.ts`

**Pre-flight:**
- [ ] Read spec Section 8 "Data Flow"
- [ ] Read existing `apps/web/lib/event-bus.ts`
- [ ] Read `packages/events/src/event-log.ts` for AppendOnlyEventLog interface

- [ ] **Step 1: Write failing tests**

Create `apps/web/lib/workflow-engine.test.ts` with tests for:
- Given WebhookReceived event, fetches config, matches rule, creates job
- Given no config, drops event
- Given disabled config, drops event
- Given non-matching event type, no job created
- Given matching filter expression, job created
- Given non-matching filter expression, no job created

- [ ] **Step 2: Implement engine**

Create `apps/web/lib/workflow-engine.ts`:
- Subscribe to `webhook.received` events on EventBus
- Extract `repositoryFullName` from payload
- Call `repoConfigProvider.fetchConfig(repoFullName)`
- If no config or disabled, return
- Iterate rules, check if any EventTrigger matches:
  - eventType matches trigger.type
  - action matches trigger.actions (if specified)
  - filter evaluates to true (if specified)
- For each match, create `WorkflowJob` and append to job queue

- [ ] **Step 3: Run tests**

```bash
pnpm test -- apps/web/lib/workflow-engine.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/workflow-engine.ts apps/web/lib/workflow-engine.test.ts
git commit -m "feat(workflow): add WorkflowEngine with rule matching"
```

---

### Task 7: Extend JobQueue for WorkflowJobs

**Files:**
- Create: `apps/web/lib/job-queue.ts`
- Create: `apps/web/lib/job-queue.test.ts`

**Pre-flight:**
- [ ] Read `packages/events/src/event-log.ts` for AppendOnlyEventLog
- [ ] Read `packages/events/src/index.ts` for exports

- [ ] **Step 1: Write failing tests**

Create `apps/web/lib/job-queue.test.ts` with tests for:
- Append job to queue
- List pending jobs
- Update job status
- Job status transitions: pending → running → completed/failed

- [ ] **Step 2: Implement job queue**

Create `apps/web/lib/job-queue.ts`:
- Use `InMemoryAppendOnlyEventLog` from `@control-plane/events`
- Store `WorkflowJob` entries
- Provide methods: `append(job)`, `listPending()`, `markRunning(id)`, `markCompleted(id, result)`, `markFailed(id, error)`

- [ ] **Step 3: Run tests**

```bash
pnpm test -- apps/web/lib/job-queue.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/job-queue.ts apps/web/lib/job-queue.test.ts
git commit -m "feat(workflow): add JobQueue for WorkflowJobs"
```

---

## Chunk 4: Action Execution

### Task 8: Create GitHubActionExecutor

**Files:**
- Create: `apps/web/lib/github-actions.ts`
- Create: `apps/web/lib/github-actions.test.ts`

**Pre-flight:**
- [ ] Read spec Section 7 "GitHubActionExecutor Interface"
- [ ] Check if project already has a GitHub API client or HTTP client pattern

- [ ] **Step 1: Write failing tests**

Create `apps/web/lib/github-actions.test.ts` with tests using `msw` or mocked fetch:
- `reviewPullRequest` calls correct GitHub API endpoint
- `createComment` calls correct endpoint
- `createIssue` calls correct endpoint
- Rate limit response is handled
- Auth failure is handled

- [ ] **Step 2: Implement executor**

Create `apps/web/lib/github-actions.ts`:
- Use native `fetch()` with GitHub API token from env var `CLAUDE_CONTROL_PLANE_GITHUB_TOKEN`
- Implement `reviewPullRequest`, `createComment`, `createIssue`
- Handle rate limits by checking response headers
- Handle 401/403 errors gracefully

- [ ] **Step 3: Run tests**

```bash
pnpm test -- apps/web/lib/github-actions.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/github-actions.ts apps/web/lib/github-actions.test.ts
git commit -m "feat(workflow): add GitHubActionExecutor for PR reviews, comments, issues"
```

---

### Task 9: Create WorkflowWorker

**Files:**
- Create: `apps/web/lib/workflow-worker.ts`
- Create: `apps/web/lib/workflow-worker.test.ts`

**Pre-flight:**
- [ ] Read spec Section 8 Data Flow steps 10-12
- [ ] Read `apps/web/lib/job-queue.ts` (from Task 7)
- [ ] Read `apps/web/lib/github-actions.ts` (from Task 8)

- [ ] **Step 1: Write failing tests**

Create `apps/web/lib/workflow-worker.test.ts` with tests for:
- Poll queue finds pending job, executes action, marks completed
- Job with multiple actions executes all actions sequentially
- If one action fails, remaining actions are skipped and job is marked failed
- No pending jobs → worker does nothing

- [ ] **Step 2: Implement worker**

Create `apps/web/lib/workflow-worker.ts`:
- `start()` method that sets up polling interval (default 5s)
- `stop()` method to clear interval
- For each pending job:
  1. Mark as running
  2. For each action in job:
     - Extract parameters from event payload
     - Render templates if needed
     - Call appropriate GitHubActionExecutor method
     - If action fails, stop processing remaining actions, mark job failed
  3. If all actions succeed, mark job completed
- Action parameter mapping:
  - `review_pr`: extract `pullRequestNumber` from `payload.number` or `payload.pull_request.number`
  - `respond_comment`: extract `issueNumber` from `payload.issue.number`
  - `create_issue`: use `title_template` and `body_template`

- [ ] **Step 3: Run tests**

```bash
pnpm test -- apps/web/lib/workflow-worker.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/workflow-worker.ts apps/web/lib/workflow-worker.test.ts
git commit -m "feat(workflow): add WorkflowWorker for polling and executing jobs"
```

---

## Chunk 5: Integration and Wiring

### Task 10: Wire everything together in the app

**Files:**
- Modify: `apps/web/lib/event-bus.ts`
- Modify: `apps/web/app/api/webhooks/github/route.ts`
- Create: `apps/web/lib/workflow-bootstrap.ts`

**Pre-flight:**
- [ ] Read all previously created files to ensure consistency

- [ ] **Step 1: Create bootstrap module**

Create `apps/web/lib/workflow-bootstrap.ts`:
- Instantiate all components (RepoConfigProvider, WorkflowEngine, JobQueue, GitHubActionExecutor, WorkflowWorker)
- Wire EventBus subscriber
- Start worker polling
- Export `startWorkflowEngine()` and `stopWorkflowEngine()`

- [ ] **Step 2: Wire into app lifecycle**

In `apps/web/lib/event-bus.ts`:
- Ensure EventBus is properly exported singleton

In `apps/web/app/api/webhooks/github/route.ts`:
- Import and call normalization and publishing

Create or modify `apps/web/app/layout.tsx` or appropriate server-init file to call `startWorkflowEngine()` on boot.

- [ ] **Step 3: Add integration tests**

Create integration test that sends a synthetic webhook through the full pipeline:
- Mock GitHub API responses for config fetch and action execution
- Send webhook payload
- Verify job is created
- Verify worker executes action
- Verify GitHub API was called

- [ ] **Step 4: Run all tests**

```bash
pnpm test
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/workflow-bootstrap.ts apps/web/lib/event-bus.ts apps/web/app/api/webhooks/github/route.ts
git commit -m "feat(workflow): wire all components together"
```

---

## Verification Checklist

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] TypeScript type checks pass: `pnpm typecheck`
- [ ] Linting passes: `pnpm lint`
- [ ] No secrets in code
- [ ] GitHub API token read from env var only

## Post-Implementation

After all tasks are complete, use `superpowers:finishing-a-development-branch` to decide how to integrate the work.
