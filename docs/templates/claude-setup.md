# Claude Code Action — Setup Guide

This guide walks you through enabling Claude Code in a GitHub repository so
that `@claude` mentions and issue events trigger real Claude sessions, and so
that those sessions appear in Agent Tower's **Webhook Sessions** panel.

---

## Prerequisites

- A GitHub repository where you have admin access
- Either an Anthropic API key **or** a Claude Max subscription
- Agent Tower running with a public HTTPS URL

---

## Step 1 — Install the GitHub App

Go to **https://github.com/apps/claude** and click **Install**. Grant access to
the specific repositories you want to enable. The app provides the identity
(`@claude`) that posts replies; the actual execution happens in your own GitHub
Actions runners.

---

## Step 2 — Add the workflow file

Copy `docs/templates/claude.yml` into `.github/workflows/claude.yml` in your
target repository and commit it. This is the only file needed — there is no
additional configuration file.

---

## Step 3 — Add the auth secret

Choose **one** option:

### Option A — Anthropic API key

1. Go to **https://console.anthropic.com/account/keys** and create a new key.
2. In your GitHub repository, go to **Settings → Secrets and variables → Actions**.
3. Create a new repository secret named `ANTHROPIC_API_KEY` with the key value.

### Option B — Claude Max subscription (OAuth token)

This path lets Max subscribers use their subscription instead of API-key billing.
Note: as of early 2026, there is a known issue where headless (`-p`) API calls
may still be billed at API rates even with an OAuth token — verify this before
running at volume.

1. In your terminal, run:
   ```
   claude setup-token
   ```
2. Copy the printed token (format: `sk-ant-oat01-…`).
3. In your GitHub repository, go to **Settings → Secrets and variables → Actions**.
4. Create a new repository secret named `CLAUDE_CODE_OAUTH_TOKEN` with the token.
5. In `.github/workflows/claude.yml`, comment out the `anthropic_api_key` line and
   uncomment the `claude_code_oauth_token` line.

---

## Step 4 — Configure the Agent Tower webhook

For Claude sessions to appear in the **Webhook Sessions** panel, GitHub must
send `workflow_run` events to Agent Tower.

1. In your GitHub repository, go to **Settings → Webhooks → Add webhook**.
2. Set **Payload URL** to your Agent Tower URL:
   ```
   https://<your-agent-tower-host>/api/webhooks/github
   ```
3. Set **Content type** to `application/json`.
4. Set **Secret** to the value of `CLAUDE_CONTROL_PLANE_GITHUB_WEBHOOK_SECRET`
   in your Agent Tower environment.
5. Under **Which events**, choose **Let me select individual events** and enable:
   - **Workflow runs** (`workflow_run`)
   - **Issue comments** (optional — for full event history)
   - **Pull request review comments** (optional)
6. Click **Add webhook**.

You can also configure this automatically with:
```
task github:webhook:create
```
(requires `CLAUDE_CONTROL_PLANE_GITHUB_WEBHOOK_URL` and
`CLAUDE_CONTROL_PLANE_GITHUB_WEBHOOK_SECRET` to be set).

---

## Step 5 — Test it

1. Open an issue in the repository and comment `@claude hello`.
2. The `claude` workflow should appear in the repository's **Actions** tab within
   a few seconds.
3. Once the run completes, it should appear in Agent Tower under
   **Webhooks → Sessions**.

---

## Enabling issue-to-PR automation

The `direct_prompt` section in `claude.yml` is pre-configured for issue
automation: when a new issue is opened (or labelled `claude`), Claude analyses
it and, if the scope is clear, opens a draft PR with an implementation.

To disable this and use only `@mention`-driven interactions, remove or comment
out the `direct_prompt` block.

---

## Cross-repo visibility

Agent Tower aggregates `workflow_run` events from all repositories that point
their webhooks at the same Agent Tower instance. The **Webhook Sessions** panel
shows a unified feed of all Claude-triggered runs across every connected repo —
the observability layer the native GitHub App does not provide.
