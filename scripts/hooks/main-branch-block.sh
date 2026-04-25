#!/usr/bin/env bash
# PreToolUse hook — block file operations on main branch.
# Fires before Read, Edit, Write tool calls.

set -euo pipefail

branch="${WORKTREE_BRANCH:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)}"

if [ "$branch" = "main" ]; then
  jq -n '{
    "continue": false,
    "stopReason": "File operations on main are blocked. Create a feature branch first: task agent:worktree-new -- feat/<scope>, or git worktree add .worktrees/<branch> -b <branch>. Then run your work in the worktree directory."
  }'
  exit 0
fi

# Not on main — allow the operation
