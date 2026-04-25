#!/usr/bin/env bash
# Stop hook — intentionally silent.
#
# Branch detection is unreliable here: Claude Code hooks always run from the
# main working-tree root, so git rev-parse --abbrev-ref HEAD always returns
# "main" regardless of which worktree the session is actually in. Any
# branch-based advisory fires as a false positive in every worktree session.
#
# Real enforcement lives in the PreToolUse hooks (ci-enforce.sh detects
# bad Bash commands by pattern-matching the command text; main-branch-block.sh
# detects edits by pattern-matching the file path).  Those work correctly
# because they use tool-input content, not the hook process's branch.
exit 0
