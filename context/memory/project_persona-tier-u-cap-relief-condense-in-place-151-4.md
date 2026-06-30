---
id: P-ZVBQV4NG
type: project
title: Persona Tier-U Cap Relief — Condense In Place (151.4)
created_at: 2026-06-30T06:14:12Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: 1e31810b10b2705a69b941684cfb7a6d0b685b97904ca41220b091a74921cc1c
---

When USER/HABITS/LESSONS.md reach cap, prior behavior graduated high-trust traits to `fragments/`, which is NOT read at session cold-open, causing promoted traits to vanish. Fix (commit 8390c33): tier U now condenses in place (mechanical, no LLM) instead of graduating. Tier P graduation remains unchanged. Two-pass review also caught + fixed CRLF no-op bug (Windows line-ending handling).

**Why:** Cap overflow + invisibility at cold-open was a real bug (confirmed pre-fix). In-place condense preserves tier-U visibility.

**How to apply:** When persona tiers reach cap, condense tier U in place; tier P graduates as before. Never route tier-U overflow to fragments/.
