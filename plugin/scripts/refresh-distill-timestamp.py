#!/usr/bin/env python3
"""
Tiny helper for the daily-memory-distill cron job.

Rewrites the `<!-- Last distilled: YYYY-MM-DD -->` line in
context/MEMORY.md to today's date. Keeps HC-3 green even when the real
distillation (Claude-driven extraction of facts from sessions/) isn't
wired up yet.

Usage:
  python scripts/refresh-distill-timestamp.py
"""

from __future__ import annotations

import datetime
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
MEMORY = REPO_ROOT / "context" / "MEMORY.md"

if not MEMORY.exists():
    print(f"ERROR: {MEMORY} not found", file=sys.stderr)
    sys.exit(1)

today = datetime.date.today().isoformat()
text = MEMORY.read_text(encoding="utf-8")
new_text, n = re.subn(
    r"Last distilled: \d{4}-\d{2}-\d{2}", f"Last distilled: {today}", text, count=1
)
if n == 0:
    print(
        "WARN: no 'Last distilled:' line found in MEMORY.md; nothing to update",
        file=sys.stderr,
    )
    sys.exit(0)
MEMORY.write_text(new_text, encoding="utf-8")
print(f"OK: updated Last distilled to {today}")
