#!/usr/bin/env bash
# SessionStart hook — branch advisory.
# Fires at the start of every session. If the working branch is main,
# injects a context note so the agent knows to create a worktree first.

branch="${WORKTREE_BRANCH:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)}"

if [ "$branch" = "main" ]; then
  jq -n '{
    "hookSpecificOutput": {
      "hookEventName": "SessionStart",
      "additionalContext": "WARNING: current branch is main. For implementation work, invoke superpowers:using-git-worktrees and run: task agent:worktree-new -- feat/<scope>  before writing any code. Working directly on main bypasses the PR review gate."
    }
  }'
else
  jq -n '{
    "hookSpecificOutput": {
      "hookEventName": "SessionStart",
      "additionalContext": "On feature branch '"$branch"'. Use /commit (or superpowers:commit-message) for conventional commit messages after each logical unit. Commit cadence: after each component/fix/plan step. After every 3–5 commits, push and wait for task ci:fast to pass."
    }
  }'
fi
