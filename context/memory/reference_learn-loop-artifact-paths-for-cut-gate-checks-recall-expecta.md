---
id: P-43KTPTa2
type: reference
shape: Timeless
title: Learn-loop artifact paths for cut-gate checks (recall/expectations/trust-signals/judgment)
created_at: 2026-07-08T17:34:19Z
write_source: user-explicit
trust: high
recurrence_count: 1
source_file: user-explicit
source_line: 1
source_sha1: d7dec1ed75ff383e7777415920330590123c7958319c472c41716e9ac2e5de37
related: [memory-kit-loop-system-tasks-190-193, staged-release-observe-only-then-steering-wiring]
---

v0.5.0 learn-loop on-disk artifacts (for cut-gate checks): recall.log + expectations.log + trust-signals.log are gitignored NDJSON under context/.locks/; judgment_<slug>.md records live under context/memory/ (committed, via writeFact, type:judgment) — NOT under .locks/.

**Why:** Needed to author the learn-loop cut-gate check (missing from all 3 guides). The four artifacts + how each populates AUTOMATICALLY (no manual command — the D-169 discipline a gate check must honor): (1) context/.locks/recall.log (recall-log.mjs appendRecallEntry) — SessionStart inject writes source:'inject' with the snapshot's surviving citation ids; cmk search/mk_search write source:'search' with returned ids+query; (2) context/.locks/expectations.log (expectations.mjs, event-sourced NDJSON) — the Stop-hook capture path (captureTurn→capturePredictions) scans the turn for PREDICTION: lines (≥4 words, vague rejected, fenced code stripped), lands a PENDING entry; resolutions append HIT/MISS/REVERSAL, reader folds by id last-wins; (3) context/.locks/trust-signals.log (feedback-screen.mjs signalLogPath) — the Stop-hook judge (Task 192) detects turn-end outcomes (tool failure / user correction / expectation resolved) → deltas via applyTrustSignal → the feedback-screen (rate-limit ≤5/fact/UTC-day, burst-hold quarantine ≥10 signals >0.8 negative, audit); fail-open; (4) context/memory/judgment_<slug>.md (judgment.mjs, via writeFact — committed tier, type:judgment, starts PROVISIONAL n_episodes:1, only misses LOCK, remember/mk_remember cannot write this type). All three .locks logs gitignored (transient, like audit.log). v0.5.0 is OBSERVE-ONLY: signals logged, not yet ranking-applied (Task 194/v0.5.1 wires ranking, gated on this evidence).

**How to apply:** A learn-loop gate check asserts (driven ONLY by the SessionStart hook + a natural turn — NEVER run the populating cmk command, per D-169: a setup command masks the automatic path): (1) after SessionStart inject, recall.log has a source:'inject' line whose ids match the injected snapshot citations; a natural in-chat recall adds a source:'search' line; (2) a turn with a specific PREDICTION: line lands a PENDING expectations.log entry with NO manual command; (3) a turn-end outcome (failed tool call / user correction) writes a sane-delta line to trust-signals.log via the Stop hook alone; (4) a resolved expectation materializes a context/memory/judgment_<slug>.md (PROVISIONAL, type:judgment). Honest asymmetry: within-session the loop reliably fires on FAILURE signals (failed command, contradiction, PREDICTION:MISS) with no human trigger, but cannot self-confirm SUCCESS within-session (success is silent; value surfaces next-session on recall) — so a within-session gate proves failure-signals fire; success-confirmation is inherently cross-session. This IS the Task-194 release-gate artifact (v0.5.1 ranking approved only after real trust-signals.log evidence: sensible deltas, no false-positives, no storms). Caveat: the inject re-fire after compaction that repopulates recall.log is accidental/untested (no matcher, code never reads source:'compact') — pin it so a future matcher change can't silently break it. Per-agent: the loop rides the SAME capture/inject cores (captureTurn/injectContext) as Claude, so Kiro/Cursor differ only in the HOOK adapter that calls them — the gate check is identical, just triggered through each agent's hooks.
