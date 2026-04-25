/**
 * OpenCode hook equivalents for the CI enforcement and branch protection rules
 * that Claude Code implements via .claude/settings.json shell hooks.
 *
 * Mirrors the behaviour of:
 *   scripts/hooks/ci-enforce.sh      (PreToolUse:Bash)
 *   scripts/hooks/main-branch-block.sh (PreToolUse:Edit|Write)
 *   PostToolUse code-review-graph update
 *   scripts/hooks/session-start-check.sh (SessionStart branch advisory)
 */

import { execSync } from "child_process"

function getGitBranch(): string {
  try {
    const fromEnv = process.env.WORKTREE_BRANCH
    if (fromEnv) return fromEnv.trim()
    return execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }).trim()
  } catch {
    return ""
  }
}

function isWorktreeCommand(cmd: string): boolean {
  return /(cd\s+["']?[^ ;|&]*\.worktrees\/|git\s+-C\s+["']?[^ ;|&]*\.worktrees\/)/.test(cmd)
}

export const CIHooks = async () => {
  return {
    // ── PreToolUse equivalent ──────────────────────────────────────────────────
    "tool.execute.before": async (input: { tool: string }, output: { args: Record<string, string> }) => {
      const tool = input.tool.toLowerCase()

      // ── Bash enforcement (mirrors ci-enforce.sh) ───────────────────────────
      if (tool === "bash") {
        const cmd = output.args?.command ?? ""

        if (/(^|[;&| \t])git (commit|push)\b[^']*--no-verify/.test(cmd)) {
          throw new Error(
            "--no-verify is blocked by project policy. Fix the hook failure instead: run task fmt, then address the actual error. Never bypass CI gates.",
          )
        }

        if (/(^|[;&| \t])git (checkout|switch).*--detach/.test(cmd)) {
          throw new Error(
            "Detaching HEAD before a push to bypass ci:fast is blocked. Check out the branch directly: git checkout <branch-name>.",
          )
        }

        if (cmd.includes("gh pr merge") && cmd.includes("--admin")) {
          throw new Error(
            "--admin merge is blocked: it bypasses required CI status checks. Use instead: task agent:pr-merge (waits for CI to pass, then merges).",
          )
        }

        if (/(^|[;&| \t])git commit/.test(cmd) && !isWorktreeCommand(cmd)) {
          const branch = getGitBranch()
          if (branch === "main") {
            throw new Error(
              "Direct commits to main are blocked. Create a feature branch first: task agent:worktree-new -- feat/<scope>. Then commit there and open a PR with gh pr create.",
            )
          }
        }
      }

      // ── Edit/Write enforcement (mirrors main-branch-block.sh) ─────────────
      if (tool === "edit" || tool === "write") {
        const filePath = output.args?.file_path ?? output.args?.path ?? ""

        if (filePath.includes("/.worktrees/") || filePath.includes("/.worktree/")) return

        const branch = getGitBranch()
        if (branch === "main") {
          throw new Error(
            "File operations on main are blocked. Create a feature branch first: task agent:worktree-new -- feat/<scope>.",
          )
        }
      }
    },

    // ── PostToolUse equivalent: keep code-review-graph current ────────────────
    "tool.execute.after": async (input: { tool: string }) => {
      const tool = input.tool.toLowerCase()
      if (["edit", "write", "bash"].includes(tool)) {
        try {
          execSync("code-review-graph update --skip-flows", { stdio: "ignore", timeout: 30_000 })
        } catch {
          // Non-blocking — graph update is best-effort
        }
      }
    },

    // ── SessionStart equivalent: branch advisory ───────────────────────────────
    "session.created": async () => {
      const branch = getGitBranch()
      if (branch === "main") {
        console.warn(
          "[control-plane] WARNING: current branch is main. For implementation work, invoke superpowers:using-git-worktrees and run: task agent:worktree-new -- feat/<scope> before writing any code.",
        )
      }
    },
  }
}
