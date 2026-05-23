#!/usr/bin/env bash
#
# Weekly memory curator — invokes Claude headlessly with a prompt that
# prunes, merges, and consolidates entries in context/MEMORY.md.
#
# Wired by cron/jobs/weekly-memory-curator.md → schtasks/cron at Sun 09:00.

case ":$PATH:" in
    *":/usr/bin:"*) ;;
    *) export PATH="/usr/bin:/usr/local/bin:/opt/homebrew/bin:/c/Program Files/Git/usr/bin:$PATH" ;;
esac

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

TODAY=$(date +%Y-%m-%d)
SESSION_LOG="context/sessions/${TODAY}.md"

PROMPT=$(cat <<EOF
You are running as a scheduled weekly background task at $(date -Iseconds) for this project. No human is watching. Be conservative — if unsure whether something should be kept, KEEP IT.

GOAL: prune, merge, and consolidate \`context/MEMORY.md\` so it stays informative and well under the 2500-char cap.

STEPS:
1. Read \`context/MEMORY.md\` end to end.
2. Read \`context/memory/INDEX.md\` and at least the most recent 3 session logs (\`ls -t context/sessions/ | head -3\`) for context on what's currently relevant.
3. For each entry in MEMORY.md "Active Threads":
   - Is it still being worked on? Check session logs. If resolved → REMOVE.
   - Are there duplicates? → MERGE into one.
4. For each "Environment Note":
   - Is it still accurate? Drop only if clearly stale.
5. For each "Pending Decision":
   - Has it been resolved (look for matching deliverables in recent session logs)? → REMOVE.
   - Has new context arrived? → UPDATE the bullet to reflect current state.
6. After curating, run \`wc -c context/MEMORY.md\` and report the new size.
7. Update the \`<!-- Last health check: YYYY-MM-DD -->\` line to ${TODAY}.
8. If today doesn't have a session log yet, create \`${SESSION_LOG}\` with a "## Session — automated curation" heading. Append a summary of what was changed (e.g., "Removed 2 resolved threads, merged 3 environment-notes duplicates, new size 1840/2500 chars.").

CONSTRAINTS:
- Use Read, Edit, and Bash(wc *), Bash(ls *), Bash(date *) only.
- NEVER add new content during curation — this is a cleanup pass, not a writing pass. If you find something missing, NOTE it in the session log but don't add to MEMORY.md.
- Do NOT touch granular archive files in context/memory/<type>_*.md unless they're obviously orphaned (no INDEX entry AND no references in MEMORY.md AND no recent session log mention).
- Do NOT commit, push, or run git operations.
- Keep total output under 5 lines: summary of changes only.
EOF
)

echo "$PROMPT" | claude --print \
    --add-dir "$REPO_ROOT" \
    --allowed-tools "Read" "Edit" "Bash(wc *)" "Bash(ls *)" "Bash(date *)" \
    --output-format text \
    2>&1 | tee -a "${REPO_ROOT}/context/sessions/${TODAY}.curate.log"

EXIT=${PIPESTATUS[0]}
echo "[$(date -Iseconds)] weekly-curate: exit=$EXIT" >&2
exit "$EXIT"
