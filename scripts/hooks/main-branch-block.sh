#!/usr/bin/env bash
# PreToolUse hook — block file operations on main branch.
# Fires before Read, Edit, Write tool calls.
#
# Allows operations on files inside worktree paths (.worktrees/) so agents
# can edit worktree files without false-positive blocks.

set -euo pipefail

# Read tool input from stdin to check the target file path
tool_input=$(cat 2>/dev/null || true)
file_path=$(printf '%s' "$tool_input" | jq -r '.tool_input.file_path // ""' 2>/dev/null || true)

# Allow operations inside git worktrees
if [[ "$file_path" == *"/.worktrees/"* ]] || [[ "$file_path" == *"/.worktree/"* ]]; then
  exit 0
fi

branch="${WORKTREE_BRANCH:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)}"

if [ "$branch" = "main" ]; then
  jq -n '{
    "continue": false,
    "stopReason": "File operations on main are blocked. Create a feature branch first: task agent:worktree-new -- feat/<scope>, or git worktree add .worktrees/<branch> -b <branch>. Then run your work in the worktree directory."
  }'
  exit 0
fi
