---
date: 2026-07-10
topic: Five-source memory-research sweep — A-TMA, AutoMem, Always-On-Agents survey, stash, 6G-latent-memory
source: Deep-read of 4 papers (full PDFs incl. appendices) + 1 article + 1 repo, one subagent per source, mapped against the kit's open backlog
tags: [research, recall, governance, learn-loop, temporal, competitive]
---

# Memory-research sweep 2026-07-10 — five sources, mapped to the backlog

_The user's ask: study everything, steal what helps, sharpen existing tasks. Every source read IN FULL
(PDFs in page chunks incl. appendices; the repo via README + source files + API tree). MEMORA
(arXiv 2602.03315) was ALSO in the batch — it was already fully disposed by the
[2026-07-03 review](2026-07-03-memora-harmonic-memory-review.md) (Tasks 198/199 + folds into
176/178/95/149); this sweep re-read confirmed that review's verdicts and adds nothing beyond one
calibration note (§MEMORA below). The full-research-base rule earned its keep: without checking,
this sweep would have re-filed cue anchors as a "new" idea._

## Verdict table (the whole sweep in one view)

| Source | What it is | Top steals | Filed as |
| --- | --- | --- | --- |
| **A-TMA** (arXiv 2607.01935, NUS) | "Ghost memory": state-aware retrieval overlay — bank/retrieval/QA failure decoupling | State labels at serialization; rule-based query state-view gate | **Task 209**, **Task 211** |
| **Always-On Agents survey** (arXiv 2606.30306, 109pp, 435 works coded) | Persistent-state lifecycle + governance skew (rollback 27/435) | Deletion-propagation guarantee; provenance-through-consolidation; source-trust tiers | **Task 210**, **Task 213**, fold into **Task 70** |
| **AutoMem** (arXiv 2607.01224, Stanford) | Memory management as a LEARNED skill; meta-LLM optimizes the scaffold | Behavioral health metrics (writes-per-search etc.); meta-LLM scaffold self-audit | **Task 212**, fold into **Task 95** |
| **MEMORA** (arXiv 2602.03315, MSR, ICML 2026) | Abstraction + cue anchors + policy retrieval | _(already disposed 2026-07-03)_ | Tasks 198/199 + 176/178/95 folds — no new filings |
| **stash** (Fergana-Labs, SaaS, 213★) | Hosted team knowledge base + nightly LLM curator | Mostly validation + positioning; curator prompt patterns | folds into **Task 95/199** refs; positioning notes below |
| **6G latent memory** (Banerjee article + arXiv 2605.00593) | β-VAE-compressed hidden-state handover, `inputs_embeds` injection | **Nothing actionable** — needs white-box weights + training | no filing (recorded here so it isn't re-read) |

## A-TMA — arXiv 2607.01935 (Shi/Tang/Tung, NUS, 2026-07-02)

**Thesis:** "ghost memory" — old/current/transition facts coexisting unlabeled — is a COORDINATION
failure decomposable into three levels: **bank** (is the old fact marked superseded?), **retrieval**
(did search surface the state the query asked for?), **QA** (did the answer model resolve state from
labeled evidence?). A drop-in overlay on host systems (Mem0/A-Mem/Graphiti/Zep/SeCom/InsideOut):
records `r=(content, time, status, typed-links, meta)`; a cheap Sentry gate → heavier Judge on
suspicious pairs; a RULE-BASED query state-view profiler (current/historical/transition/neutral —
wordlist + negation guards, explicitly NOT an LLM); typed-link hop expansion conditioned on the
view; and a **deterministic label projection** at answer time (`current memory` / `historical
memory` / `transition memory` prefixes + prompt instructions). Headline: Graphiti/Zep conflict-acc
0.480→0.720; InsideOut 0.117→0.662. Their Case Study 1: **identical retrieved evidence flips from
wrong to correct with state labels alone.**

**Against the kit:** the bank level is largely SHIPPED (Task 66.1/66.2/198: shape field, validity
windows, `superseded_by`, archive/superseded — our non-destructive supersession predates theirs and
keeps a better trail). What we DON'T do: (a) **tell Claude the state at recall time** — search
results and the snapshot serialize facts as undifferentiated bullets even though `status`/windows
are in frontmatter → **Task 209**; (b) **classify the query's requested state view** — the §16.18
7-mode classifier was deferred as too heavy, but A-TMA's 4-view rule-based profiler is
Poison_Guard-tier cheap → **Task 211** (new evidence for the deferral, design §16.18 note); (c)
their bounded-LLM-controller discipline (reorder-only from a fixed pool, silent deterministic
fallback on parse failure) independently validates the kit's Door-3.5 posture — no filing, cited in
209/211. The Sentry (trained dual-head embedding classifier) does NOT transfer (training infra);
the kit's temporal sweep already has the cheap-gate→judge shape. The bank/retrieval/QA taxonomy is
a ready diagnostic checklist for recall failures — folded into Task 209's done-criteria and worth a
HEALTH-CHECKS mention when 209 builds.

## Always-On Agents survey — arXiv 2606.30306 (Ding/Nannapaneni/Liu/Zhang, 2026-06-29)

**Thesis:** always-on agents are persistent-STATE systems, not memory-augmented chatbots. 435 works
coded along a 10-stage lifecycle (observe→…→act→update→forget→audit→rollback) + six axes
(authority/scope/mutability/provenance/recoverability/actionability). **The field's skew:** retrieve
269/435, write 200/435 — vs rollback **27/435**, forget 66/435, audit 88/435. Five invariants
(authority monotonicity, scope non-expansion, **deletion propagation**, provenance preservation,
rollback traceability). Their AOEP pilot scores governance deterministically, split into
**obligation pass** (positive duties) vs **negative-invariant pass** (checks a no-memory system
trivially satisfies) — and finds **extracted-fact stores (Mem0-style, real mem0ai) score WORSE than
raw storage** because extraction flattens the governance envelope.

**Against the kit — the richest source of the sweep, because it lands where the kit is already
strong but unfinished:**

1. **Deletion propagation** — the field's worst gap and the kit's cheapest differentiator. `forget`
   tombstones the fact, but NOTHING verifies the retraction cascaded (FTS5 index, `recent.md`,
   `archive.md`, derived summaries). Also closes lifecycle-map G2's cousin (consolidate's
   hard-drop). → **Task 210** (doctor HC + tests, AOEP-style two-sided scoring).
2. **Provenance-preserving consolidation** — "lossy summarization is where provenance dies": the
   daily→recent→archive distill keeps prose only; retain a minimal source-session pointer per
   condensed claim. Softens lifecycle-map G8. → **Task 213** (rides 203/204's distill surface).
3. **Source-trust tiers at ingestion (evidence-before-belief, §8.2.1)** — Poison_Guard screens
   PATTERNS; nothing distinguishes "the user said this" from "tool output / pasted web content said
   this" before auto-extract promotes it to committed cross-session authority. This is Task 70's
   missing concrete design. → folded into **Task 70** (new sub-item 70.5).
4. **The obligation/negative-invariant test split** — prevents governance checks passing vacuously
   on an empty memory dir. Adopted as 210's testing discipline (a candidate validator if the
   pattern recurs).
5. **Validation, no filing:** the extracted-fact-scores-worse pilot finding is independent,
   citable evidence for ADR-0002 (markdown-is-truth + visible frontmatter envelope) — positioning
   ammunition vs Mem0-class competitors. Figure 3 (governance coverage 12%→46% of published work
   2023→2026, still minority) says governance is where the field's attention is heading; the kit's
   audit/tombstone/journal investment is ahead of the curve.

**Does not transfer:** parametric/weight memory, credential-delegation infrastructure, multimodal
and embodied substrates, rollback-as-attack-surface (the kit takes no external actions).

## AutoMem — arXiv 2607.01224 (Wu/Zhu/Zhang/Wang/Yeung-Levy, Stanford, 2026-07-01)

**Thesis:** memory management is a learnable SKILL (metamemory): file ops are first-class actions
(LOG/PLAN routines); a meta-LLM reads COMPLETE episode traces and rewrites the agent's memory
scaffold (gated: keep only if progression strictly improves on fixed seeds); a second loop trains a
LoRA "memory specialist." Memory-only scaffold optimization = **2–4× progression** on
Crafter/MiniHack/NetHack; training adds 9–18% relative. The optimized 32B beats a 72B — memory
management outweighs 2× model scale. Concrete discovered mutations: coordinate-keyed UPSERT
replacing an append-only map (95% growth reduction); consult-before-write (writes-per-search fell
54–72%). Behavioral dashboard: unproductive-action rate, redundant-write rate, empty-search rate,
tokens/step.

**Against the kit:** the training loops don't transfer (no weights) and its memory is
episodic-only (resets per episode — the kit's whole domain is its stated limitation). Two things do:

1. **The behavioral health metrics** — writes-per-search ratio, empty-search rate, redundant-write
   rate (facts later merged/queued), snapshot cost. The kit's recall-log (Task 190) + audit log +
   extract.log already hold ALL the raw data; this is aggregation + a doctor/stats surface, and it
   gives Task 194's tuning observable numbers. → **Task 212** (cross-ref Task 189 — this is the
   process-health sibling of 189's ROI metric; 212 needs no embeddings and can ship first).
2. **The meta-LLM scaffold self-audit** — point a strong model at a window of audit log +
   `context/memory/` tree + recall.log and ask for SYSTEMIC diagnoses (an unbounded append-log
   forming, over-eager extraction, recurring empty searches), the way their outer-loop-1 reviews
   full traces. This is Task 95's re-curation extended from fact-level to schema/process-level.
   → folded into **Task 95** (design reference).
3. The structure-vs-proficiency axis split (scaffold quality vs skill-prompt quality, gains STACK)
   is a roadmap lens: the `memory-search`/`memory-write` skill prompts are the kit's "proficiency"
   surface with measurable headroom independent of schema work. Noted, no task.

## MEMORA — calibration note only (full review: [2026-07-03](2026-07-03-memora-harmonic-memory-review.md))

This sweep's independent re-read reached the same verdicts as the 2026-07-03 review (cue anchors →
Task 176; abstraction-vs-content embedding → Task 178; Fig-6 judge+merge → Task 95; write-time
cadence → Tasks 198/199; GRPO policy rejected). One addition worth recording: **their own Figure 2
shows GRPO-training the retriever moves overall score 0.829→0.841 (+1.2pt) and LOSES on multi-hop
(0.698→0.686), while their ablation's structural pieces carry 0.653→0.849** — structure beats
training in their own numbers, the strongest single datapoint for the kit's no-training posture.

## stash — github.com/Fergana-Labs/stash (Fergana Labs, MIT, 213★, active, hosted SaaS $20/mo)

**What it is:** account-scoped team knowledge base for the coding-agent era: per-agent hook plugins
(Claude/Cursor/Codex/OpenCode/Gemini/Openclaw) stream RAW transcripts verbatim to a multi-tenant
Postgres (+pgvector) server; retrieval via CLI + ~40 MCP tools + a POSIX-like virtual-filesystem
shell; a metered nightly **LLM curator** (headless Claude on a cloud VM) compiles raw activity into
a linked wiki (Karpathy's "LLM knowledge base" pattern, quoted in their README).

**Curator patterns worth keeping as references (fold into Task 95/199, no new tasks):**
bootstrap-vs-maintain modes; entity-vs-concept pages (entities linked, never duplicated); a
"≥2 distinct mentions before a page" promotion threshold (the kit's Task 151 recurrence-scored
promotion already generalizes this — validation, not a gap); `(extracted)/(inferred)/(ambiguous)`
confidence tags; **contradiction = append a dated `## Updates` block (old claim / new claim / which
supersedes / why), never silent overwrite** (a lighter sibling of Task 199's propose-and-approve);
an append-only Log page where every skipped item carries a stated reason (the kit's
discarded-with-trace / never-silent-drop discipline, independently converged).

**Positioning (the kit wins):** zero infra (stash self-host = Postgres+S3+Redis+Auth0) · write-time
content screening (stash streams raw verbatim — no per-fact screen) · per-repo git-native tiering
(stash is account-scoped only, `cwd` metadata not tiers) · same-turn distillation (stash's
structured memory is stale until the metered nightly curator — up to 24h) · a real snapshot at
session start (stash injects a static usage guide, not prior facts). **stash wins:** cross-source
reach (Slack/Gmail/Jira/... as one searchable tree), team sharing, the VFS ergonomics. The real
design fork worth naming in positioning conversations: "powerful retrieval, agent asks" vs
"pre-inject a bounded index" — the kit does both. _One correction made during the sweep: the
subagent flagged "no embeddings" as a kit gap — wrong; `--with-semantic` (sqlite-vec + bge)
shipped v0.3.0._

## 6G latent memory — "Persistent Latent Memory for Multi-Hop LLM Agents" (Banerjee; arXiv 2605.00593 behind it)

Ports a 6G-handover cold-start fix (ILCP: GRU hidden state → β-VAE 128-byte latent → gated-MLP
projection) onto LLM agent hand-offs: pool the sender LM's final-layer hidden states, compress,
inject into the receiver via `inputs_embeds`. **Nothing transfers:** every mechanism requires
white-box access to model activations + a training pipeline — the kit's target agents are
black-box hosted APIs, and the kit is no-training by design. All quantitative results are from the
RADIO domain (the author is explicit; agent-side V1 has no benchmarks). Residual value: (a) the
"cold-start-at-a-boundary" framing describes what the snapshot injection already is — done at the
text layer because that's the only channel a black-box agent exposes; (b) his "honest receipts /
never launder one domain's numbers as another's" discipline mirrors the kit's own verification
rules. Recorded so a future session doesn't re-read it hoping for mechanism.

## Task map (every actionable — filed or folded, per the MEMORA-review convention)

| Idea | Source | Disposition |
| --- | --- | --- |
| State labels (`[current]`/`[superseded]`) at recall serialization | A-TMA §QA | **NEW Task 209** (v0.5.x, Phase-2 batch with 194) |
| Deletion-propagation guarantee (doctor HC + two-sided tests) | Survey inv. #3 + AOEP | **NEW Task 210** (v0.5.x governance, rides 96's slot) |
| Rule-based query state-view gate (current/historical) | A-TMA §retrieval | **NEW Task 211** (v0.5.x, Phase-2 batch; design §16.18 note) |
| Behavioral memory-health dashboard (writes-per-search, empty-search, redundant-write, snapshot cost) | AutoMem Fig-4 | **NEW Task 212** (rides Phase-2 tuning / next doctor touch; sibling of 189) |
| Provenance pointers through daily→recent→archive distill | Survey §4.2.3 | **NEW Task 213** (v0.5.1, rides 203/204's distill surface) |
| Source-trust tiers at ingestion (user-stated vs tool-output) | Survey §8.2.1 | folded into **Task 70** (new 70.5) |
| Meta-LLM scaffold self-audit | AutoMem outer-loop-1 | folded into **Task 95** references |
| Bank/retrieval/QA failure taxonomy | A-TMA | folded into Task 209 done-criteria + HEALTH-CHECKS at build |
| Curator contradiction-append + never-silent-drop + ≥2-mentions | stash | references on **Task 95/199**; 151 already covers promotion |
| Obligation vs negative-invariant test split | Survey AOEP | Task 210's testing discipline; validator candidate if it recurs |
| ADR-0002 validation (extracted-fact stores score worse on governance) | Survey pilot | SOURCES.md + positioning; no build |
| Structure>training (MEMORA Fig-2 GRPO +1.2pt; AutoMem 2-4× from scaffold alone) | MEMORA/AutoMem | posture validation; no build |
| β-VAE latent handover, `inputs_embeds`, GRPO/LoRA anything, Sentry embedding classifier | 6G/MEMORA/AutoMem/A-TMA | **REJECTED** — training/white-box, against the kit's constraints |

## Pointers

- A-TMA: <https://arxiv.org/abs/2607.01935> (full 20pp incl. appendices, via local PDF)
- Always-On Agents survey: <https://arxiv.org/abs/2606.30306> (full 109pp coded-corpus survey, via local PDF)
- AutoMem: <https://arxiv.org/abs/2607.01224> (full 16pp incl. appendices, via local PDF; project page autolearnmem.github.io)
- MEMORA: <https://arxiv.org/abs/2602.03315> — see the [2026-07-03 review](2026-07-03-memora-harmonic-memory-review.md)
- stash: <https://github.com/Fergana-Labs/stash> (README + backend/plugin/curator sources + API tree)
- 6G article: local capture (`liorwiki/raw/`); the underlying paper <https://arxiv.org/abs/2605.00593>
