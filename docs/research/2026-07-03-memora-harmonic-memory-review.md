# Memora (Microsoft, ICML 2026) — harmonic memory: abstraction-indexed storage, cue anchors, policy retrieval

_Reviewed 2026-07-03. Sources — read in FULL (the Task-149 discipline: primary sources, not summaries): the [MSR blog post](https://www.microsoft.com/en-us/research/blog/memora-a-harmonic-memory-representation-balancing-abstraction-and-specificity/) (2026-06-30); the [paper](https://arxiv.org/abs/2602.03315) (arXiv 2602.03315v2 — all 30 pages incl. appendices A–F, via pdftotext); the [code](https://github.com/microsoft/Memora) (cloned to `C:/Projects/Memora`; read `builder/memory_builder.py`, `core/memory_entry.py`, `core/cue_index_generator.py`, `core/memory_expander.py`, `core/local_memory_store.py`)._

## WHO

Microsoft Research (M365 Research); ICML 2026. Benchmarks: **LoCoMo 0.863** LLM-judge (SOTA;
full-context = 0.825) and **LongMemEval 87.4%** (vs Nemori 74.6%, full-context 65.6%) using
~2–3k context tokens against 115k full-context — **up to 98% token reduction while BEATING full
context.** Store: 344 entries/conversation vs Mem0's 651 on the same data. Eval: gpt-4o-mini
judge, mem0's official prompts, seed 42.

## HOW — the one idea + three mechanisms (code-verified)

**Core insight: decouple _what is stored_ from _how it is retrieved_.** Only a lightweight
structural layer is embedded; the rich memory value is never indexed by its own text.

1. **Memory entry = primary abstraction + memory value.** The abstraction (6–8 words, "what
   this memory is fundamentally about") is the ONLY thing embedded; the value holds rich
   content. **Write-time consolidation** (paper §3.5 Eq. 2–5; code
   `memory_builder.py::_query_update_candidates` → `upsert_memory_entry`): embed the
   candidate's abstraction → top-k similar existing abstractions (cosine, `update_score_threshold`
   default **0.80**) → an LLM (Fig. 6 prompt) decides update-vs-add, picks WHICH candidate,
   **and generates the merged value** (one call does judge+merge, optionally refining the
   abstraction too). An evolving topic stays ONE entry — that's the 344-vs-651 compression.
2. **Cue anchors** (§3.6; `cue_index_generator.py`): **1–3 cues per memory, 2–4 words each**,
   shaped `[Main Entity] + [Key Aspect]` ("Mike birthday party", "Project Orion timeline");
   atomic, no timestamps/numbers, never repeating the primary abstraction. **The CODE's cue
   taxonomy is richer than the paper's appendix**: factual cues (entities/actions/objects) AND
   **relational cues** (causal or intentional relations). Cues are embedded, many-to-many,
   deduped on write, **auto-pruned when they lose all associations**. Shared cues form an
   **implicit memory graph** — no schema, no explicit edge construction.
3. **Policy-guided retrieval** (§4; `memory_expander.py` + `query_generator.py`): an MDP over
   `(query, working set, frontier, budget)` with REFINE / EXPAND / STOP. The frontier = memories
   linked to the working set but not yet retrieved; the code adds an optional **"relaxed
   frontier"** that expands through *similar* (not just shared) cues — top-k 4, threshold
   **0.85**, max 30 cues. Policy = prompted LLM, or GRPO-distilled Qwen-2.5-1.5B (0.841 vs
   0.829 base; Appendix C: trajectory-level judge = groundedness − redundancy − cost,
   group-relative advantage).

**Load-bearing ablations:**

- Abstraction layer ALONE lifts the Mem0-equivalent baseline **0.653 → 0.795** — the largest
  single component jump. + update → 0.801; + cues + policy → 0.849/0.863.
- **The policy retriever's advantage disappears without cue anchors** — the win is the traversal
  structure, not the policy net.
- **Appendix F (consolidation sensitivity)**: threshold **0.80 optimal**; 0.6 → 3.4× more merges
  with NO quality gain (over-consolidation is real — a similarity-only merge is wrong, the LLM
  gate matters); NO-update hurts **multi-hop** specifically (0.727 vs 0.780). Update ratio stays
  in a flat **16.5–22.2% band** as the store grows — consolidation scales linearly, frequent
  consolidation is safe.
- Raw-segment episodic grounding beats extracted-summary grounding (0.863 vs 0.838); at
  retrieval, facts are **grouped by shared episode** to restore narrative coherence.
- Robust to weak builders: gpt-5.4-nano-built memories + policy retrieval = 0.851 (vs 0.863) —
  the representation, not the builder, carries the value.
- Latency honesty: policy retrieval averages 3.4 steps ≈ 4.6s vs 0.23s semantic.
- Construction trick: predicting **source offsets** instead of generating values = 45% build
  speedup at −0.003 quality.

**The theory (Appendix D), in one line each:** flat RAG = Memora with abstraction≡content and
no cues (Thm D.1); KG retrieval = Memora with cues≡entities/edges (Thm D.2/D.3); and the
**mixed-key strictness theorem (D.5)** — jointly enforcing "abstraction scope ∩ cue selection"
(e.g. *everything under topic T, the timeline aspect*) is PROVABLY inexpressible for flat top-k
(fixed k prefix) and for fixed-single-attachment KG traversal. D.6: abstraction-first scoping is
a principled search-space factorization (index N/B abstractions instead of N memories).

## FIT — against the kit (validation first, gaps second)

### What Memora independently validates about the kit's design

| Memora result | The kit's existing position |
| --- | --- |
| Beats FULL CONTEXT with curated memory (0.863 > 0.825, 98% fewer tokens) | The kit's thesis: bounded snapshot (≤13KB) + recall ladder > dumping history. ICML-citable now. |
| Raw-segment episodic grounding beats extracted summaries | D-44 ("classify over raw") + the L3 raw-transcript floor (Task 104) |
| Policy retrieval (REFINE/EXPAND/STOP) > one-shot top-k, esp. multi-hop | The `memory-search` skill ladder IS a prompted policy retriever (query variants → timeline expand → fetch → stop) — shipped without the name |
| Write-time "same concept?" LLM gate over similarity candidates (Fig. 6) | The temporal-sweep judge (66.4 / D-259) — same decision shape, different site + candidate source |
| Similarity-only merging over-consolidates (Appendix F, 0.6 row) | The kit's judge-gated posture: similarity finds CANDIDATES, an LLM (or the user) decides — never auto-merge on distance |
| MemLoop (learn from retrieval/task failures) — their future work | The v0.5 learn-loop (ADR-0017, SYSTEM-MAP §6, Tasks 190–194) |
| Deferred Memory (postpone construction until evidence) — future work | The kit's defer-until-evidence posture (D-248 triggers) |
| Group Memory (team sharing w/ provenance + access) — future work | The kit's team layer (v0.5+; committed-tier provenance ships today) |

The convergence pattern (the external-research-mirrors-backlog lesson): third instance
(AgentCore, the learn-loop surveys, now Memora's future-work section = our roadmap).

**A calibration from the case studies (App. E):** Mem0's failure mode is atomic fragments that
lose entity binding ("kids enjoyed clay" but not "the dog-face cup"). The kit's RICH facts
(title + Why/How bodies) are already closer to Memora's consolidated values than to Mem0's
fragments — we are NOT the fragmentation extreme their ablation punishes. (The terse `MEMORY.md`
bullets ARE Mem0-shaped, but that tier is the bounded hot index by design, not the archive.)
Expect SMALLER gains than their ablation suggests when porting their ideas; measure.

### What Memora has that the kit does not

1. **Abstraction-only indexing.** The kit embeds fact CONTENT (hybrid BM25+vector, Task 65);
   Memora embeds only the abstraction. Untested for OUR shape (see calibration above; W2
   paraphrase recall = 1.000 embedding content). **Measure, don't believe** (D-109).
   → folded into **Task 178** (bench on the Task-99 harness).
2. **Cue anchors + the implicit graph.** Nothing equivalent ships: `[[links]]` are manual,
   `mk_timeline` is temporal adjacency. Cues are the ontology-free multi-hop affordance the
   graph-recall research circles — markdown-native-compatible (a `cues:` frontmatter list,
   embedded beside the title), LLM-derived at capture (1–3 × 2–4 words, factual + relational),
   auto-pruned, with the mixed-key theorem as the formal case and the relaxed-frontier
   parameters (0.85 / top-4) as the traversal reference. → folded into **Task 176** read-list.
3. **Consolidation cadence.** Memora consolidates AT WRITE; the kit judged weekly (66.4).
   The kit's semantics differ deliberately (separate facts + recurrence + validity-window close,
   audit-preserved — vs their trail-lossy in-entry merge), but their CADENCE and their
   CANDIDATE-FINDING (abstraction-embedding similarity ≥0.80 — sidestepping the FTS5
   version-token shredding D-259 worked around) are both better than ours.
   → **Task 198** (per-session cadence + embedding candidates), **Task 199** (write-time
   detection + in-conversation resolution).

### Deliberately NOT adopted (with reasons)

- **In-entry merge (their Update op).** Merging new content into an existing entry's value
  discards the moment of change; the kit keeps separate facts + closes validity windows +
  audits (D-163 hide-never-delete; the decision-trail posture). Their knowledge-update score
  (97.4%) shows merge WORKS for QA benchmarks; it fails OUR history requirement.
- **"Create more rather than fewer" extraction.** Their prompt maximizes benchmark recall; the
  kit's auto-extract is deliberately selective (a bounded, committed, human-readable store —
  and the B9b trend gate watches the other failure direction). Different objective, not a gap.
- **Offset optimization.** The kit already records `source_file`/`source_line`; construction
  cost is not a pain point (subscription billing). Noted, no task.
- **GRPO-distilled retrieval policy.** The kit's policy is Claude driving the skill; a trained
  small model buys latency, not quality, and adds a model artifact the zero-infra posture
  avoids. Revisit only if recall latency becomes a real complaint.

## The cadence re-decision (revisits D-259's weekly site — with new evidence)

D-259 settled the temporal-judge DESIGN (own-search candidates → one batched judge →
event-time close). The **weekly** cadence was inherited from the convenient host site
(weekly-curate), not derived from a freshness requirement — and the acceptance case (D-166:
the snapshot showed a stale state) is precisely about the misleading window. New evidence:

1. **Memora consolidates at write** — and Appendix F shows the judged-merge rate stays flat
   (16.5–22.2%) as the store grows: frequent judged consolidation is linear-cost and safe.
2. **The shipped sweep's own properties make cadence ~free** (facts that did not exist when
   D-259 was written): marker-incremental + `no-new-facts` short-circuits BEFORE any LLM call.
3. **Live evidence from the v0.4.4 cut-gate:** the Vercel→Hetzner State pair sat both-live;
   Session-2 recall surfaced BOTH and the model disambiguated by judgment — the engine had not
   resolved a days-old contradiction.

Decision (D-266): extend the sweep to every existing Haiku maintenance site (SessionEnd +
SessionStart-lazy; weekly stays the backstop) — Task 198; file write-time DETECTION with
in-conversation propose-and-approve resolution as the durable design — Task 199. Both keep
D-259's judge/close semantics untouched.

## Task map (every actionable filed — own task or folded into a known one)

| Idea | Disposition |
| --- | --- |
| Per-session temporal-sweep cadence | **NEW Task 198** (v0.4.5 rider) |
| Embedding-similarity sweep candidates (θ=0.80 ref) | **Task 198.2** (same file, same lane) |
| Write-time detection + in-conversation supersede | **NEW Task 199** (design-first; named trigger) |
| Cue anchors / implicit graph / mixed-key theory / relaxed-frontier params | folded into **Task 176** read-list |
| Policy-retriever architecture (validates judgment-pulled; episodic grouping at retrieval) | folded into **Task 149** read-list |
| Title(abstraction)-vs-content embedding bake-off | folded into **Task 178** bench matrix |
| Fig-6 update-or-add prompt (judge+merge template) | folded into **Task 95** references |
| MemLoop = learn-loop external validation | cross-ref on **Task 190** |
| "Beats full context, 98% fewer tokens" | pitch-line ammunition (D-224 candidates) |

## Pointers

- Paper: <https://arxiv.org/abs/2602.03315> (v2; read in full via pdftotext from the maintainer's local capture)
- Blog: <https://www.microsoft.com/en-us/research/blog/memora-a-harmonic-memory-representation-balancing-abstraction-and-specificity/>
- Code: <https://github.com/microsoft/Memora> (local clone: `C:/Projects/Memora`) — verified modules:
  `builder/memory_builder.py` (`_query_update_candidates`, `upsert_memory_entry`,
  `update_score_threshold`, the Fig-6 prompt inline), `core/cue_index_generator.py` (factual +
  relational cue taxonomy), `core/memory_expander.py` (frontier + relaxed-frontier 0.85/top-4),
  `core/memory_entry.py` (value/index/original_text shape), `core/local_memory_store.py`
  (ChromaDB upsert/query + keyword fallback scaled under `query_score_threshold` 0.4)
