# ZenBrain's "7-Layer Memory Architecture" — dev.to article vs. the actual open-source code

**Date:** 2026-07-21
**Source:** `<local-wiki>/raw/7-Layer Memory Architecture How ZenBrain Remembers Like a Human Brain.md` (dev.to, published 2026-07-19, author byline "alexanderbering"; cross-posted from "ZenSation Research blog")

## What it claims

A marketing/technical-overview piece for **ZenBrain** (`@zensation/algorithms` + `@zensation/core`, Apache-2.0, TypeScript, `github.com/zensation-ai/zenbrain`). Central claims:

- **7 memory layers**, each a distinct "cognitive function": (1) Working, (2) Short-Term, (3) Episodic, (4) Semantic, (5) Procedural, (6) **Prospective** (future planning / reminders / deadlines), (7) **Long-Term** (Ebbinghaus decay, strengthens on retrieval).
- **Sleep consolidation**: "during idle periods," ZenBrain (1) selects high-importance unconsolidated memories, (2) replays/re-evaluates them, (3) strengthens related-memory connections via Hebbian learning, (4) prunes weak connections — citing Stickgold & Walker (2013).
- **FSRS** (Anki's spaced-repetition algorithm) computes a 0–1 retrievability score per memory; below-threshold memories get "flagged for review."
- **Hebbian knowledge graphs**: co-activation strengthens edges, disuse decays them, weights are normalized to prevent runaway activation — builds topic clusters the user never defined.
- "Under the hood": 276 tests, 9 foundational algorithms, zero dependencies, 95% confidence intervals on probabilistic outputs. Installable via `npm install @zensation/algorithms @zensation/core`.

## What the evidence actually shows

Verified by cloning-via-`gh api` (GitHub code search + raw file reads) against `zensation-ai/zenbrain` on 2026-07-21 — a real, public, active repo (Apache-2.0, TS monorepo, 14 stars/4 forks, last push 2026-07-19) — plus one `WebFetch` of the cited arXiv abstract page.

**1. The repo is real and the core algorithm math matches the article.** Read `packages/algorithms/src/fsrs.ts`, `hebbian.ts`, and `sleep-consolidation.ts` directly:
- FSRS: `R = e^(-t/S)` retrievability, stability update `S_new = S·(1 + a·(11−D)·S^−b·(e^(c(1−R))−1))` with `a=0.2, b=0.2, c=0.3` ("tuned from open-spaced-repetition/fsrs4anki"), difficulty update `D_new = clamp(D − 0.15·(grade−3), 1, 10)`. Matches the article's description closely.
- Hebbian: `computeHebbianStrengthening` = asymptotic growth `new = old + 0.1·(1 − old/10.0)`; `computeHebbianDecay` = `new = old·0.98`, returns `0` (pruning signal) below a `0.1` floor; `computeHomeostaticNormalization` scales all weights so they sum to a target (default 50.0). All three concepts the article names are real, tested pure functions.
- Sleep consolidation: `selectForReplay` → `simulateReplay` → (edges below threshold reported as `pruned`) is a real, well-built 3-function pipeline matching the article's 4-step narrative almost exactly (detail in Mechanism section below).

**2. Layer 6 and 7 are NOT what the article says — verified false.** The article's Layer 6 ("Prospective Memory" — reminders/deadlines/future intentions) and Layer 7 ("Long-Term Memory," decay-and-strengthen) do not exist anywhere in the codebase. A GitHub code search across the whole repo for `"prospective"` returns **zero** hits; `"reminder"` also zero. The actual `packages/core/src/layers/` directory (7 files, each headed with its own `Layer N` doc-comment) is: 1 Working, 2 Short-Term, 3 Episodic, 4 **Semantic Long-Term Memory** (the article's 4 and 7 are merged into one layer here), 5 Procedural, 6 **Core Memory** ("Pinned, user-editable memory blocks (Letta/MemGPT pattern). Always loaded into context. Never decays."), 7 **Cross-Context Memory** ("Detects and merges entities across different memory contexts... unique to ZenBrain"). This exact 7-item list — Working / Short-Term / Episodic / Semantic / Procedural / **Core** / **Cross-Context** — is independently confirmed in the project's own `README.md`, `docs/FAQ.md` ("Why 7 memory layers?"), and every `CHANGELOG.md` entry that names the layer set. There is no ambiguity or version-drift explanation available: the FAQ, README and CHANGELOG all agree with each other and all disagree with the dev.to article.

**3. The "automatic during idle periods" framing overstates what ships.** `selectForReplay`, `simulateReplay`, and `pruneWeakConnections` are exported and tested, but a GitHub code search shows they are called **only** from their own module, their own test file, and docs/README — **never** from `packages/core/src/coordinator.ts` (`MemoryCoordinator`, the library's actual orchestration entry point). Read `coordinator.ts`'s real `consolidate()` method: it scans up to 100 recent episodes, promotes ones with `emotionalWeight > 0.5` to semantic facts (optionally distilled by an injected LLM), and decays working memory — it does not call replay, Hebbian strengthening, or edge pruning at all. A repo-wide search for `setInterval`, `node-cron`, or any idle-detector returns zero hits. `computeHebbianStrengthening`/`computeHebbianDecay` are invoked only in a demo script (`apps/playground/src/index.ts`) and an example (`examples/with-crewai.ts`) — a manual CLI walkthrough, not a background loop. Conclusion: sleep consolidation is a **callable pure-function library** the consuming application must invoke and schedule itself; nothing in the OSS package runs it automatically "during idle periods."

**4. "9 foundational algorithms" / "276 tests" is a stale/incorrect count relative to the project's own docs — and the gap predates the article.** The current `README.md` states 528 tests (429 algorithms + 99 core) and explicitly disambiguates the "9" figure: *"ZenBrain's architecture is 15 neuroscience-inspired mechanisms — 9 foundational algorithms + 6 Predictive Memory Architecture (PMA) components ([paper](https://arxiv.org/abs/2604.23878)). The 6 PMA components are proprietary and run in the production system. This open-source package ships the algorithm library: 10 core algorithms + 10 advanced research modules (20 modules), zero-dependency."* So "9 foundational algorithms" is not a count of what ships in `@zensation/algorithms` at all — it's the foundational-algorithm slice of a 15-mechanism architecture, 6 of whose components (**40%**) are closed-source. The dev.to article presents "9 foundational algorithms in `@zensation/algorithms`" as if it described the installable package, without disclosing the proprietary split. Per `CHANGELOG.md`, the 20-module/10-core framing was set in **v0.3.4 (2026-06-27)** and the 528-test count's SQLite-adapter prerequisite fixes landed in **v0.3.5 (2026-07-17)** — both **before** the article's 2026-07-19 publish date, so this was already the documented state of the linked repo when the article went live, not a later drift.

**5. The arXiv paper is real** (fetched via `WebFetch`, AI-summarized — not directly read): "ZenBrain: A Neuroscience-Inspired 7-Layer Memory Architecture for Autonomous AI Systems," author Alexander Bering (matches the dev.to byline), claims benchmarking against Letta/Mem0/A-Mem and "15 validated neuroscience mechanisms unified under a single MemoryCoordinator." I could not verify the benchmark numbers or methodology — recorded as unverified, not false.

**6. Production-readiness tension.** `docs/FAQ.md` claims the algorithms/core layers are "extracted from ZenAI, a production AI platform, and run against real users and real data" (unverifiable — no independent way to confirm "ZenAI" exists or serves real users). Two days before the article's publish date, `CHANGELOG.md` v0.3.5 (2026-07-17) documents **five independent, previously-unnoticed defects** in the SQLite adapter that broke `MemoryCoordinator` end-to-end — `store()` threw on every semantic-fact write, `recall()` silently returned empty results (swallowed per-layer errors made an empty store indistinguishable from a broken query), and three separate parameter-binding bugs — with the changelog's own admission: *"Nothing in CI exercised the real core↔adapter integration, so five independent defects went unnoticed."* This doesn't contradict a specific article claim, but it's in tension with the "production-ready, real users" framing at the moment the article was published.

## Mechanism detail (the HOW)

**`selectForReplay(memories, config)`** — priority scoring, pure function, no LLM:
```
recency        = exp(-daysSinceLastAccess * 0.1)
normalizedAccess = accessCount / max(accessCount across set, 1)
instability     = 1 - min(1, stability / 365)          // MAX_STABILITY = 365 days
priority = normalizedAccess * 0.3
         + emotionalWeight * emotionalBiasWeight        // default 0.3
         + recency * 0.2
         + instability * (0.5 - emotionalBiasWeight)
```
Sorted descending, top `maxReplaysPerCycle` (default **20**) selected.

**`simulateReplay(selected, config)`** — for each selected memory:
```
newStability = stability * REPLAY_STRENGTH_MULTIPLIER          // 1.5
if emotionalWeight > 0.5: newStability *= EMOTIONAL_BONUS       // 1.2
newStability = min(newStability, MAX_STABILITY)                 // 365
for each hebbianEdge on this memory:
  if edge.weight >= WEAK_CONNECTION_THRESHOLD (0.2):
      newWeight = min(weight * EDGE_STRENGTHEN_FACTOR (1.1), MAX_EDGE_WEIGHT (10.0))  → "strengthened"
  else:
      → reported in "pruned" list (the function does not itself mutate storage — it returns a report; persistence is left to the caller)
```
Returns `{ replayed[], strengthened[], pruned[], summary }`. `pruneWeakConnections(edges, threshold)` is a separate standalone helper doing the same weight-vs-threshold split over an arbitrary edge list.

**Hebbian primitives** (`hebbian.ts`), all pure, all "database operations are left to the consuming application" by explicit module-doc convention:
```
strengthen(w) = w + 0.1 * (1 - w/10.0)         // asymptotic, capped at 10.0 (LEARNING_RATE=0.1, MAX_WEIGHT=10.0)
decay(w)      = w * (1 - 0.02)                  // DECAY_RATE=0.02; returns 0 (prune signal) if result < 0.1 (MIN_WEIGHT)
normalize(weights, targetSum=50.0) = weights scaled proportionally so Σ = targetSum
```

**What actually runs inside `MemoryCoordinator.consolidate()`** (the library's real orchestration path, `packages/core/src/coordinator.ts`):
```
episodes = episodic.getRecent(100)
for each episode:
  if episode.emotionalWeight > 0.5:
    summary = llm ? llm.generate("extract the key factual insight...", episode.content) : episode.content
    semantic.storeFact(summary, source='consolidation', confidence=0.7)
    promoted++
working.decay()   // Ebbinghaus-style relevance decay + eviction of working-memory slots only
```
No call to `selectForReplay`/`simulateReplay`/`pruneWeakConnections`/any Hebbian function from this path. No screening, no id-validation, no audit log, no review-queue visible in the code read.

## Relevance to core-memory-kit

**Task 95 dream re-curation (design.md §21) — weak-to-moderate, mostly by contrast.**
- Shape overlap: both are offline/batch passes over accumulated memory that produce merge/promote/prune-style ops rather than treating memory as append-only. ZenBrain's `selectForReplay` priority formula (weighted sum of access-frequency, emotional/importance weight, recency, and instability) is a clean, legible **candidate scoring function** — a genuine borrow candidate if the kit's future re-curation pass ever needs to rank MORE due candidates than a single run's batched-LLM-call budget can cover (design §21.2 step 2 already does per-item top-K=5 similarity recall; a formula like this could decide the ACROSS-candidate run order under `21.5`'s per-run op caps).
- Sharp contrast on safety/provenance: design §21.3 requires input AND output to route through `screenBeforeCommittedWrite`, per-claim source-trust tags, ids validated against the corpus with hallucinated ids rejected, and which-wins decided by event-time (never the LLM). ZenBrain's `coordinator.consolidate()` has none of this visible — the LLM's distilled summary is written straight to the semantic store with no screening, no id-validation, no audit trail I could find. This is a **reject-as-precedent, confirm-as-anti-pattern**: it's a concrete counter-example for why §21.3's stricter contract matters, not something to imitate.
- Design §21.2's AUTO-class/QUEUE-class op split (deterministic-reversible ops auto-apply; lossy/generative ops land in `context/queues/recuration.md` for human adopt-or-discard) has no ZenBrain analogue — its consolidation is a single flat, unreviewed pass.
- One structural point of *agreement*, independently reached: ZenBrain's "pruning" only ever removes Hebbian **edges**, never the memory/fact itself (`simulateReplay`/`pruneWeakConnections` operate purely on the edge list) — consistent with design §21.6's "no DELETE op exists." Reading the actual code (not just the marketing framing) makes this a verified data point, not mere third-party convergence.
- The claimed "automatic during idle periods" trigger (per finding #3 above) doesn't actually exist in ZenBrain's shipped code — so there's nothing to borrow on the scheduling side; design §21.4's own approach (compose with the kit's existing idle/cron + lazy machinery, ADR-0020 resumability) is already more concretely specified than what ZenBrain ships.

**Task 232 / ADR-0023 graph edges — weak, and a useful negative example.** ZenBrain's Hebbian graph is a live, continuously-mutating, storage-resident structure whose edge weights are a function of access history over time — it is **not reconstructable from source text alone**. ADR-0023 explicitly adopts only the *activation* of edges the kit already writes deterministically from markdown (`related:` frontmatter, `superseded_by`) and defers *derivation*, precisely because a derived/stateful graph becomes a second source of truth that can drift from the markdown (the ADR's own cautionary counter-example, pulse8's "edges-only-in-graph.json"). ZenBrain's Hebbian graph is exactly that shape — a reject candidate for the kit's graph-edge mechanism, though the underlying co-activation SIGNAL (which facts get accessed together) could be food for thought if the kit ever revisits the DEFERRED derivation half of ADR-0023.

**Tasks 161/203 (compaction timing/starvation) — none found.** The article and the code I read say nothing about compression latency, timeouts, chunking, or resumable/incremental processing. `coordinator.consolidate()` processes up to 100 episodes synchronously in one pass with no persist-as-you-go or resume logic — no relevant mechanism to borrow or contrast here.

## Borrow candidates

- The `selectForReplay` weighted-sum priority formula (access-frequency + importance + recency + instability) as a candidate scheduling heuristic if Task 95 ever needs to rank re-curation candidates across a run-budget ceiling.
- The "pure computation, storage left to the caller" module-boundary convention used consistently across `@zensation/algorithms` — a clean precedent for keeping any future kit scoring/priority module (e.g., a trust-decay formula) testable without mocking storage.
- Homeostatic normalization (scale-to-target-sum) as a speculative safety idea if the kit ever combines multiple weighted ranking signals and wants to bound any one signal's dominance — low priority, not concretely needed today.

## Reject candidates

- **Automatic idle-triggered background consolidation** as a claimed ZenBrain capability — verified absent from the shipped orchestration path; nothing to borrow, and design §21.4 already specifies the kit's own (more concrete) idle/cron composition.
- **Live co-activation-derived Hebbian graph** as an edge-derivation mechanism for Task 232 — conflicts with ADR-0023's markdown-rebuildable invariant; the graph's state isn't reconstructable from source text.
- **FSRS forced-review scheduling** (`nextReview` dates + 1–5 grades, "flagged for review") — doesn't fit the kit's passive, search-driven recall model; there is no user-facing "review this fact" flow in the kit's design, and building one wasn't asked for.
- **The article's specific numeric/naming claims** ("9 foundational algorithms," "276 tests," Layer 6 = Prospective, Layer 7 = Long-Term) — verified incorrect or stale against the linked repo's own current README/FAQ/CHANGELOG; should not be cited as fact about ZenBrain in any future kit documentation.

## Honest gaps

- **Images:** the article contains zero markdown image references (`![...]`) — confirmed by reading the full raw file; `<local-wiki>/raw/assets/` was also checked and is empty. Nothing to read, nothing missed (0/0).
- **Links followed (2 of the 5-hop budget used):** (1) the GitHub repo `zensation-ai/zenbrain`, explored via `gh api` (repo metadata, code search, and raw reads of `README.md`, `docs/FAQ.md`, `CHANGELOG.md`, `coordinator.ts`, `sleep-consolidation.ts`, `fsrs.ts`, `hebbian.ts`, `bayesian.ts`, and several `packages/core/src/layers/*.ts` headers); (2) the cited arXiv abstract page (`arxiv.org/abs/2604.23878`) via `WebFetch` — **summarized by WebFetch's small model, not directly read**, so paper-level claims (benchmark results vs. Letta/Mem0/A-Mem, "matches a long-context oracle's binary-judge accuracy") are recorded as "the summary reports X," one level less certain than a direct read of the PDF/HTML.
- **Not read/verified:** the `intervals.ts` confidence-interval module's actual formula (confirmed to exist via code search only — the specific "95%" figure and statistical method are unverified); `docs/api-reference.md`, `docs/getting-started.md`, `docs/ROADMAP.md` (grepped, not fully read); the `packages/adapters` (SQLite/Postgres) source itself, beyond what the CHANGELOG describes; the actual test files (test counts are self-reported by the project's own README/CHANGELOG, not independently run or counted by me); FAQ's "400+ keyword lexicon (English and German)" emotional-tagging claim (quoted, not verified); the "ZenAI production platform" claim (no independent way to confirm it exists or serves real users).
- **Author-identity match** ("alexanderbering" on dev.to vs. "Alexander Bering" as the arXiv paper author) is reported by WebFetch's summary, not independently cross-checked against the GitHub org's member list.
- **Charitable-explanation caveat:** the stale 9-algorithms/276-tests numbers predate the article's publish date per the repo's own CHANGELOG (§4 above), which is strong evidence the article was inaccurate at publish — but I cannot rule out the article was drafted earlier than 2026-07-19 and published without a numbers refresh, which would be an editorial-lag explanation rather than a deliberate embellishment. This note documents the discrepancy, not the author's intent.
