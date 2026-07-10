---
id: P-FSaL7MCB
type: project
shape: State
title: Auto-extract works on Kiro (confirmed by direct probe) — the nothing_durable wall was contamination, not a bug
created_at: 2026-07-09T06:15:12Z
write_source: user-explicit
trust: high
recurrence_count: 1
source_file: user-explicit
source_line: 1
source_sha1: 5d6da4cd400596cf68b5fc9714a1f1330f4c4f9d9e1988983bcbd776d52e6605
related: [kiro-gate-contaminated-by-running-cli-checks-in-a-kiro-open, kiro-gate-v0-5-0-complete-all-3-sessions-pass-kit-works-end]
---

AUTO-EXTRACT WORKS ON KIRO — confirmed by direct probe, NOT a bug. The 11 nothing_durable runs on the Kiro gate were caused by MY contamination (I ran CLI checks in the Kiro-open folder so the extractor processed my assistant-only meta-text, not real turns), not a Kiro backend defect.

**Why:** The user pushed (2026-07-09): "we want everything to work on kiro like in claude code, so what doesn't work and how we fix it? ... just read the code, check files, run commands, maybe there is a bug in the automatic process in kiro." Direct diagnosis (the right move, not memory-searching): spawned the REAL KiroCliBackend with buildExtractionInstructions() against a real preference-stating turn (USER_TURN: 'always use uv never pip, .venv, ruff before commit' / ASSISTANT_TURN: ack). kiro-cli (28.6s, claude-haiku-4.5, prompt on stdin, --trust-tools=) returned PERFECTLY PARSEABLE output: 3 'TRUST_HIGH user:' lines (the exact uv/venv/ruff rules) + 3 'PERSONA CANDIDATE | target=HABITS.md ...' lines. The parser extracts all of these → auto-extract WORKS on Kiro identically to Claude. CONTROL probe: the SAME backend given an assistant-only/meta turn (like my gate-scoring prose that polluted the Kiro S1 folder) correctly returned 'SKIP — This turn is a meta-instruction about memory extraction itself... no facts about their work/setup/preferences/project conventions.' So the 11 nothing_durable runs on Kiro S1 (P-4VAY63ST) were the extractor CORRECTLY skipping my contaminated turn-files, NOT a backend/parse bug. The kiro-backend.mjs stdout cleaning (strip ANSI + leading '> ') works; the D-279/D-280 stdin-delivery fix works; the extraction prompt is NOT backend-sensitive. Nothing to fix.

**How to apply:** Kiro auto-extract needs NO fix — it works like Claude Code. The lesson is test-hygiene: NEVER run assistant CLI commands inside a gate folder while the agent-under-test has it open, or the detached auto-extract child captures the assistant's own meta-text and correctly SKIPs it, producing a misleading nothing_durable wall that looks like a bug. When diagnosing a nothing_durable wall: distinguish (a) backend never ran / errored = D-270 no-op class (dead backend), from (b) extractor ran + returned output but zero candidates. If (b), check WHAT the turn-file contained before assuming a parse bug — assistant-only or meta content SHOULD skip. To reproduce the working proof: spawn new KiroCliBackend().compress({input: a USER_TURN/ASSISTANT_TURN turn-file, instructions: buildExtractionInstructions()}) and confirm TRUST_HIGH/PERSONA CANDIDATE lines come back. This also confirms the v0.4.5 agent-relative backend (Task 200) delivers the extraction LLM correctly on kiro-cli. Kiro gate stays GREEN; move to Cursor. Relates P-4VAY63ST (the contamination that caused the false symptom), P-TBGK35LC (Kiro complete), the D-270 backend-resolution class, kiro-backend.mjs.
