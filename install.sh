#!/usr/bin/env bash
#
# install.sh — install the memory system into a target project directory.
#
# Usage:
#   bash install.sh [TARGET_DIR]
#
# If TARGET_DIR is omitted, installs into the current directory.
# Copies template/ contents (with {{TODAY}} substitution) into TARGET_DIR.
# Skips any files that already exist — never overwrites user content.

set -euo pipefail

KIT_ROOT="$(cd "$(dirname "$0")" && pwd)"
TEMPLATE="$KIT_ROOT/template"
TARGET="${1:-$PWD}"

if [ ! -d "$TEMPLATE" ]; then
    echo "ERROR: template/ not found at $TEMPLATE" >&2
    exit 1
fi

TARGET="$(cd "$TARGET" && pwd)"
PROJECT_NAME="$(basename "$TARGET")"
TODAY="$(date +%Y-%m-%d)"

echo "Installing claude-memory-kit into: $TARGET"
echo "Project name: $PROJECT_NAME"
echo

mkdir -p "$TARGET/.claude/hooks" "$TARGET/.claude/skills/memory-write"
mkdir -p "$TARGET/context/memory" "$TARGET/context/sessions" "$TARGET/context/transcripts"
mkdir -p "$TARGET/scripts" "$TARGET/milvus-deploy" "$TARGET/cron/jobs"

copy_if_new() {
    local src="$1" dst="$2"
    if [ -f "$dst" ]; then
        echo "  SKIP  $dst (already exists)"
        return 0
    fi
    cp "$src" "$dst"
    echo "  COPY  $dst"
}

# Render a template file with {{TODAY}} / {{PROJECT_NAME}} substitution.
render_if_new() {
    local src="$1" dst="$2"
    if [ -f "$dst" ]; then
        echo "  SKIP  $dst (already exists)"
        return 0
    fi
    sed -e "s|{{TODAY}}|$TODAY|g" -e "s|{{PROJECT_NAME}}|$PROJECT_NAME|g" "$src" > "$dst"
    echo "  RENDER $dst"
}

echo "--- .claude/ ---"
copy_if_new "$TEMPLATE/.claude/settings.json"                          "$TARGET/.claude/settings.json"
copy_if_new "$TEMPLATE/.claude/hooks/transcript-capture.js"            "$TARGET/.claude/hooks/transcript-capture.js"
copy_if_new "$TEMPLATE/.claude/hooks/pre-tool-memory.js"               "$TARGET/.claude/hooks/pre-tool-memory.js"
copy_if_new "$TEMPLATE/.claude/skills/memory-write/SKILL.md"           "$TARGET/.claude/skills/memory-write/SKILL.md"

echo "--- context/ ---"
render_if_new "$TEMPLATE/context/USER.md.template"          "$TARGET/context/USER.md"
render_if_new "$TEMPLATE/context/MEMORY.md.template"        "$TARGET/context/MEMORY.md"
render_if_new "$TEMPLATE/context/SOUL.md.template"          "$TARGET/context/SOUL.md"
render_if_new "$TEMPLATE/context/memory/INDEX.md.template"  "$TARGET/context/memory/INDEX.md"
copy_if_new "$TEMPLATE/context/SETUP.md"                    "$TARGET/context/SETUP.md"

echo "--- scripts/ ---"
copy_if_new "$TEMPLATE/scripts/auto-extract-memory.sh"         "$TARGET/scripts/auto-extract-memory.sh"
copy_if_new "$TEMPLATE/scripts/memsearch-index-with-flush.sh"  "$TARGET/scripts/memsearch-index-with-flush.sh"
copy_if_new "$TEMPLATE/scripts/register-crons.py"              "$TARGET/scripts/register-crons.py"
copy_if_new "$TEMPLATE/scripts/refresh-distill-timestamp.py"   "$TARGET/scripts/refresh-distill-timestamp.py"
copy_if_new "$TEMPLATE/scripts/run-daily-distill.sh"           "$TARGET/scripts/run-daily-distill.sh"
copy_if_new "$TEMPLATE/scripts/run-weekly-curate.sh"           "$TARGET/scripts/run-weekly-curate.sh"

echo "--- milvus-deploy/ ---"
copy_if_new "$TEMPLATE/milvus-deploy/docker-compose.yml" "$TARGET/milvus-deploy/docker-compose.yml"
copy_if_new "$TEMPLATE/milvus-deploy/README.md"          "$TARGET/milvus-deploy/README.md"

echo "--- cron/jobs/ ---"
for f in "$TEMPLATE/cron/jobs/"*.md; do
    name="$(basename "$f")"
    copy_if_new "$f" "$TARGET/cron/jobs/$name"
done

echo "--- CLAUDE.md ---"
if [ -f "$TARGET/CLAUDE.md" ]; then
    echo "  SKIP  $TARGET/CLAUDE.md (already exists — see template/CLAUDE.md.template for the memory-system block to merge in)"
else
    render_if_new "$TEMPLATE/CLAUDE.md.template" "$TARGET/CLAUDE.md"
fi

# Make .sh scripts executable.
chmod +x "$TARGET/scripts/"*.sh 2>/dev/null || true

echo
echo "Done. Next steps:"
echo "  1. Open this project in Claude Code as the PRIMARY working directory."
echo "  2. Follow $TARGET/context/SETUP.md to install Layers 5 (memsearch) and 6 (cron jobs)."
echo "  3. See $KIT_ROOT/INSTALL-<your-os>.md for OS-specific prerequisite setup."
