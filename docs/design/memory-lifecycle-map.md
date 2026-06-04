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
  turn ─verbatim─> transcripts/{date}.md (durable, never pruned)
  turn ─buffer──> now.md ─compress(Haiku)─> today-{date}.md ─(truncate now.md)
  today (≤7d) ─distill─> recent.md (4096B)
  today (>7d) ─curate─> archive.md (4096B) ─then UNLINK the today file
```

---

## Edge-by-edge: intent vs. code

| # | Edge | Trust gate | Cap | Dedup | On evict/overflow | Intent vs code |
|---|---|---|---|---|---|---|
| 1 | **capture → route** (auto-extract) | H→mem, M→review queue, L→discard; assistant-origin demoted 1 level | — | within-call, **canonical-ID (literal only)** | **LOW discarded, no trace** | ~ low-loss is silent (G6); literal dedup misses rewordings (G5) |
| 2 | **explicit `cmk remember`** | terse→bullet, rich→fact file | bullet hits MEMORY.md cap | fact: by-ID; bullet: scratchpad | n/a | ✗ **no cross-store dedup** → bullet + fact file double-capture (G3) |
| 3 | **route → MEMORY.md** (appendScratchpadBullet) | high only (from auto-extract) | **2500B**, trigger 95% | none at append | consolidate, then CAP_EXCEEDED | ✗ no append-time content dedup |
| 4 | **MEMORY.md consolidate()** | drops **L/M only** | runs only on cap-trip | none | **HARD-DELETE, no tombstone** | ✗ violates §6.5 tombstone rule (G2) |
| 5 | **MEMORY.md → fact file (graduation)** | should move durable out | — | should dedup cross-store | — | ✗ **UNBUILT — 0 source hits** → write-lock (G1) |
| 6 | **high-trust supersede** | high ≥ high = "supersede" | — | — | **"continues to normal append"** | ✗ stale highs coexist forever (G4; design line 1956 admits "drops by AGE not VALIDITY") |
| 7 | **fact file store** (write-fact) | — | **none** | by-ID, refuse-overwrite on id-mismatch; reindex after | n/a | ~ correct dedup, but **unbounded** (disk-only, search-only) (G10) |
| 8 | **fact/scratchpad → index** (FTS5) | — | — | — | — | ? **consolidate() removes a bullet but does NOT reindex** → stale search hit until next reindex (G9, D-38 class) |
| 9 | **inject snapshot** (inject-context) | seed-strip (zero-sha1) | **10KB total + per-tier** | by bullet-ID | **tail `## ` section-drop** (logs NDJSON) | ~ real facts in tail sections silently un-injected; drop order = tail, not importance (G7) |
| 10 | **turn → transcript** (capture-turn) | — | **none** | — | — | ✓ verbatim, durable, **never pruned** (the recovery backstop) |
| 11 | **now.md → today** (compress-session) | — | — | — | **truncate now.md to 0** after Haiku summary | ~ raw turns dropped from now.md (survive in transcript); summary lossy (Task 84 hallucination class) |
| 12 | **today >7d → archive** (weekly-curate) | — | **archive 4096B, recent 4096B** | Haiku semantic + deterministic | **UNLINK the today file** | ~ session history >7d = lossy-Haiku into a 4KB cap + **source deleted** (G8) |
| 13 | **queues** (review / conflicts / persona-review) | — | **none** | by-ID (persona) | — | ~ leave only via user action; **never auto-pruned**, unbounded (G10) |
| 14 | **forget → tombstone** (forget.mjs) | — | — | — | **moveFactToTombstone** (deleted_at, recoverable) | ✓ correct — the contrast that makes edge #4 inconsistent |
| 15 | **user tier** (USER/HABITS/LESSONS) | promotion-gated | per-file 1375/1800/1800 | by-ID | same consolidate() (high never dropped) | ✗ same graduation-absent write-lock as MEMORY.md (G1 applies to persona too) |

---

## Consolidated gaps (the class, with severity + task home)

| Gap | What | Severity | Home |
|---|---|---|---|
| **G1** | Graduation unbuilt → MEMORY.md (and user tier) write-locks once full of high-trust | **BLOCKER** | Task 91 (filed) |
| **G2** | consolidate() hard-deletes L/M >14d, no tombstone (violates §6.5) | High | Task 91.2 (filed) |
| **G3** | No cross-store dedup → bullet + fact-file double-capture | High | Task 91.1 (filed) |
| **G4** | high-trust "supersede" just appends → stale highs coexist forever (drop-by-age-not-validity) | Med (v0.3) | F-D + temporal-validity §16.18 |
| **G5** | within-call dedup is literal canonical-ID; reworded restatements slip | Med (v0.3) | F-D (semantic dedup) |
| **G6** | LOW-trust discarded at capture with no trace/log of the content | Low | NEW — accept-or-log decision |
| **G7** | inject tail-section-drop omits real facts (logged) by tail-order, not importance | Med | NEW — prioritized-inject candidate |
| **G8** | session >7d: lossy-Haiku into 4KB archive **and source today-file deleted**; a durable fact never extracted to a fact file is gone from active memory after 7d (recoverable only via manual `cmk transcripts extract`) | Med | relates Task 80 (under-capture) + Task 84 (compression) |
| **G9** | consolidate() drops a MEMORY.md bullet but doesn't reindex → stale search hit (D-38 class) | Med | NEW — verify + fix |
| **G10** | fact-file store + queues grow unbounded (no cap/prune) | Low | disk-only; v0.2.x housekeeping |

---

## What's actually SOUND (so the map isn't all red)

- **Explicit `forget` tombstones** (recoverable) — the right pattern; edge #4 should copy it.
- **Transcripts are a verbatim, never-pruned backstop** — nothing is truly unrecoverable as long as the transcript survives; the gaps are about *active* memory, not the raw archive.
- **Fact-file dedup by content-ID + reindex-on-write** (Task 85) — the fact store stays index-consistent on the write path.
- **Sessions caps compose** (archive/recent 4096B, per-tier inject budgets sum to the snapshot cap — the PR-25 structural fix).
- **Poison_Guard + home-path sanitization** gate every write path (not a lifecycle-loss concern, but worth noting the write edges are screened).

---

## How to use this map

1. **Before adding a lifecycle invariant** (Task 91 graduation, any future cap/prune), find the rows it composes with and verify the cross-surface behavior — per the CLAUDE.md "Composition verification" rule. Graduation (edge #5) composes with #3/#4/#7/#8 — fill those `?`/`✗` before building.
2. **When you fix a gap**, flip its row ✗→✓ and note the commit, in the same batch.
3. **The `?` rows are unverified** — G9 (index staleness after consolidate) is the next one to confirm with a real test.

_Verification status: read from code 2026-06-04. Relates: D-54 (graduation), design §6.x/§7.1/§8/§6.5, Task 91, F-D, Task 80, Task 84, D-38._
