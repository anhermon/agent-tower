#!/usr/bin/env bash
# PreToolUse/Bash hook — CI gate enforcement.
# Fires before every Bash tool call. Reads JSON from stdin.

set -euo pipefail

cmd=$(jq -r '.tool_input.command // empty' 2>/dev/null || true)

# ── Block --no-verify ──────────────────────────────────────────────────────────
# Any git commit or push with --no-verify is unconditionally blocked.
# This prevents bypassing the T1 pre-commit (biome + eslint + gitleaks)
# and T2 pre-push (task ci:fast) hooks. Fix the failure instead.
if echo "$cmd" | grep -q -- '--no-verify'; then
  jq -n '{
    "continue": false,
    "stopReason": "--no-verify is blocked by project policy. Fix the hook failure: run task fmt, then address the actual error. Do not bypass CI gates."
  }'
  exit 0
fi

# ── Block direct commits to main ──────────────────────────────────────────────
# Commits on main bypass the PR review gate. Use a feature branch + PR instead.
branch="${WORKTREE_BRANCH:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)}"
if [ "$branch" = "main" ] && echo "$cmd" | grep -qE '(^|[;&|][[:space:]]*)git commit'; then
  jq -n '{
    "continue": false,
    "stopReason": "Direct commits to main are blocked. Create a feature branch first: task agent:worktree-new -- feat/<scope>, or git worktree add .worktrees/<branch> -b <branch>. Then commit there and open a PR."
  }'
  exit 0
fi

# ── Auto-fix formatting before git commit ─────────────────────────────────────
# Biome autofixes ~90% of T1 violations (formatting, import sort, basic lint).
# Running it here means the pre-commit hook sees clean files and rarely fails.
if echo "$cmd" | grep -qE '(^|[;&|][[:space:]]*)git commit'; then
  pnpm biome check --write . 2>&1 | tail -3 || true
fi
