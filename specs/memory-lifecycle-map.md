# Memory lifecycle map — intent vs. code reality (every edge where memory can be lost, duplicated, or blocked)

> **Why this file exists.** The 2026-06-04 cut-gate run kept surfacing the same
> class of bug one at a time: *a designed invariant the code doesn't actually
> enforce — surfacing as silent data loss, duplication, or a blocked write at a
> composition boundary.* `design.md` describes **intent**; this map pins intent
> against **code reality** at every stage a piece of memory passes through, so the
> whole class is visible at once instead of discovered conversation-by-conversation.
> Built by reading the code at each edge on **2026-06-04** (commit after D-54).
> When you change a lifecycle module, update the matching row in the SAME batch.

Legend: ✓ intent matches code · ✗ gap (design says X, code does Y) · ~ partial / logged-but-lossy · ? unverified (needs an audit pass).

---

## The flow (one fact's journey)

```
                      ┌─ user states it ──────────────┐
                      │                                │
  conversation turn ──┤                                ▼
                      │                   auto-extract (Haiku, Stop hook)
                      │                     │ trust routing:
                      │                     ├─ HIGH   → MEMORY.md (Active Threads)
                      │                     ├─ MEDIUM → queues/review.md  (waits for you)
                      │                     └─ LOW    → DISCARDED (no trace)
                      │
                      └─ explicit: cmk remember
                            ├─ terse → MEMORY.md bullet
                            └─ rich  → context/memory/<type>_<slug>.md (fact file)

  MEMORY.md (2500B cap) ──95%──> consolidate(): drop L/M >14d (HARD-DELETE)
       │                                          high-trust NEVER dropped
       │                          still over cap → CAP_EXCEEDED (write REJECTED)
       │
       └─ (graduation: durable → fact file) ……… UNBUILT

  fact files ──reindex──> .index/ (FTS5) ──> cmk search
  scratchpads ──seed-strip, per-tier cap, tail-drop──> inject (10KB) ──> session

  SESSIONS (parallel diary):
  turn ─L1 mask─> transcripts/{date}.live.md (gitignored) ─L3 judge─> transcripts/{date}.md (screened, durable, never pruned)
  turn ─buffer──> now.md ─compress(Haiku)─> today-{date}.md ─(truncate now.md)
  today (≤7d) ─distill─> recent.md (4096B)
  today (>7d) ─curate─> archive.md (4096B) ─then UNLINK the today file
```

---

## Edge-by-edge: intent vs. code

| # | Edge | Trust gate | Cap | Dedup | On evict/overflow | Intent vs code |
|---|---|---|---|---|---|---|
| 1 | **capture → route** (auto-extract) | H→mem, M→review queue, L→discard; assistant-origin demoted 1 level | — | within-call, **canonical-ID (literal only)** | **LOW discarded → `low_trust_discarded` trace in extract.log** | ✅ G6 fixed (Task 92, D-67): drop logs excerpt+reason; literal dedup still misses rewordings (G5) |
| 2 | **explicit `cmk remember`** | terse→bullet, rich→fact file | bullet hits MEMORY.md cap | fact: by-ID; bullet: scratchpad | n/a | ✗ **no cross-store dedup** → bullet + fact file double-capture (G3) |
| 3 | **route → MEMORY.md** (appendScratchpadBullet) | high only (from auto-extract) | **2500B**, trigger 95% | none at append | consolidate, then CAP_EXCEEDED | ✗ no append-time content dedup |
| 4 | **MEMORY.md consolidate()** | drops **L/M only** | runs only on cap-trip | none | **HARD-DELETE, no tombstone** | ✗ violates §6.5 tombstone rule (G2) |
| 5 | **MEMORY.md → fact file (graduation)** | high-trust only | cap-pressure trigger | cross-store by content-id (writeFact) | bullet removed from hot index | ✓ **BUILT — cap-pressure safety valve, transactional** (Task 91, shipped PR #113) — project MEMORY.md only, search-only (recall = Task 75); user-tier graduation still deferred |
| 6 | **high-trust supersede** | high ≥ high = "supersede" | — | — | **"continues to normal append"** | ✗ stale highs coexist forever (G4; design line 1956 admits "drops by AGE not VALIDITY") |
| 7 | **fact file store** (write-fact) | — | **none** | by-ID, refuse-overwrite on id-mismatch; reindex after | n/a | ~ correct dedup, but **unbounded** (disk-only, search-only) (G10) |
| 8 | **fact/scratchpad → index** (FTS5) | — | — | — | — | ✓ index can be transiently stale (consolidate() doesn't reindex), but `cmk search`/`mk_search` run **`reindexBoot` (mtime+sha1 diff) BEFORE querying** → no user-visible stale hit (G9 verified NOT a gap, 2026-06-04) |
| 9 | **inject snapshot** (inject-context) | seed-strip (zero-sha1) | **10KB total + per-tier** | by bullet-ID | **importance-ordered `## ` section-drop** (lowest-value first; logs NDJSON) | ✅ G7 fixed (Task 93, D-66): drops lowest aggregate-trust/oldest section first, not tail. _Total-cap fallback still tier-tail (v-next)._ |
| 10 | **turn → transcript** (capture-turn → live buffer → L3 judge → committed) | — | **none** | — | — | ✓ durable, **never pruned** (the recovery backstop). **Task 148 (ADR-0019): no longer verbatim** — each turn is L1-masked (email/phone/username) into the gitignored `{date}.live.md`, then the async L3 privacy judge screens it into the committed `{date}.md` (fail-closed: judge down → stays in the buffer, never an unscreened commit). |
| 10b | **capture/fact write → L1 privacy mask** (pii-patterns) | — | — | — | — | ✅ Task 148.1/148.2 (ADR-0019): every commit-eligible write (transcript turn, `cmk remember`/`mk_remember`, fact body/title) is masked BEFORE hash/dedup/disk; each redaction → gitignored `redactions.log` (recoverable). Kill-switch `privacy.screen: off`. |
| 10c | **fact candidate → sensitivity route** (auto-extract) | — | — | — | **`drop` → `sensitivity_drop` (no text); `local-only` → gitignored `context.local/private.md`** | ✅ Task 148.5 (ADR-0019): the classifier's privacy axis diverts sensitive facts off the committed tier (and off the review queue) — `commit` is the default; an unrecognized value routes `local-only`, never a silent commit. |
| 11 | **now.md → today** (compress-session) | — | — | — | **truncate now.md to 0** after Haiku summary | ~ raw turns dropped from now.md (survive in transcript); summary lossy (Task 84 hallucination class). **Task 148 (review I1): the committed `today-{date}.md` is privacy-screened** — the compress prompt keeps names/PII out of the summary + the OUTPUT is L1-masked before the committed write (now.md itself carries L1-masked prose; tool output never enters now.md). |
| 12 | **today >7d → archive** (weekly-curate) | — | **archive 4096B, recent 4096B** | Haiku semantic + deterministic | **UNLINK the today file** | ~ session history >7d = lossy-Haiku into a 4KB cap + **source deleted** (G8) |
| 13 | **queues** (review / conflicts / persona-review) | — | **none** | by-ID (persona) | — | ~ leave only via user action; **never auto-pruned**, unbounded (G10) |
| 14 | **forget → tombstone** (forget.mjs) | — | — | — | **moveFactToTombstone** (deleted_at, recoverable) | ✓ correct — the contrast that makes edge #4 inconsistent |
| 15 | **user tier** (USER/HABITS/LESSONS) | recurrence-gated (Task 151: recurrence ≥3 OR confidence=high) | per-file 1375/1800/1800 | by-ID | same consolidate() (high never dropped) | ✓ **DEMOTE-NOT-EVICT (Task 151.4, v0.4.3)** — at cap the persona **condenses in place** (drops no bullet), never graduates a promoted trait out to un-injected `fragments/`; the file may grow past the inject budget (load-cap, not write-cap) and the importance-aware load-cap keeps the high-trust slice injected. _Fixes the old graduation-absent write-lock (Hole B) that stranded promoted traits at cold-open._ |
| 16 | **declared expiry** (expiry-sweep.mjs + search filter; Task 66.3, v0.4.4) | any trust — the WRITER declared the end (`--expires` / `mk_remember expires` / auto-extract `expires:` for stated dates only) | — | — | **read-time: hidden from search** (`--include-expired` reveals, human-only like tombstones) **+ weekly-curate sweep: tombstone via forget()** (audited `expiry-sweep`, recoverable) | ✓ correct by construction — reuses edge #14's tombstone path, never hard-deletes; DISTINCT from edge #4's staleness drop (declared-validity-end vs age; an expiry never renews on access). D-258 |
| 17 | **temporal supersede** (temporal-sweep.mjs → validity-window.mjs; Tasks 66.4+66.2 v0.4.4, **cadence widened Task 198 v0.4.5**) | State-shape facts only; verdict by a batched Haiku judge (10/10 twice on the real corpus, D-259). **Runs at EVERY Haiku site — SessionEnd + SessionStart-lazy + weekly backstop (Task 198/D-266)**, not weekly-only, so a stale pair closes by the NEXT session boundary (was ≤7 days). Candidates: FTS OR-query, or **title-embedding KNN θ=0.80 when semantic/hybrid (198.2)** | MAX 20 pairs/sweep (overflow counted, re-derived next pass — never silent); idle = no-new-facts short-circuit → zero Haiku | DUPLICATE verdict → `recurrence_count` bump (the 151 signal) | **SUPERSEDES → close the older window** (`ended_at` = newer `created_at`, event-time; `status: completed`; move to archive/superseded/ — edge #14-style, never delete) + trust dampen (151.8) + a one-line SessionStart mention | ✓ **closes G4** (stale highs coexisting forever — the D-166 Bug-2 class): the drop-by-age-not-validity gap now has a validity mechanism, tightened to per-session so the misleading window is a boundary not a week; COEXIST pairs stay untouched (D-221 closed negative — latest-wins, no tension-holding) |
| 18 | **recall-log** (recall-log.mjs; Task 190, v0.5.0) | every inject + search appends `{source, ids}` — zero-result queries log too (a MISS is a judge signal) | best-effort append, never throws (hook safety) | — | gitignored `.locks`-class diagnostic — IDs + query only, never bodies | ✓ correct by design — attribution plumbing, not memory; losing the log loses only attribution, never a durable fact |
| 19 | **expectation → judgment evidence** (expectations.mjs → judgment.mjs; Task 191, v0.5.0) | pre-registered `PREDICTION:` lines resolve to append-only `judgment_*.md` evidence entries | — | one judgment file per method-slug (evidence accretes, never rewritten) | judgments NEVER rank or auto-pick — provisional → corroborated/contested; a HIT/MISS/REVERSAL cycle → contested → surfaced to the user | ✓ correct — the earned-not-asserted posture (ADR-0017; the §5 scale-floor honored) |
| 20 | **judge → trust delta** (judge-signals.mjs → trust-signal.mjs; Task 192, v0.5.0) | 4 deterministic detectors (tool-result ±, correction −, re-ask −, silent-success weak-+); watermarked so signals measure evidence, not turn cadence | — | — | all deltas route through edge #21's screen — no direct-mutation path | ✓ correct — no LLM self-grading in the loop (the self-judge-circularity line) |
| 21 | **feedback-screen** (feedback-screen.mjs; Task 193, v0.5.0) | rate-limit per fact + burst-hold on systemic events (a broken suite can't tank every fact at once) | trust floor 0.05 — decay can NEVER delete | — | quarantined/rate-limited deltas logged; every delta audited | ✓ correct — the loop's own Poison_Guard, built BEFORE the judge could emit a signal (ADR-0017 Phase-1 ordering) |

---

## Consolidated gaps (the class, with severity + task home)

| Gap | What | Severity | Home |
|---|---|---|---|
| **G1** | ~~Graduation unbuilt → write-lock~~ — **project MEMORY.md graduation SHIPPED** (Task 91, PR #113; cap-pressure safety valve, transactional, search-only); user-tier graduation still deferred | shipped | Task 91 (#113) |
| **G2** | consolidate() hard-deletes L/M >14d, no tombstone (violates §6.5) | High | Task 91.2 (filed) |
| **G3** | No cross-store dedup → bullet + fact-file double-capture | High | Task 91.1 (filed) |
| **G4** | high-trust "supersede" just appends → stale highs coexist forever (drop-by-age-not-validity) | Med (v0.3) | F-D + temporal-validity §16.18 |
| **G5** | within-call dedup is literal canonical-ID; reworded restatements slip | Med (v0.3) | F-D (semantic dedup) |
| **G6** | LOW-trust discarded at capture with no trace/log of the content | Med | ✅ **Task 92** (shipped 2026-06-05, D-67) — `low_trust_discarded` excerpt+reason trace to extract.log (log-only); extract.log gitignored (raw un-screened excerpts). |
| **G7** | inject tail-section-drop omits real facts (logged) by tail-order, not importance | Med | ✅ **Task 93** (shipped 2026-06-05, D-66) — `truncateTierToBudget` evicts lowest-value section first (trust→recency→tail tiebreak); strict generalization of tail-drop. _Follow-up: total-cap fallback still drops whole tiers persona-first (v-next)._ |
| **G8** | session >7d: lossy-Haiku into 4KB archive **and source today-file deleted**; a durable fact never extracted to a fact file is gone from active memory after 7d (recoverable only via manual `cmk transcripts extract`) | Med | relates Task 80 (under-capture) + Task 84 (compression) |
| **G9** | ~~stale search hit after consolidate~~ — **NOT a gap (verified 2026-06-04):** `cmk search`/`mk_search` run `reindexBoot` (mtime+sha1) before every query → self-heals | — | resolved, no fix needed |
| **G10** | fact-file store + queues grow unbounded (no cap/prune) | Low | disk-only; v0.2.x housekeeping |

---

## What's actually SOUND (so the map isn't all red)

- **Explicit `forget` tombstones** (recoverable) — the right pattern; edge #4 should copy it.
- **Transcripts are a verbatim, never-pruned backstop** — nothing is truly unrecoverable as long as the transcript survives; the gaps are about *active* memory, not the raw archive.
- **Fact-file dedup by content-ID + reindex-on-write** (Task 85) — the fact store stays index-consistent on the write path.
- **Sessions caps compose** (archive/recent 4096B, per-tier inject budgets sum to the snapshot cap — the PR-25 structural fix).
- **Poison_Guard + home-path sanitization + the auto-judged privacy screen** gate every write path (not a lifecycle-loss concern, but worth noting the write edges are screened). Poison_Guard catches *secrets*; the Task-148 privacy screen (L1 patterns + L3 judge, edges 10/10b/10c) catches *personal/sensitive content* so nothing private reaches a committed tier — the transcript is screened before commit, and sensitive facts route local-only or drop.

---

## How to use this map

1. **Before adding a lifecycle invariant** (Task 91 graduation, any future cap/prune), find the rows it composes with and verify the cross-surface behavior — per the CLAUDE.md "Composition verification" rule. Graduation (edge #5) composes with #3/#4/#7/#8 — fill those `?`/`✗` before building.
2. **When you fix a gap**, flip its row ✗→✓ and note the commit, in the same batch.
3. **All `?` rows resolved as of 2026-06-04** (G9 verified not-a-gap). Fixed: G1 (Task 91 + 94, blocker), **G6 (Task 92, D-67, 2026-06-05)**, **G7 (Task 93, D-66, 2026-06-05)**. G4/G5/G8/G10 tracked under F-D / Task 80 / Task 84 / v0.2.x housekeeping.

_Verification status: read from code 2026-06-04. Relates: D-54 (graduation), design §6.x/§7.1/§8/§6.5, Task 91, F-D, Task 80, Task 84, D-38._
