---
id: P-AAHW235S
type: project
shape: State
title: L3 promote 20s judge timeout starves the committed transcript on slow-Haiku (same class as D-179)
created_at: 2026-07-08T14:47:27Z
write_source: user-explicit
trust: high
recurrence_count: 1
source_file: user-explicit
source_line: 1
source_sha1: e6397446c42e9bbb6049ad7ebef45a84a5d4ee775026cc99d65f703195a8c6f1
related: [ceiling-free-compress-callers-used-hook-sized-timeout-d-179, task-148-auto-judged-privacy-layered-screen-architecture]
---

The L3 transcript-promote judge's 20s timeout (PII_JUDGE_TIMEOUT_MS) is too tight for a slow-Haiku window — the promote defers every run, so the committed transcript never gets written (though containment is safe: fail-closed keeps everything in the gitignored live buffer). Proven live: deferred at 20s, promoted all 4 turns at 90s.

**Why:** Found in the v0.5.0 cold-open E2 re-test (cut-gate-coldopen-148b, 2026-07-08). The privacy screen's containment PASSED perfectly — but the committed transcript never appeared because promotePendingTranscripts kept deferring. Instrumented the real return: reason = "HaikuViaAnthropicApi: claude --print did not return within 20000ms". Same slow-Haiku window that made the extraction child take 63s and compress-session take 26s this session (the D-174/D-179 environmental-slowness class). Proven it's PURELY the budget, not a broken judge: same promote with timeoutMs:90000 succeeded — promoted all 4 turns, committed transcript landed SCREENED («USER» present, raw username count 0). So: (a) fail-closed works (deferred → everything stayed in the gitignored live buffer → nothing unscreened committed — the D-294 invariant held under a real judge timeout); BUT (b) the happy path is starved — on a slow-Haiku day the promote defers indefinitely, the committed transcript lags, and a user sees an empty committed transcript + assumes capture is broken (a bad-observability + eventual-data-completeness issue, though never a leak). This is the D-179 class exactly: PII_JUDGE_TIMEOUT_MS=20s was sized for the per-turn detached child's 25s internal budget + the 60s SessionEnd ceiling — but like the compress callers before D-179, a CEILING-FREE-ish site (the detached child, and the SessionEnd top-up which has 50s of headroom) shouldn't use a hook-tight timeout when the real claude --print takes 18-78s in a slow window.

**How to apply:** Raise PII_JUDGE_TIMEOUT_MS and/or make it site-aware, mirroring D-179's fix (CEILING_FREE_TIMEOUT_MS=120s for the detached/cron sites; the hook-tight value only where a ceiling truly binds). The per-turn detached child is fire-and-forget (no outer ceiling) so it can afford 90-120s; the SessionEnd top-up runs concurrently with 50s-budgeted siblings under the 60s ceiling, so it needs the tighter value OR the promote should be bounded per-file so it fits. Also consider: the retry/backoff D-179 added (CEILING_FREE_BACKOFF_MS=5s so a retry lands AFTER the slow window). AND fix the OBSERVABILITY — the summarizeSessionEnd line prints "deferred: 1" but NOT the reason; surface the defer reason (timeout vs reject-gate) so the next diagnosis doesn't need instrumentation. DECISION (the user's call): is this a v0.5.0 tag blocker? Argument AGAINST: containment is safe (never leaks), the screen works with adequate time, it's the same pre-existing slow-Haiku environmental class, and the tag is imminent. Argument FOR: on the cold-open (showcase) a user may see an empty committed transcript and think capture failed — a bad first impression, like the D-300 note. Likely v0.5.1 (bump the timeout) unless judged a showcase blocker. Relates D-179/D-174 (the ceiling-free-timeout class this repeats), D-294 (the fail-closed invariant that held), Task 148.8 (PROMOTE_MAX_FILES_PER_RUN — the composition sibling), P-355DF75F (the sibling cold-open cosmetic finding).
