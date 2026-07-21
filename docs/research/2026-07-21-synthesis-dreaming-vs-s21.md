# Synthesis: Dreaming / re-curation vs the kit's Task 95 contract (design.md §21)

**Date:** 2026-07-21 · **Source:** synthesis across the 2026-07-21 29-source research pass (all
`docs/research/2026-07-21-*.md` — 16 articles, 1 arXiv paper, 8 cloned repos, 3 git-delta
re-checks on graph-memory OSS); `specs/design.md` §21 read in full first (Task 95, D-352,
`## 21. Dream re-curation engine`).

## What it claims (across the corpus)

The 29 sources split into four evidentiary tiers on the "Dreaming" question, plus a fifth
cluster on graph memory that bears on ADR-0023, and one adversarial-security paper:

1. **Tier 1 — primary-source-verified.** Two notes ([markdown-rewriter-lockin](2026-07-21-anthropic-dreaming-markdown-rewriter-lockin.md),
   [memory-debt-critique](2026-07-21-claude-dreaming-memory-debt-critique.md)) independently
   fetched `platform.claude.com/docs/en/managed-agents/dreams` + `/memory` directly and
   verified the actual `POST /v1/dreams` API contract byte-for-byte against two different
   secondary articles' claims.
2. **Tier 2 — official blog confirmed, mechanism internals only summarized.**
   [three-layers](2026-07-21-three-layers-agent-memory-dreaming.md) and
   [learn-from-mistakes](2026-07-21-anthropic-dreaming-learn-from-mistakes.md) both fetched
   `claude.com/blog/new-in-claude-managed-agents` and confirmed the feature's existence,
   scheduling framing, and automatic-vs-review-gate control surface, but NOT the granular
   numbers (phase names, session caps, index-size caps) their source articles led with.
3. **Tier 3 — unverified, third-party-reconstructed.** A DIFFERENT, Claude-Code-specific
   "Auto Dream" feature (distinct product surface from the Managed-Agents Dreams API) is
   described only via an explicitly-unofficial GitHub reimplementation
   (`grandamenium/dream-skill`, whose own README says "Anthropic is building an auto-dream
   feature into Claude Code (currently unreleased). This skill replicates that functionality
   today") and a claimed binary-extracted system prompt (Piebald-AI). **[dreaming-ai-part1](2026-07-21-dreaming-ai-part1.md)/[part2](2026-07-21-dreaming-ai-part2-built-a-brain.md)**
   read this file directly and report concrete phase names (Orient/Gather-signal/Consolidate/Prune-and-index)
   and budgets (~25 KB index, ~150-char entries). **Important corpus-hygiene finding:** three
   articles citing "100 sessions" / "200-line index" / named phases all trace to this SAME
   unverified origin — this is one unverified claim echoing, not independent triangulation.
4. **Tier 4 — independent, unrelated products** implementing dream-like consolidation:
   OpenClaw, `claude-second-brain`, ZenBrain, EverOS, Mnemo, MegaMemory, COG-second-brain,
   Google's official `always-on-memory-agent` sample, graphify.
5. **Adversarial security:** [Bad Memory](2026-07-21-arxiv-2607-14611.md) (UW, arXiv:2607.14611),
   an unpublished-but-real evaluation of prompt-injection persistence in file-based agent
   memory — directly bears on any consolidation/"stabilization" pass.
6. **Graph-memory deltas:** fresh clones/re-pulls of graphiti, cognee, mem0 (all
   NOTHING-MATERIAL since the 2026-07-19 sweep that produced ADR-0023) plus code-level reads
   of graphify, headroom, MegaMemory, obsidian-mind, ZenBrain, COG, git-lrc,
   claude-second-brain — bearing on ADR-0023/Task 232, not Task 95.

## What the evidence actually shows

### (a) What we now know about Anthropic's ACTUAL Dreams API that §21 does not reflect

Confirmed **verbatim against primary docs** (Tier 1, both independent fetches agree):

- `POST /v1/dreams`: inputs = one `memory_store` + 1–100 `session_ids` + a `model` (5
  whitelisted) + optional `instructions` (**≤4,096 chars, exactly** — synthesis guidance
  only; imperative line-edits "generally produce no change"). §21 names no session-count
  bound and no steerable-instructions equivalent.
- Input store is **never modified**; output is a **wholly separate new** memory store —
  matches §21.2's "inputs are never modified" line exactly.
- **All-or-nothing adopt/discard of the WHOLE output store — no partial acceptance.** §21's
  AUTO/QUEUE per-op split is strictly finer-grained than anything Anthropic documents. This
  is a place where Task 95's design **exceeds its own cited ancestor**, confirmed twice
  independently (markdown-rewriter-lockin + memory-debt-critique).
- **No built-in scheduler at all** — 100% caller-triggered, exactly like the kit's own
  idle/cron model (§21.4). Neither vendor nor kit solves "when" for you.
- **Partial output preserved on failure/timeout, but NO automatic resume** — a fresh dream
  must restart from scratch over the same inputs. §21.4's ADR-0020 artifact-derived resume
  point is **genuinely ahead** of what Anthropic ships in production, not merely
  theoretically nice.
- Every memory write (live or dreamed) creates an immutable `memver_...` version, retained
  **30 days** (not indefinite), with a `redact` op that works **only on non-head (historical)
  versions** — a GDPR/compliance primitive with no current §21 analog.
- Real numeric caps Anthropic ships: 100 KB/memory, 2,000 memories/store, 8 stores/session.
  §21 states no equivalent per-fact/per-store ceiling for the re-curation pass specifically
  (the kit has cap-coordination elsewhere, design §7.1, but not named here).
- **Anthropic's own docs explicitly warn that a read-write-attached memory store is
  prompt-injection-writable** — "a successful prompt injection could write malicious content
  into the store. Later sessions then read that content as trusted memory." This is Anthropic
  naming, in its own primary documentation, the exact threat class Poison_Guard/
  `screenBeforeCommittedWrite` (§21.3) exists to defend against — a strong external citation
  worth adding to design prose.
- Anthropic's own "best practices" guidance: **trigger a dream specifically when nearing the
  2,000-memory cap**, then cut sessions over to the output — a documented recovery playbook
  §21 doesn't currently spell out as its own named lever.

**The single most important mechanism finding:** the real Dreams API is architecturally an
**opaque single-shot LLM rewrite job** — no exposed stage boundaries, no per-item structured
output, no documented dedup threshold, no code-side id validation. §21.1's framing ("Anthropic
Dreams' shape") is accurate only at the **input/output-separation + review-gate** level.
Mechanistically, Task 95's contract (deterministic floor → one batched call returning a
structured per-item action schema → code-validated ids + event-time-decided which-wins) is
**more structured and auditable than what Anthropic ships**, not a mirror of it. Both Tier-1
notes flag this independently and both recommend the same fix: §21.1 should say this
explicitly rather than let "shares Dreams' shape" imply mechanism parity it doesn't have.

Separately (Tier 3, unverified): the "Auto Dream" Claude-Code feature's claimed 4-phase
shape and budgets should **not** be cited as confirmed Anthropic numbers in the kit's own
docs — they derive from one unofficial community reconstruction repeated across sources, not
independent confirmation.

### (b) Which §21 choices does the corpus CONFIRM

1. **Input-never-modified / reviewable-separate-output** — CONFIRMED verbatim by Dreams
   primary docs (Tier 1).
2. **Automatic-vs-review-gate as the right control point** — CONFIRMED by the official blog
   ("dreaming can update memory automatically, or you can review changes before they land" —
   three-layers, Tier 2).
3. **Code-decides/LLM-proposes, event-time-wins, id-validation** — CONFIRMED as the right
   call by three independent negative exemplars: Google's `always-on-memory-agent`'s
   LLM-supplied `source_ids` silently no-op on hallucination (code-verified, no error, no
   log); Mnemo's LLM-driven contradiction classification, flagged as a reject by its own
   research note; and Bad Memory's finding that Opus, given a judgment call with no
   structured escape hatch, **flags-but-doesn't-delete** a detected-malicious instruction
   (96.7% persistence despite the lowest attack-success rate of any tested model) — an LLM
   left to decide without a code-enforced structure defaults to leaving risk in place.
4. **Archive-not-delete / no-DELETE-op** — CONFIRMED as the safer choice by direct contrast
   with THREE real systems that do the opposite: the Auto-Dream prompt's own
   "remove facts that are now contradicted"; the "scheduled cross-session curation" article's
   explicit delete-on-supersede design; `claude-second-brain`'s dream-memory skill
   instructing "deleting contradicted facts at the source" with no archive step.
5. **Deterministic-floor-then-one-batched-LLM-call** — CONFIRMED as an independently-arrived
   production pattern by graphify's `dedup.py` (exact-normalize → MinHash/LSH+Jaro-Winkler
   blocking → LLM tiebreaker for the ambiguous residue only, batched not per-item).
6. **Raw-tier grounding** — CONFIRMED (with the Tier-3 provenance caveat above) by the
   Auto-Dream prompt's "Gather signal" priority order (recent-days-first → contradiction
   check → narrow targeted search — never exhaustive re-reads).
7. **ADR-0020 resumability exceeding the vendor** — Dreams itself has no auto-resume; §21.4
   already requires artifact-derived resume points. Confirmed the bar is real, not
   theoretical.
8. **`screenBeforeCommittedWrite`'s necessity** — CONFIRMED by Anthropic's own
   prompt-injection-into-memory-store warning AND by Bad Memory's empirical
   persistence-despite-detection data.

### (c) Which §21 choices does the corpus CONTRADICT or EXTEND

**No source contradicts a settled §21 anti-scope line.** The only real counter-pressure
(graphify's decayed-corroboration contradiction resolution; Mnemo's LLM-driven classification)
comes from sources that are themselves flagged as REJECT candidates against §21's stricter
posture in their own notes — the corpus surfaces alternatives and then argues against them,
net **zero forks reopened**. Concrete extend-not-contradict proposals are in
`contract_changes` below.

### (d) What independent implementations should §21 adopt or reject

**Adopt (concrete, low-risk):**
- graphify `dedup.py`'s named false-positive guards (entropy gate, variant-suffix blocking,
  cross-file blocking) as implementation-level references for §21.2's floor stage, when built.
- Mnemo's two-sided trust/gate metric (unsafe-acceptance + over-abstention, always reported
  together, semantics written down BEFORE computing) — directly usable for Task-212's stats
  probe or any future QUEUE-class accept/reject accuracy measurement.
- Mnemo's "log what actually answered, not what was configured to answer" provenance lesson —
  corroborates (doesn't add to) the kit's own Door-3/external-calls discipline; citable, not
  new work.

**Adopt as a flagged future facet, not in Task 95's current build scope:**
- COG-second-brain's `memory-hygiene` monthly **live-environment drift re-verification**
  (checking committed facts against present reality, not against the corpus itself) is a
  genuinely different mechanism category §21 doesn't cover at all — §21 re-curates the corpus
  against itself; nothing in the current contract checks a fact against live ground truth.
  Worth a one-line "considered, not in scope" note, not a contract change.

**Reject explicitly, now doubly-confirmed:**
- Google `always-on-memory-agent`: unvalidated LLM ids silently no-op; hard delete + `/clear`
  with no tombstone; unscreened raw multimodal ingest straight to the LLM; silent
  recency-cap forgetting (`LIMIT 50`/`LIMIT 10`) with zero logged signal. Confirms D-230,
  archive-not-delete, `screenBeforeCommittedWrite`, and never-silent-skip are all doing real
  work, not overengineering.
- graphify `reflect.py`'s decayed-corroboration-score contradiction resolution — conflicts
  with event-time-wins + no-LLM-counted-recurrence.
- Mnemo's LLM-decided contradiction classification — same reason, doubly confirmed by Bad
  Memory.
- `claude-second-brain`'s full-auto-apply-no-review-queue + delete-contradicted-facts.
- EverOS Reflection's auto-apply-no-gate merge (confirmed code-level: `enabled=false` by
  default, and applies with zero review step when it does run).
- Most of the field (ZenBrain, MegaMemory, headroom, obsidian-mind, COG's own
  knowledge-consolidation) ships **no working dream/consolidation mechanism in code at all**
  — negative evidence only. The kit is building ahead of the field here, not catching up.

### The "memory debt management" critique — validity check against §21

Two separable claims in [the critique](2026-07-21-claude-dreaming-memory-debt-critique.md):

1. **Rhetorical claim** (Dreaming is "self-improvement" branding for what's really
   memory-debt-management/log-compaction) — **not applicable to §21 as a target.** §21 never
   uses self-improvement framing; its own section title is "the offline-consolidation pass."
   Nothing to answer because nothing was claimed.
2. **Substantive claim** (real risks: false consolidation, staleness, compounding error,
   overconfident retrieval on curated-but-wrong memory, illegible LLM judgment) — **valid as
   general risks of any consolidation system, and §21 already answers most of them
   structurally, more thoroughly than Anthropic's actual shipped product**: the deterministic
   floor limits the LLM's judgment surface; code-decided event-time-wins removes exactly the
   "illegible LLM judgment" risk the critique names; the AUTO/QUEUE split gates lossy ops
   behind human review (Dreams itself has no per-op gate at all — only whole-store
   adopt/discard, so §21 is *more* governed than the product the critique is about);
   HC-12 + the Task-212 stats-probe self-quarantine directly targets "compounding error
   propagates silently"; audit-logging + never-silent-skip gives a trace for "why did this
   change" instead of opaque overconfidence. **One residual gap the critique names that §21
   does not yet structurally answer:** a merge can be subtly WRONG (semantically inaccurate)
   even though every governance gate passed — a quality/accuracy risk distinct from the
   governance risks §21 already covers. Task-212's stats probe measures dup-pair estimates
   and queue depths, not the semantic correctness of a specific merge. Flagged as an honest
   residual, not forced into a contract change — the critique itself proposes no concrete
   mechanism to close it.

### ADR-0023 (graph recall) — CONFIRM, no reopen

One clean counter-example surfaced: [graphify](2026-07-21-repo-graphify.md) ships a real,
code-verified, persisted+traversed NetworkX graph (MCP `shortest_path`/BFS/betweenness) — the
first source in either research pass to contradict "the field's graph-memory flagships ship
no real graph." **This does not reopen ADR-0023**: graphify graphs codebase AST structure
(tree-sitter-extracted, deterministic), not conversational facts extracted from chat — a
different domain than what ADR-0023 evaluated, and its own dedup/build pipeline is closer in
spirit to the kit's own *adopted* activation slice (parse what's already there, deterministic
rebuild, confidence-labeled) than to the LLM-extracted-typed-KG shape ADR-0023 rejected.
[Google's always-on-memory-agent](2026-07-21-google-always-on-consolidation.md) supplies a
fresh, code-verified REJECT data point instead: its `connections` JSON column is exactly the
DB-only, LLM-authored, non-rebuildable-from-markdown edge shape ADR-0023's hard constraint
already forbids. Three delta re-checks (graphiti, cognee, mem0 — all re-pulled/re-read this
pass) found **zero material graph-code changes** since the 2026-07-19 sweep; ADR-0023's DEFER
trigger (extend the Task-99 benchmark with a relational qtype) is untouched — no source in
this pass supplies benchmark evidence that would fire it.

## Mechanism detail (the HOW, precisely)

**Confirmed Dreams API shape** (primary-source, Tier 1):
```
POST /v1/dreams
  inputs: [{type:"memory_store", memory_store_id}, {type:"sessions", session_ids:[1..100]}]
  model: one of 5 whitelisted
  instructions?: <=4096 chars, synthesis guidance, not line-editor
-> {id:"drm_...", status:"pending"} -> running -> {completed|failed|canceled}
completed: outputs[] = ONE new memory_store; input store untouched; caller ADOPTs (attach)
  or DISCARDs (archive/delete) the WHOLE store — no partial acceptance
failed/canceled: output store persists with PARTIAL contents; no auto-resume, restart fresh
every memory write -> immutable memver_... version, 30-day retention
redact: POST .../memory_versions/{id}/redact — non-head versions only
caps: 100KB/memory, 2000 memories/store, 8 stores/session, no built-in scheduler
```

**§21's contract, for direct comparison** (already-shipped design, not new):
```
Stage 1: deterministic floor (zero-LLM canonical-ID/hash dedup)
Stage 2: ONE batched LLM call -> per-item {action, target_ids[], wording, timestamps union}
         code validates ids (D-230), code decides which-wins by EVENT-TIME (never the LLM)
Stage 3: AUTO class (non-destructive, audited, capped) applies immediately
         QUEUE class (lossy/generative/high-trust-touching) -> adopt-or-discard diff
Gates: HC-12 no-tombstone-resurrection; Task-212 before/after stats; never-silent-skip;
       ADR-0020 resumable per-batch units
```
The structural delta is exactly stage 2/3: Dreams has no equivalent of a structured per-item
action schema or a partial-acceptance queue — it is stage-2-and-3 collapsed into one opaque
call with a binary whole-store accept/reject at the end.

## Relevance to core-memory-kit

- **Task 95 / design.md §21** — strong, direct; every finding above is scoped to it.
- **Task 232 / ADR-0023** — strong but orthogonal (graph, not dreaming); CONFIRM verdict
  above.
- **Tasks 233/161/203 (context-compaction)** — weak across the corpus; Dreams operates on a
  durable between-session store, not a live context window under pressure — different
  problem family. No contract changes proposed here.
- **Task 97/151.T (dynamic trust)** — Mnemo's provenance-signal-based trust scoring for
  unverifiable claims and the "decaying confidence float" idea from the
  context-vs-memory-engineering article both map to this ALREADY-SHIPPED fold (151.T's
  `trust_score`), not to a Task-95 gap. No action needed; noted for completeness.
- **Task 216 (`screenBeforeCommittedWrite`)** — gains two citable external corroborations
  (Anthropic's own injection warning; Bad Memory's persistence findings) — documentation-only
  addition, not a mechanism change.

## Borrow candidates

- A capped free-text `instructions`/`--focus` field on the Stage-2 batched call.
- Explicit relative→absolute date normalization as a named AUTO-class op.
- An explicit "no same-session self-grading" invariant named in §21.4.
- A stabilization-entrenchment pre-mortem test case for §21.5, alongside HC-12.
- graphify's dedup guard patterns (entropy gate, variant-suffix, cross-file blocking) as
  implementation references.
- Mnemo's two-sided trust/gate metric pattern for Task-212 / QUEUE-class calibration.
- Anthropic's "condense before the cap" recovery playbook, as documented prose only.
- A redact-while-preserving-audit-trail concept (non-head-version-only) — flagged as a future
  compliance-tier idea, not current scope (§21.6's `cmk purge --hard` is narrower and that's
  a deliberate, not accidental, choice today).

## Reject candidates (with reasons)

- The opaque, no-per-item-schema, all-or-nothing full-rewrite architecture itself — §21
  already deliberately rejects this shape; now confirmed as a real production alternative
  Anthropic ships at scale, not a strawman, and still incompatible with the kit's
  markdown-as-truth + provenance invariants.
- LLM-decided which-wins / LLM-counted recurrence (Mnemo, graphify's reflect.py, the
  Auto-Dream prompt's implied resolution) — rejected consistently across every source that
  tried it, doubly confirmed by the Bad Memory paper's empirical findings.
- Hard-delete-on-contradiction (Auto Dream prompt, "scheduled cross-session curation" article,
  `claude-second-brain`, Google's always-on-memory-agent) — rejected; archive-not-delete
  holds.
- Unscreened raw/multimodal ingest straight to an LLM (Google's sample) — rejected;
  `screenBeforeCommittedWrite` stands.
- The specific "100 sessions" / "200-line index" / phase-name numbers as facts to cite in kit
  docs — Tier 3, unverified, one echoed unofficial source, not independent corroboration.
- All benchmark numbers self-reported without a reproducible harness (graphify's
  LOCOMO/LongMemEval claims; Mnemo's 0% wrong-fact rate; the memory-debt critique's own
  invented-looking infographic percentages) — none cited as evidence anywhere above.

## Honest gaps

- This synthesis did not independently re-fetch any primary source; it relies entirely on the
  29 already-written per-source notes' own verification work, taken at face value on their
  stated confidence levels. Where a source note flags something as unverified, this synthesis
  repeats that flag rather than upgrading it.
- The "Auto Dream" (Claude Code) vs "Dreams" (Managed Agents) distinction is inferred from
  cross-reading multiple notes (three-layers' explicit code.claude.com check finding no
  mention of Dreaming; the dream-skill README's own "currently unreleased" framing) — no
  single source in the corpus states outright that these are definitively two separate
  product surfaces rather than one feature described inconsistently by different authors;
  treat this synthesis's framing as the best available reading of the evidence, not a
  confirmed Anthropic statement.
- Did not re-verify the Yuan et al. (arXiv:2603.02473) retrieval-vs-write-strategy benchmark
  cited by the markdown-rewriter-lockin note beyond what that note already checked
  (abstract-level, not full results table) — its "retrieval method dominates write strategy"
  finding is not incorporated into any contract_change above because it argues about
  *recall*, not *consolidation*, and Task 95 is scoped to the latter.
- COG-second-brain's live-environment-drift-reverification idea is flagged as a "future
  facet" based on one source's description of a prompt-driven (not code-enforced) mechanism —
  no design work was done to determine whether it composes with §21's existing gates; this is
  a note for a future task-scoping conversation, not a vetted proposal.
- Did not cross-check whether any of the borrow candidates above conflict with each other or
  with existing but not-yet-read parts of the kit's own codebase (e.g., whether Task-212's
  actual current stats-probe implementation already covers part of the Mnemo two-sided-metric
  suggestion) — flagged for the synthesis-consumer to verify before writing code.
