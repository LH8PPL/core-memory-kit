#!/usr/bin/env bash
#
# Auto-extract: invoked by the Stop hook in the background after every
# assistant turn. Reads the turn from a temp file, runs Claude headlessly
# with a focused fact-extraction prompt, and lets Claude write any
# durable facts to MEMORY.md / USER.md / granular archive via the
# memory-write skill.
#
# This is the "make it automatic" piece: instead of the user having to
# say "remember this", the system harvests memory-worthy content from
# every turn on its own.
#
# Args:
#   $1 — path to a temp file containing the assistant turn's text
#
# Detached from the parent hook — runs in background, fire-and-forget.
# Errors are swallowed (logged to context/sessions/{today}.extract.log).

# Detached process contexts don't always inherit Git Bash's PATH on
# Windows. Set it up explicitly. On Linux/macOS this is a no-op since
# /usr/bin is already present.
case ":$PATH:" in
    *":/usr/bin:"*) ;;
    *) export PATH="/usr/bin:/c/Program Files/Git/usr/bin:$PATH" ;;
esac

set -u

TURN_FILE="${1:-}"
[ -z "$TURN_FILE" ] && exit 0
[ ! -f "$TURN_FILE" ] && exit 0

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

TODAY=$(date +%Y-%m-%d)
LOG="${REPO_ROOT}/context/sessions/${TODAY}.extract.log"

TURN_TEXT=$(cat "$TURN_FILE")

trap "rm -f \"$TURN_FILE\"" EXIT

# Skip very short turns — nothing to extract.
TURN_LEN=${#TURN_TEXT}
if [ "$TURN_LEN" -lt 100 ]; then
    echo "[$(date -Iseconds)] skip: turn too short ($TURN_LEN chars)" >> "$LOG"
    exit 0
fi

PROMPT=$(cat <<EOF
You are running as a silent background auto-extract task for this project. No one is watching this output. Be CONSERVATIVE — only capture what is clearly durable. Most turns will have nothing to save. That is the correct outcome.

GOAL: look at the assistant turn below and decide whether the user (in the conversation that produced it) said anything that should be saved to memory. If yes, write it to context/MEMORY.md, context/USER.md, or context/memory/<type>_<slug>.md using the memory-write skill.

EXTRACT and SAVE only when one of these is clearly present:
- User explicitly asked to remember ("remember this", "note that", "save this", "from now on", "going forward", "i prefer")
- User made a concrete decision worth carrying forward ("we're using X not Y", "let's go with X")
- User corrected the assistant ("actually it's X not Y", "you got that wrong, X is the right answer")
- Assistant acknowledged a NEW environment fact not already in MEMORY.md / USER.md (new tool version, new path, new config)
- Assistant identified a durable rule with "Why:" / "How to apply:" structure

DO NOT save:
- Conversational chatter, hello/goodbye
- One-off task execution narration ("ran the script, got output X")
- Information already in MEMORY.md / USER.md / context/memory/ (check INDEX.md)
- Anything you would summarize as "we discussed X" without a concrete decision

STEPS:
1. Read context/MEMORY.md, context/USER.md, and context/memory/INDEX.md to know current state.
2. Read the turn content (passed as the user message of this conversation).
3. If anything durable is present, use the memory-write skill rules:
   - Choose the right file (scratchpad vs USER.md vs granular archive)
   - Dedup-check against existing content
   - Cap-check (consolidate first if over)
   - Write a single bullet, concise (<200 chars)
4. If nothing durable: exit silently. Do not write.
5. Output ONE line of plain text: either "saved: <one-line summary of what>" or "skip: nothing durable" — for the log.

CONSTRAINTS:
- Use Read, Edit, and Bash(wc *) only.
- Do NOT create new files outside context/memory/.
- Do NOT commit, push, or run git operations.
- Do NOT print anything except the one-line outcome.

=== TURN CONTENT ===
${TURN_TEXT}
=== END TURN ===
EOF
)

mkdir -p "$(dirname "$LOG")"
echo "[$(date -Iseconds)] auto-extract fired on turn len=$TURN_LEN" >> "$LOG"

OUTPUT=$(echo "$PROMPT" | claude --print \
    --add-dir "$REPO_ROOT" \
    --allowed-tools "Read" "Edit" "Bash(wc *)" \
    --output-format text \
    2>&1)
EXIT=$?

echo "[$(date -Iseconds)] auto-extract exit=$EXIT output: $OUTPUT" >> "$LOG"
exit 0
