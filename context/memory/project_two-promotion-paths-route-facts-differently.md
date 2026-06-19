---
id: P-NNNBBSJZ
type: project
title: Two Promotion Paths Route Facts Differently
created_at: 2026-06-19T21:05:05Z
write_source: auto-extract
trust: medium
source_file: auto-extract
source_line: 1
source_sha1: 186636e3e5ebf730b2076eb2247712c9406672ca77e4c49e33fe48cfd678d557
---

- **Auto-persona** (session-end LLM synthesizer): routes facts by topic across multiple files, spreads facts broadly
- **Explicit-promote** (`mk_lessons_promote` called in-chat): routes to default section HABITS.md § Working Style, concentrates facts in one place
- Both have 1800B per-section cap
- When explicit-promote fires repeatedly, facts pile up in one section, overflow, and older facts graduate to fragments
- Same architecture fact appeared in LESSONS.md (prior cut-gates, auto-persona) vs fragments (cut-gate17, explicit-promote overflow)

**Why:** The two capture mechanisms have different routing strategies — not a v0.3.4 code change (verified zero persona-related changes in v0.3.4), but which *mechanism fired* on that run. Auto-persona spreads; explicit-promote concentrates. This finding sharpens Task 151 for v0.4.

**How to apply:** When a fact migrates between files across sessions, check which promotion path triggered (auto-persona at session-end vs explicit-promote in-chat) before assuming a code regression. In v0.4, make explicit-promote topic-aware like auto-persona to avoid concentration in one section.
