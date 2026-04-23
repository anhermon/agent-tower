#!/usr/bin/env bash
# Bug-sweep probe — exercises every public route, reports status + common error markers.
# Usage: bash scripts/bug-sweep.sh [host]
HOST="${1:-http://127.0.0.1:3000}"
URLS=(
  "/"
  "/sessions"
  "/sessions/overview"
  "/sessions/activity"
  "/sessions/costs"
  "/sessions/tools"
  "/sessions/projects"
  "/agents"
  "/skills"
  "/webhooks"
  "/kanban"
  "/mcps"
  "/channels"
  "/replay"
  "/api/health"
)
for u in "${URLS[@]}"; do
  body_file=$(mktemp)
  status_line=$(curl -sS -o "$body_file" -w "%{http_code} %{time_total}s size=%{size_download}" --max-time 90 "${HOST}${u}" 2>&1) || status_line="CURL_FAILED"
  tokens=$(grep -oE "Internal Server Error|Application error:|Could not [a-z ]+|\[object Object\]|undefined is not|Cannot read|Error loading" "$body_file" 2>/dev/null | sort -u | tr '\n' ';')
  printf "%-32s %s  tokens=[%s]\n" "$u" "$status_line" "$tokens"
  rm -f "$body_file"
done
