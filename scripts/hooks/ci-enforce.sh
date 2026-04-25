#!/usr/bin/env bash
# PreToolUse/Bash hook — CI gate enforcement.
# Fires before every Bash tool call. Reads JSON from stdin.

set -euo pipefail

cmd=$(jq -r '.tool_input.command // empty' 2>/dev/null || true)

# ── Block --no-verify ──────────────────────────────────────────────────────────
# git commit or push with --no-verify is unconditionally blocked.
# Match only when --no-verify follows a git commit/push invocation, not when
# the string appears inside a heredoc, --body argument, or other text payload.
if echo "$cmd" | grep -qE '(^|[;&|[:space:]])git (commit|push)\b[^'"'"'"]*--no-verify'; then
  jq -n '{
    "continue": false,
    "stopReason": "--no-verify is blocked by project policy. Fix the hook failure instead: run task fmt, then address the actual error. Never bypass CI gates."
  }'
  exit 0
fi

# ── Block detached HEAD push ───────────────────────────────────────────────────
# git push from detached HEAD was used to bypass the pre-push ci:fast gate
# (push_branch != current when HEAD is detached, so the old hook skipped ci:fast).
# The pre-push hook now runs ci:fast unconditionally, but block here as belt+suspenders.
if echo "$cmd" | grep -qE '(^|[;&|][[:space:]]*)git (checkout|switch).*--detach'; then
  jq -n '{
    "continue": false,
    "stopReason": "Detaching HEAD before a push to bypass ci:fast is blocked. Check out the branch directly: git checkout <branch-name>. The pre-push hook runs ci:fast regardless of HEAD state."
  }'
  exit 0
fi

# ── Block --admin merges ───────────────────────────────────────────────────────
# gh pr merge --admin bypasses the required CI status-check gate on main.
# This lets agents merge while GitHub Actions CI is still running or red.
# Use task agent:pr-merge instead — it gates on gh pr checks before merging.
if echo "$cmd" | grep -q 'gh pr merge' && echo "$cmd" | grep -q -- '--admin'; then
  jq -n '{
    "continue": false,
    "stopReason": "--admin merge is blocked: it bypasses required CI status checks. Use instead: task agent:pr-merge (waits for CI to pass, then merges). Never declare done until CI on main is green."
  }'
  exit 0
fi

# ── Block direct commits to main ──────────────────────────────────────────────
# Commits on main bypass the PR review gate. Use a feature branch + PR instead.
# Skip this check when the command explicitly cd's into a worktree — the hook
# runs from the main repo root (branch=main) even when the agent is in a
# .worktrees/<branch> directory, causing false positives.
# Covers both: `cd .worktrees/…` and `git -C .worktrees/…` invocation styles.
if echo "$cmd" | grep -qE '(^|[;&|][[:space:]]*)git commit'; then
  if ! echo "$cmd" | grep -qE '(cd ["\x27]?[^ ;|&]*\.worktrees/|git -C ["\x27]?[^ ;|&]*\.worktrees/)'; then
    branch="${WORKTREE_BRANCH:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)}"
    if [ "$branch" = "main" ]; then
      jq -n '{
        "continue": false,
        "stopReason": "Direct commits to main are blocked. Create a feature branch first: task agent:worktree-new -- feat/<scope>. Then commit there and open a PR with gh pr create."
      }'
      exit 0
    fi
  fi
fi

# ── Auto-fix formatting before git commit ─────────────────────────────────────
# Biome autofixes ~90% of T1 violations (formatting, import sort, basic lint).
# Running it here means the pre-commit hook sees clean files and rarely fails.
if echo "$cmd" | grep -qE '(^|[;&|][[:space:]]*)git commit'; then
  pnpm biome check --write . 2>&1 | tail -3 || true
fi
