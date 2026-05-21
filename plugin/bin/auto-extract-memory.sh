#!/usr/bin/env bash
#
# Auto-extract (plugin version): invoked by the Stop hook in the background.
#
# Args:
#   $1 — path to a temp file containing the assistant turn's text
#
# Env (set by the calling hook):
#   CMK_PROJECT_DIR — the user's project directory (where context/ lives)
#
# Reads context/MEMORY.md from the user's project, NOT the plugin dir.

case ":$PATH:" in
    *":/usr/bin:"*) ;;
    *) export PATH="/usr/bin:/usr/local/bin:/opt/homebrew/bin:/c/Program Files/Git/usr/bin:$PATH" ;;
esac

set -u

TURN_FILE="${1:-}"
[ -z "$TURN_FILE" ] && exit 0
[ ! -f "$TURN_FILE" ] && exit 0

PROJECT_DIR="${CMK_PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-$PWD}}"
cd "$PROJECT_DIR"

# No-op if the project hasn't been bootstrapped yet.
[ ! -d "$PROJECT_DIR/context" ] && { rm -f "$TURN_FILE"; exit 0; }

TODAY=$(date +%Y-%m-%d)
LOG="${PROJECT_DIR}/context/sessions/${TODAY}.extract.log"
mkdir -p "$(dirname "$LOG")"

TURN_TEXT=$(cat "$TURN_FILE")
trap "rm -f \"$TURN_FILE\"" EXIT

TURN_LEN=${#TURN_TEXT}
if [ "$TURN_LEN" -lt 100 ]; then
    echo "[$(date -Iseconds)] skip: turn too short ($TURN_LEN chars)" >> "$LOG"
    exit 0
fi

PROMPT=$(cat <<EOF
You are running as a silent background auto-extract task for this project. No one is watching this output. Be CONSERVATIVE — only capture what is clearly durable. Most turns will have nothing to save. That is the correct outcome.

GOAL: look at the assistant turn below and decide whether the user (in the conversation that produced it) said anything that should be saved to memory. If yes, write it to context/MEMORY.md, context/USER.md, or context/memory/<type>_<slug>.md using the claude-memory-kit:memory-write skill.

EXTRACT and SAVE only when one of these is clearly present:
- User explicitly asked to remember ("remember this", "note that", "save this", "from now on", "going forward", "i prefer")
- User made a concrete decision worth carrying forward
- User corrected the assistant
- Assistant acknowledged a NEW environment fact not already in MEMORY.md / USER.md
- Assistant identified a durable rule with "Why:" / "How to apply:" structure

DO NOT save:
- Conversational chatter
- One-off task execution narration
- Information already in MEMORY.md / USER.md / context/memory/
- Anything you would summarize as "we discussed X" without a concrete decision

STEPS:
1. Read context/MEMORY.md, context/USER.md, and context/memory/INDEX.md to know current state.
2. Read the turn content below.
3. If anything durable is present, use the memory-write skill rules.
4. If nothing durable: exit silently.
5. Output ONE line: either "saved: <one-line summary>" or "skip: nothing durable".

CONSTRAINTS:
- Use Read, Edit, and Bash(wc *) only.
- Do NOT create files outside context/memory/.
- Do NOT commit, push, or run git operations.
- Do NOT print anything except the one-line outcome.

=== TURN CONTENT ===
${TURN_TEXT}
=== END TURN ===
EOF
)

echo "[$(date -Iseconds)] auto-extract fired on turn len=$TURN_LEN" >> "$LOG"

OUTPUT=$(echo "$PROMPT" | claude --print \
    --add-dir "$PROJECT_DIR" \
    --allowed-tools "Read" "Edit" "Bash(wc *)" \
    --output-format text \
    2>&1)
EXIT=$?

echo "[$(date -Iseconds)] auto-extract exit=$EXIT output: $OUTPUT" >> "$LOG"
exit 0
