#!/usr/bin/env bash
#
# Wraps `memsearch index` to also force a Milvus flush afterward.
#
# Why: Milvus v2.6+ uses the Woodpecker WAL backend, which (unlike v2.5's
# Pulsar) does not auto-flush growing segments on a short timer. As a result,
# `memsearch index` reports "Indexed N chunks" successfully but
# `get_collection_stats` returns 0 rows and search returns no results until
# a manual flush forces the growing segment to seal.
#
# This wrapper runs the index, then issues a flush via pymilvus.
#
# Usage:
#   bash scripts/memsearch-index-with-flush.sh context/memory context/sessions context/transcripts
#
# Reads MILVUS_URI from env (falls back to the memsearch config value, then localhost).
# Reads MILVUS_COLLECTION from env (falls back to memsearch config, then "memsearch_chunks").

# Task Scheduler / launchd / unattended cron contexts don't always inherit
# the user's PATH. Set it up explicitly for the common locations.
case ":$PATH:" in
    *":/usr/bin:"*) ;;
    *) export PATH="/usr/bin:/usr/local/bin:/opt/homebrew/bin:/c/Program Files/Git/usr/bin:$PATH" ;;
esac

# On Windows, also add the Python Scripts dir where `memsearch.exe` lands.
if [ -d "/c/Users/$USERNAME/AppData/Local/Programs/Python" ]; then
    for d in /c/Users/$USERNAME/AppData/Local/Programs/Python/Python*/Scripts \
             /c/Users/$USERNAME/AppData/Local/Programs/Python/Python*; do
        [ -d "$d" ] && export PATH="$d:$PATH"
    done
fi

set -euo pipefail

# Step 1 — index. Pass through all args.
memsearch index "$@"

# Step 2 — flush.
MILVUS_URI="${MILVUS_URI:-$(memsearch config get milvus.uri 2>/dev/null | tail -n1 | tr -d '\r')}"
MILVUS_COLLECTION="${MILVUS_COLLECTION:-$(memsearch config get milvus.collection 2>/dev/null | tail -n1 | tr -d '\r')}"
MILVUS_URI="${MILVUS_URI:-http://localhost:19530}"
MILVUS_COLLECTION="${MILVUS_COLLECTION:-memsearch_chunks}"

# Flush only if we're using a remote Milvus (milvus-lite auto-flushes).
case "$MILVUS_URI" in
    http://*|https://*|tcp://*)
        python -c "
from pymilvus import MilvusClient
client = MilvusClient(uri='${MILVUS_URI}')
client.flush('${MILVUS_COLLECTION}')
stats = client.get_collection_stats('${MILVUS_COLLECTION}')
print(f'Flushed. Collection {stats!r}')
"
        ;;
    *)
        echo "Local milvus-lite detected (${MILVUS_URI}); skipping flush (auto-flush)."
        ;;
esac
