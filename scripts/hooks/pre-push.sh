#!/usr/bin/env bash
# pre-push hook — only run ci:fast when pushing the current branch.
#
# git pre-push stdin format: <local-ref> <local-sha1> <remote-ref> <remote-sha1>
#
# When pushing a foreign branch (e.g. after a worktree rename), the working
# tree does not reflect that branch's code, so running ci:fast against it
# would produce false failures. Skip in that case and remind to verify locally.

set -euo pipefail

push_branch=$(awk '{print $1}' | sed 's|refs/heads/||' | head -1)
current=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)

if [ -z "$push_branch" ] || [ "$push_branch" = "$current" ]; then
  task ci:fast
else
  printf 'pre-push: pushing "%s" while on "%s" — skipping working-tree ci:fast.\n' \
    "$push_branch" "$current"
  printf 'Verify in the branch worktree: cd .worktrees/%s && task ci:fast\n' \
    "$push_branch"
fi
