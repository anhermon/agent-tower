#!/usr/bin/env bash
# Stop hook — staged-files reminder + main-branch advisory.
# Fires when Claude finishes a response turn.

staged=$(git diff --cached --name-only 2>/dev/null | wc -l | tr -d ' ')
branch="${WORKTREE_BRANCH:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)}"

parts=()
[ "${staged:-0}" -gt 0 ] 2>/dev/null && \
  parts+=("${staged} staged files — run task agent:preflight before git commit to autofix fmt/lint and verify types+tests.")
[ "$branch" = "main" ] && \
  parts+=("You are on main — use: task agent:worktree-new -- feat/<scope> for isolated development. Invoke superpowers:using-git-worktrees for the full protocol.")

if [ "${#parts[@]}" -gt 0 ]; then
  msg=$(printf '%s ' "${parts[@]}")
  jq -n --arg m "$msg" \
    '{hookSpecificOutput:{hookEventName:"Stop",additionalContext:$m}}'
fi
