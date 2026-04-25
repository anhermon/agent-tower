#!/usr/bin/env bash
# pre-push hook — only run ci:fast when pushing the current branch.
#
# git pre-push stdin format: <local-ref> <local-sha1> <remote-ref> <remote-sha1>
#
# When pushing a foreign branch (e.g. after a worktree rename), the working
# tree does not reflect that branch's code, so running ci:fast against it
# would produce false failures. Skip in that case and remind to verify locally.
#
# Uses read -t 5 instead of blocking awk to avoid hanging in environments
# where the git process stdin is not properly forwarded (e.g. tool-backgrounded
# pushes). All diagnostic output goes to stderr so a broken stdout pipe cannot
# abort the hook via set -e.

set -euo pipefail

# Read first pushed ref from git stdin; gracefully degrade on timeout/empty.
_push_line=""
push_branch=""
if IFS= read -t 5 -r _push_line 2>/dev/null; then
  push_branch=$(printf '%s\n' "$_push_line" | awk '{print $1}' | sed 's|refs/heads/||')
fi

current=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)

if [ -n "$push_branch" ] && [ "$push_branch" = "$current" ]; then
  task ci:fast
else
  if [ -n "$push_branch" ]; then
    printf 'pre-push: pushing "%s" while on "%s" — skipping working-tree ci:fast.\n' \
      "$push_branch" "$current" >&2 || true
    printf 'Verify in the branch worktree: cd .worktrees/%s && task ci:fast\n' \
      "$push_branch" >&2 || true
  else
    printf 'pre-push: stdin not available — skipping ci:fast (run task ci:fast manually before merging).\n' >&2 || true
  fi
fi
