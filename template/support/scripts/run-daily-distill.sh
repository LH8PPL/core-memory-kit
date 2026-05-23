#!/usr/bin/env bash
#
# Daily memory distill — invokes Claude headlessly with a prompt that reads
# today's session log and extracts durable facts into context/MEMORY.md.
#
# Wired by cron/jobs/daily-memory-distill.md → schtasks/cron at 23:00 daily.
# Logs to context/sessions/{today}.md under a "## Automated distill" heading
# so the work is traceable.

# When run from Task Scheduler / cron / launchd, PATH may not include the
# directories where bash builtins or Claude CLI live. Set up explicitly.
case ":$PATH:" in
    *":/usr/bin:"*) ;;
    *) export PATH="/usr/bin:/usr/local/bin:/opt/homebrew/bin:/c/Program Files/Git/usr/bin:$PATH" ;;
esac

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

TODAY=$(date +%Y-%m-%d)
SESSION_LOG="context/sessions/${TODAY}.md"

if [ ! -f "$SESSION_LOG" ]; then
    echo "[$(date -Iseconds)] daily-distill: no session log at $SESSION_LOG; nothing to distill" >&2
    # Still refresh the timestamp so HC-3 stays green.
    python "${REPO_ROOT}/scripts/refresh-distill-timestamp.py" || true
    exit 0
fi

PROMPT=$(cat <<EOF
You are running as a scheduled background task at $(date -Iseconds) for this project. No human is watching. Be concise and idempotent.

GOAL: distill durable facts from today's session log into the bounded scratchpad.

STEPS:
1. Read \`${SESSION_LOG}\`. This is today's session log with deliverables, decisions, and open threads.
2. Read \`context/MEMORY.md\` to see what's already captured (active threads, environment notes, pending decisions).
3. Read \`context/memory/INDEX.md\` to see what's already in the granular archive.
4. For each meaningful item in the session log:
   - If it's transient working state (current discussion, today's iteration) → if not already in MEMORY.md "Active Threads", add a one-line bullet there.
   - If it's a durable typed fact (user preference learned, project decision made, feedback rule, external reference) → create or update a granular file at \`context/memory/<type>_<slug>.md\` with frontmatter + Why + How to apply. Add a one-line entry to INDEX.md. Don't duplicate in MEMORY.md.
   - If it's an environment change (new tool installed, path discovered) → MEMORY.md "Environment Notes".
   - If it's a decision the user still needs to make → MEMORY.md "Pending Decisions".
5. Before writing MEMORY.md, run \`wc -c context/MEMORY.md\`. If over 2500 chars, FIRST consolidate by merging similar bullets and dropping stale ones (anything older than 14 days that has no current relevance). Then add the new content.
6. Update the \`<!-- Last distilled: YYYY-MM-DD -->\` line at the top of MEMORY.md to ${TODAY}.
7. Append a one-line entry to \`${SESSION_LOG}\` under a new "## Automated distill" heading describing what changed.

CONSTRAINTS:
- Use the Read, Edit, and Bash tools only. Do NOT use Write to overwrite MEMORY.md — use Edit so the metadata comment is preserved.
- Do NOT create new files outside context/memory/ or modify anything outside context/.
- Do NOT commit, push, or run git operations.
- If the session log has nothing distillable, still update the timestamp on MEMORY.md so HC-3 stays green, and append a "## Automated distill" note saying "nothing new to distill."
- Keep total output under 3 paragraphs.
EOF
)

echo "$PROMPT" | claude --print \
    --add-dir "$REPO_ROOT" \
    --allowed-tools "Read" "Edit" "Bash(wc *)" "Bash(date *)" \
    --output-format text \
    2>&1 | tee -a "${REPO_ROOT}/context/sessions/${TODAY}.distill.log"

EXIT=${PIPESTATUS[0]}
echo "[$(date -Iseconds)] daily-distill: exit=$EXIT" >&2
exit "$EXIT"
