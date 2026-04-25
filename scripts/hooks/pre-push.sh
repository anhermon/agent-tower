#!/usr/bin/env bash
# pre-push hook — always run ci:fast before any push.
#
# git pre-push stdin format: <local-ref> <local-sha1> <remote-ref> <remote-sha1>
#
# Previously this hook skipped ci:fast when push_branch != current branch, creating
# an exploit: agents could detach HEAD before pushing to bypass the gate entirely.
# Now ci:fast always runs whenever we know what is being pushed. Detached HEAD is
# not a special case — the working tree IS the content being pushed.
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

if [ -n "$push_branch" ]; then
  if [ "$push_branch" != "$current" ] && [ "$current" != "HEAD" ]; then
    # Genuine mismatch: working tree reflects a different branch than what is
    # being pushed. This only happens legitimately when pushing a branch that
    # was force-checked-out but the WD wasn't updated. Warn but still gate.
    printf 'pre-push: pushing "%s" while on "%s" — running ci:fast against working tree.\n' \
      "$push_branch" "$current" >&2 || true
    printf 'If this produces false failures, cd into the correct worktree first.\n' >&2 || true
  fi
  task ci:fast
else
  # stdin not available (backgrounded push, pipe issue) — gate anyway.
  printf 'pre-push: push target unknown — running ci:fast as safety net.\n' >&2 || true
  task ci:fast
fi
