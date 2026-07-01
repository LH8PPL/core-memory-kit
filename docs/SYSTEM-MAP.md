# SYSTEM-MAP — the kit as ONE system (whole + parts + the relationships between them)

> **Why this file exists.** The kit is easy to see as a bag of parts (tiers, hooks, search, a
> trust field) and hard to see as the ONE thing those parts compose into. This map holds **both
> at once** — the whole at the top, the parts as anatomy, and (the load-bearing layer) the
> **relationships/edges** between parts, because a system's important properties live in the
> relationships, not the elements. *"The system is something beside, and not the same as, its
> elements."* When you (or a future session) can only see parts, read this to re-see the whole.
>
> **Status:** living doc. The learn-loop and the "earned-judgment" regions are drawn faithfully —
> **including what is UNSOLVED and why** (a map that hides its blank regions is a lie). Grounded in
> the 2026-07-01 research (the 47-system failure-learning survey + the 10-system / 4-lens
> comparative-judgment study). Companion to [ADR-0017](adr/0017-memory-learn-loop-cross-session-runtime-judge-as-adapter.md)
> (the decision record) and [ARCHITECTURE.md](../ARCHITECTURE.md) (the layer/code map). This file is
> the *systemic* view; ARCHITECTURE.md is the *structural* view; design.md is the *mechanism* view.

---

## 0. The whole, in one sentence

**The kit is a continuity substrate that makes a sequence of bounded, amnesiac episodes behave as one
long-running, learning agent.**

Everything below is in service of that one sentence. If a change optimizes a part but weakens *that*,
it's the wrong change — the composition-verification discipline (CLAUDE.md) applied to the architecture
itself: separately-correct, jointly-broken.

The property that makes it a *system* and not a filing cabinet is **cross-session-ness** — and that
property lives in **no single file**. It lives in the *relationship between files across time*. You
cannot point at it; you can only point at the edges that produce it.

---

## 1. The system diagram (the shape — zoom OUT)

```
                          ┌───────────────────────────────────────────────────┐
                          │   THE WHOLE: continuity substrate over episodes    │
                          │   (bounded episodes → behave as one learning agent)│
                          └───────────────────────────────────────────────────┘
                                                 │ emerges from
                                                 ▼
   EPISODE N ───────────────────────────────────────────────────────────► EPISODE N+1
   (a bounded agent run: a session / an SRE alert / a task; human may steer)   (the next one)
        │                                                                          ▲
        │  ┌──────────────── THE LOOP (one cycle per… what? see §4 tension) ─────┐ │
        │  │                                                                     │ │
        ▼  ▼                                                                     │ │
   ┌─────────┐     ┌──────────┐      ┌───────────────┐      ┌──────────────┐    │ │
   │ ACQUIRE │────►│ RETRIEVE │─────►│ (agent acts)  │─────►│   MEASURE    │────┘ │
   │auto-    │     │ search + │      │ uses a recalled│      │ outcome →    │      │
   │extract  │     │ inject   │      │ memory         │      │ utility Δ    │      │
   └─────────┘     └──────────┘      └───────────────┘      └──────┬───────┘      │
        ▲                ▲                                          │              │
        │                │            ┌──────────┐                 │ feeds        │
        │                └────────────│  CURATE  │◄────────────────┘ (SHOULD)     │
        │                 re-rank/    │re-curate │   ⚠ TODAY THIS EDGE IS OPEN:    │
        │                 keep        │condense  │   MEASURE computes a signal     │
        │                             └──────────┘   that never reaches RETRIEVE   │
        │                                             ranking (BM25-only, §20.3)   │
        └───── the cross-session carry: the ONLY thing that survives the gap ──────┘
                          (this carry IS the whole; the gap is where amnesia lives)

   SIGNAL SOURCES into MEASURE (the "judge", per-host — see §3):
     automatic + no-oracle : tool-result · contradiction · recall-miss · peer-disagreement · used-vs-ignored
     human (optional)      : correction · cmk-forget · trust
     ORACLE (only richer hosts): benchmark pass · monitor-cleared · /goal · unit-test   ← IDE lacks these
```

**Read the diagram as a system, not a pipeline:** the arrows that matter most are the two that
*close* — MEASURE→CURATE→RETRIEVE (the learning) and EPISODE-N→EPISODE-N+1 (the continuity). A pipeline
is a line; a system is a line that *bites its own tail*. The kit's whole thesis is in the tail-biting.

---

## 2. The parts (the anatomy — zoom IN)

| Part | What it is | Ships? | The part in isolation |
| --- | --- | --- | --- |
| **Tiers** (P/L/U) | where memory lives (project/local/user) | ✅ | storage |
| **ACQUIRE** — auto-extract + `cmk remember` | capture durable facts each turn | ✅ | a writer |
| **RETRIEVE** — search + inject | surface facts (BM25 keyword + frozen snapshot) | ✅ | a reader |
| **MEASURE** — `trust_score` + passive signals | dampen/reinforce on contradiction/supersession/restatement | ✅ (partial) | a number per fact |
| **CURATE** — consolidate / graduate / re-curation | cap-relief, demote-not-evict, (dream re-curation = deferred) | 🟡 | a housekeeper |
| **The judge** (§3) | what tells MEASURE "good or bad" | ⚠️ mostly absent | a verdict source |
| **Earned-judgment** (§5) | "method A > method B", *learned* not told | ✗ unsolved-at-our-scale | a conclusion |

Each part is tractable alone. **None of them, alone, is the system.** ACQUIRE is a writer; RETRIEVE is a
reader; MEASURE is a number. The *learning* is not in any of them — it's in the **edges** (§3).

---

## 3. The relationships (the "something beside the elements" — the layer I keep dropping)

Nodes are parts; **edges are typed relationships**. This is the layer that decomposition destroys, so it
is written FIRST-CLASS here. Edge types: `closes-loop`, `composes-with`, `breaks`, `emerges-from`,
`constrained-by`, `open` (a relationship that *should* exist but doesn't yet).

```
ACQUIRE  ──feeds──►  RETRIEVE            (write-then-read; the base data flow)
RETRIEVE ──enables─► agent-acts          (a recalled fact influences a turn)
agent-acts ──produces──► an OUTCOME      (the turn goes well / badly)
OUTCOME  ──judged-by──►  THE JUDGE       (per-host: tool-result / user / oracle) ← §3 is the whole game
THE JUDGE ──feeds──►  MEASURE            (verdict → utility Δ)
MEASURE  ──SHOULD-close-loop-to──► RETRIEVE   ⚠ OPEN EDGE: today MEASURE ranks nothing (BM25-only, §20.3)
MEASURE  ──composes-with──► CURATE       (utility gates keep/demote/prune — ExpeL: gate SURVIVAL not just rank)
CURATE   ──feeds──►  RETRIEVE            (what survives is what's surfaced next)
EPISODE-N ──carries-to──► EPISODE-N+1 via TIERS   (THE cross-session edge — the whole emerges from THIS)

THE-WHOLE  ──emerges-from──►  {the two closing edges}   (continuity + learning; not from any node)

# constraints (edges that FORBID, the guardrails a part-change can violate):
MEASURE ──constrained-by──► §20.3        (must NOT rank hot-path by a naive score → the cautionary bug)
ANY-SIGNAL ──constrained-by──► D-169     (must NOT require a manual ritual → "memory just works")
ANY-WRITE ──constrained-by──► markdown-is-truth (ADR-0002)  (no neural-ranker weights; a fact is a file)
promotion ──constrained-by──► the silent-success asymmetry  (can prune reliably, can barely promote)
"A>B"-claim ──constrained-by──► the scale floor (§5)        (few episodes → provisional, never verified)
```

**Why the edges are the point (three worked examples of edge-blindness):**

1. **If I "add a MEASURE organ" as a part** — a bolted-on score — and wire it to rank retrieval, I
   satisfy the part but I **break the `constrained-by §20.3` edge** (naive-score ranking = the cautionary
   bug) *and* the `D-169` edge (if it needs a ritual). Separately-correct, jointly-broken. The edge
   caught it; the part-view couldn't.
2. **The learn-loop is not the MEASURE node** — it's the `MEASURE ──closes-loop-to──► RETRIEVE` **edge**,
   which is currently **OPEN**. The kit already *has* the MEASURE node (trust_score) and it does nothing,
   because the edge isn't drawn. "Build the learn-loop" = "close that one edge, without violating the
   two constraints on it." A part-list would say "MEASURE: ✅ ships" and miss that the system doesn't learn.
3. **Cross-session-ness emerges from the `EPISODE-N ──carries-to──► N+1` edge**, not from the tiers. Make
   the tiers bigger/faster (optimize the node) and you get nothing; the property is in the carry.

---

## 4. The loop's period — "one cycle per WHAT?" (the tension that decides everything)

The diagram draws a loop but hides a question: **how long is one turn of it?** This is the load-bearing
tension, because the loop's *learning power scales with the number of cycles*.

- **In Claude Code (IDE host):** a cycle spans **sessions** — MEASURE's verdict on a fact recalled today
  arrives *next* session (the user corrects it, re-asks, a test goes red). Few, slow cycles. Weak judge.
- **In an SRE agent (autonomous host):** a cycle spans **alerts** — act → monitor says cleared-or-not →
  log → next alert. Many, fast cycles. Strong (near-oracle) judge.

**Same loop. Same kit. The period and the judge change with the host.** This is why "IDE vs agent" was a
false distinction (§ADR-0017): it's not two systems, it's one system whose *cycle-rate and judge-quality*
are host parameters. **The judge is the per-host adapter** — exactly the Task-50 "per-agent-data-on-a-
shared-seam" pattern, applied to the feedback signal instead of the install.

The consequence is quantitative and it drives §5: the IDE host has too FEW cycles to earn strong
conclusions; the agent host has enough. So the kit's most ambitious learning is *latent in the IDE and
unlocked in an agent* — not because the code differs, but because the system runs its loop more times.

---

## 5. The UNSOLVED region (drawn honestly — the blank part of the map)

The loop can *update a fact's utility* from outcomes (that's the failure-learning organ, §3). It **cannot,
at the kit's scale, earn a verified "method A is better than method B."** This is not a gap we haven't
filled — it is **structurally unsolved at single-user / single-arm / non-replayable scale**, confirmed by
four independent lenses (bandits, Bradley-Terry, deliberate-practice, N-of-1):

- **Single-arm:** a live turn runs method A; B is the road not taken. You never observe both → "B would've
  been worse" is unfalsifiable. Earning A>B needs two arms; the kit sees one.
- **Scale floor:** best-arm identification needs ~hundreds of comparisons *per arm*; a user emits *dozens
  of method-verdicts per year*. Any "A>B" from 1–3 episodes is noise dressed as a judgment.
- **Silent-success asymmetry:** failure leaves traces (correction, re-ask, red test); a good silent recall
  leaves none. So the signal stream is mostly *negative* — the kit can prune far better than it can promote,
  and "A is better" is a *promotion* claim, the direction it's worst equipped for.
- **Self-judge circularity:** the only always-on rater is the model that made the method; it agrees with
  itself (measured self-preference bias 10–25%).

**Field verdict (10 systems):** ZERO earn a verified A>B oracle-free from a single non-repeatable trajectory.
Six cheat with a benchmark oracle; two delegate to an LLM-judge / refuse to rank; the two genuinely
oracle-free ones either need same-task *replay* (which a conversation can't furnish) or quietly answer the
easier question ("did this attempt pass its own checklist") instead of comparing A to B.

**The one thing that IS ready** (oracle-free, honest, fits the kit) — the wedge, not the mountain:

> **Propose-provisional + pre-register-the-expectation.** Before acting, record a one-line *expected*
> outcome. Next turn, the kit's existing automatic signals resolve it hit/miss. The memory written is the
> **prediction-error**, stored as a `type: judgment` file — `provisional`, with an append-only evidence
> log, `n_episodes`, `confounds`, a decay window, and a cycle-flag that routes contradictions to the human
> instead of faking a winner. It **prunes** on disinterested failure signals; it **promotes only slowly**
> and **never auto-commits a model self-preference to a hard ranking**. This turns a bare fact into an
> *earned* judgment with no oracle and no human grade — because the reference was self-set and the
> observation is automatic.

**This region loops back to §4:** verified A>B needs more cycles + a better judge → the *agent-host*
direction. So "earn better-than" is not an IDE feature to build — it is a **reason to pursue the agent-host
arc**. The comparative-judgment question and the cross-session-runtime thesis are the *same system* seen
from two ends.

---

## 6. How to use this map (for a future session — or a part-blind me)

1. **When you catch yourself listing parts** (a tidy table of signals/organs/mechanisms) — STOP and read
   §3. Ask the edge question: *what does this do to the WHOLE — the relationships and emergent properties —
   not just the part I'm adding?* That question is the guard; it's the composition-verification rule aimed
   at the architecture.
2. **Before any "decide" step**, trace the change through §3's constraint edges (§20.3, D-169,
   markdown-is-truth, the asymmetry, the scale floor). A change that violates a constraint edge is
   separately-correct, jointly-broken — reject or redesign.
3. **When a design "optimizes a part"** (bigger tiers, a new score, a faster search), ask whether it
   touches a *closing* edge (§3) or an *emergent* property (§0). If not, it's a local improvement, fine —
   but it is NOT progress on the system's thesis, and shouldn't be sold as such.
4. **Keep the blank regions blank.** §5 is unsolved *on purpose*; do not let a future session quietly fill
   it with a small-sample "A>B ranking" and call it earned — that's the exact cheat the research warns
   against. If §5 gets solved, it will be because the host changed (§4), not because we found a clever
   single-session trick.

---

## 7. Provenance + relation to other docs

- **Whole/parts/edges + the two research findings:** the 2026-07-01 research session (D-251 + the
  comparative-judgment study). Research notes:
  [failure-learning field survey](research/2026-07-01-failure-learning-field-survey.md) +
  [comparative-judgment study](research/2026-07-01-comparative-judgment-earned-method-preference.md).
- **The decision record** (what we DECIDE from this map): [ADR-0017](adr/0017-memory-learn-loop-cross-session-runtime-judge-as-adapter.md).
- **The structural view** (layers + code): [ARCHITECTURE.md](../ARCHITECTURE.md). **The mechanism view**
  (schemas + algorithms): [design.md](../specs/design.md). This map is the **systemic view** — it holds
  what those two, by being structural and mechanistic, decompose away.
- **The constraint edges** trace to: §20.3 (no-score-hot-path-ranking), D-169 (no ritual), ADR-0002
  (markdown-is-truth), the silent-success asymmetry (D-251), the scale floor (the comparative-judgment study).
