#!/usr/bin/env bash
set -euo pipefail

STAMP_FILE=".claude/.kyiv1-daily-check-last-run"
TODAY="$(TZ=Europe/Kyiv date +%F)"

LAST_RUN=""
if [ -f "$STAMP_FILE" ]; then
  LAST_RUN="$(cat "$STAMP_FILE" 2>/dev/null || true)"
fi

if [ "$LAST_RUN" != "$TODAY" ]; then
  echo "$TODAY" > "$STAMP_FILE"
  cat <<EOF
{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"It's a new day (Europe/Kyiv date: $TODAY) since the kyiv1-daily-check skill last ran. Invoke the kyiv1-daily-check skill (.claude/skills/kyiv1-daily-check/SKILL.md) now, at the start of this conversation, before anything else."}}
EOF
fi
