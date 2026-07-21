# OpenClaw's Dreaming System: Rethinking AI Memory from First Principles

**Date:** 2026-07-21
**Source:** `<local-wiki>/raw/OpenClaw's Dreaming System Rethinking AI Memory from First Principles.md` — a Medium/"Level Up Coding" post (levelup.gitconnected.com), author byline "NGU", published 2026-05-08.

## What it claims

The article frames AI memory as three layers users conflate: (1) short-term working
memory (context window — "adequate" today), (2) medium-term project memory ("near
zero" — every conversation starts fresh), (3) long-term personal knowledge ("completely
dependent on manual user maintenance"). It presents "OpenClaw"'s **Dreaming** system as a
first-principles fix: an automatic, nightly, three-phase memory-consolidation pipeline
modeled on human sleep stages —

```
Daily conversations
    ↓ [Light Phase: collect, stage]
Short-term candidates
    ↓ [Deep Phase: filter, score]
Long-term memory (MEMORY.md) ← only what's truly important enters here
    ↑
    ↓ [REM Phase: discover patterns]
Dream Diary (DREAMS.md) ← reflective summary you can read
```

It argues this beats two baselines — hand-written `MEMORY.md` ("user decides what's
important," high burden, easy to forget) and context-window expansion ("has limits,
forgets history, token cost increases each time") — via a comparison table (image,
read below). Three narrative case studies illustrate the value: (1) project context
persisting across weeks without re-explaining, (2) an auto-generated "where your time
actually goes" usage report from noisy daily logs, and (3) a previously-solved technical
problem (a Docker networking error) being recalled and reused three weeks later. The
article closes claiming the user does "almost nothing" — talk normally, consolidation
runs automatically every night, occasionally read `DREAMS.md`.

**Load-bearing self-caveat (important):** the author appends, unedited, at the very end:
*"But. i want to say this function may not that good as we thought as it is new feature
so we still need to wait some time to see the final results."* The author's own stated
confidence in the mechanism is explicitly provisional/unverified.

## What the evidence actually shows

This is a secondary, SEO-style blog post with **zero citations** — no link to an
"OpenClaw" repository, no docs link, no code sample, no config file, no command names
beyond the two artifact filenames (`MEMORY.md`, `DREAMS.md`). The two diagrams (read via
image, see below) are the only structured data in the piece; everything else is
prose narrative and two illustrative code-block transcripts per case study. There is no
description of *how* the phases are implemented (LLM call? deterministic scoring? both?),
no schema for a memory entry, no dedup/contradiction/supersession/deletion mechanism, no
failure-handling or resumability story, and no explanation of how the six-signal weights
in the Deep-phase table were derived (they are stated as fixed percentages with no
formula or provenance). Given the explicit self-caveat and total absence of primary
sourcing, **treat every mechanism claim here as an unverified marketing restatement of a
product's intended design, not a verified engineering account.**

## Mechanism detail (the HOW, precisely)

**Light phase — pure collector, no decisions, writes nothing to long-term memory:**
1. Scans today's memory files.
2. Reads "recall traces" — i.e., what the user actually asked about (a usage/query
   log, not just what was said).
3. Deduplicates and stages candidate content (a staging area, not `MEMORY.md`).
4. Records "reinforcement signals" (implies a per-candidate counter that increments on
   repeat mention/use).

**Deep phase — the promotion gate, scores staged candidates on six weighted signals**
(from the diagram, image read successfully):

| Signal | Weight | Meaning (verbatim) |
| --- | --- | --- |
| Frequency | 24% | How many times have you asked about this |
| Relevance | 30% | Has it actually been used |
| Query diversity | 15% | Was it triggered in different contexts |
| Recency | 15% | Has it appeared recently |
| Consolidation | 10% | Did it recur across multiple days |
| Conceptual richness | 6% | Is concept density high enough |

Promotion to `MEMORY.md` requires an **AND-gate across three axes simultaneously**, not
a single scalar cutoff: (a) score high enough, (b) triggered enough times, (c) came from
enough different contexts. The article's own illustration: a single "I like coffee"
mention should NOT promote — it needs repetition + cross-context diversity too.
No formula for how "score" combines the six weighted signals into a threshold-checkable
number is given; no numeric threshold values are given either.

**REM phase — reflection/pattern-discovery, explicitly separate from filtering:**
Scans across all recently-discussed topics and surfaces: which topics are being
tracked, which concepts recur, and trends the user "might not have noticed." Output is
a prose "Dream Diary" (`DREAMS.md`) — narrative insight sentences (e.g. "You've discussed
MCP tool configuration multiple times recently"), explicitly framed as *not* a memory
dump. No adopt/discard/approval step is described for this output — it is presented as
passively read.

**Scheduling:** "consolidation runs automatically every night" — the only concrete time
marker given is a narrative "Day 4 3am: Deep phase automatically promotes 'blog project'
to MEMORY.md." No discussion of what happens if the run is interrupted, how long it
takes, or how it resumes.

### Image read report (2/2 read)

Both diagrams are remote (`miro.medium.com`) — no local copies existed under
`<local-wiki>/raw/assets` (checked, empty) or `raw/articles`. `WebFetch` could
not describe either directly (it returned "binary/encoded data, cannot analyze
visually") but **did save each fetched image locally**, and the `Read` tool then
rendered both successfully:

1. `1*FXn2_zBiv7NNJ914WCIcow.jpeg` — the six-signal scoring table (transcribed above,
   read in full, high confidence).
2. `1*A-TELXjpGcJF3DlbFtfqZQ.jpeg` — the three-row comparison table: Manual MEMORY.md
   / Context window / Dreaming, each with a "first principle" quote and an "effect"
   description (transcribed in the "What it claims" section above, read in full, high
   confidence).

## Relevance to core-memory-kit

**Task 95 (§21 "Dream re-curation engine") — the direct convergence point.** Read in
full from `specs/design.md` §21 before writing this section. The kit's actual contract
is substantially more engineered than this article's account, and the two are only
partially the same shape:

- **Different primary purpose.** The kit's §21 pass is a **re-curation** engine over
  EXISTING committed memory (merge duplicates, resolve contradictions latest-wins,
  prune resolved scratchpad threads) that reads the RAW tier (transcripts + fact corpus
  + scratchpads, not derivative-over-derivative — the D-44 lesson). The article's
  Deep phase is a **promotion gate** — staging candidates INTO long-term memory for the
  first time, not rewriting what's already there. §21.1 does fold in "cross-session
  insights" (absorbing Task 55's remainder) which is the closer analog to the article's
  REM phase — but even that is scoped as insight SURFACING over the existing corpus,
  not first-write promotion. The article's Light+Deep phases (collect → score → first
  promotion) don't have a clean §21 counterpart at all — that's closer to the kit's
  existing `cmk remember` / auto-extract / Task 70.5 source-trust write path, which is
  a *separate* mechanism from Task 95 in this kit's architecture.
- **The kit is explicit where the article is vague on LLM vs. deterministic.** §21.2
  specifies a deterministic hash/ID dedup floor FIRST, then exactly ONE batched LLM call
  per re-curation run (recall top-K=5 candidates, one call returns
  `action ∈ {add, update, supersede, none}` + validated ids), with **code, not the LLM,
  deciding** which-wins (event-time) and counting recurrence (§21.2, "the LLM never
  counts recurrence"). The article never states whether Light/Deep/REM use an LLM at
  all — the six-signal score could be entirely deterministic counters, entirely
  LLM-judged, or a mix; this is a real gap in the source, not something to reconcile.
- **The kit already has a queue-mediated version of "insight surfacing."** §21.2's QUEUE
  class routes generative/lossy ops (new insight/judgment entries, merged wording) to
  `context/queues/recuration.md` as a reviewable adopt-or-discard diff (composing with
  Task 150's propose-and-approve). §21.4 further constrains this: "Insight surfacing
  obeys the ADR-0017 judgment contract: provisional, confidence-visible, never
  auto-ranked." The article's `DREAMS.md` is passively-read prose with no adopt/discard
  or confidence marking described — the kit's design is already stricter/more
  accountable on this exact feature.
- **The kit already learned the "just run it nightly" naivety is not free.** The
  article states nightly automatic consolidation as an unqualified solved fact ("Day 4
  3am… automatically promotes"). The kit's own dogfooded history directly contradicts
  that this is trivial: **Task 203 / D-298** diagnosed a real production incident where
  the kit's own nightly cron (`cmk-daily-distill`, 23:00) was silently killed by the
  machine sleeping, for FIVE consecutive nights, while the health check reported PASS
  (a heartbeat-recorded-but-work-not-done false-green). §21.4 explicitly requires the
  re-curation pass be resumable per ADR-0020 (per-batch durable units, resume point
  derived from artifacts, partial output preserved on failure) — precisely the property
  this article's "runs automatically every night" claim glosses over. This article is
  useful evidence that the naive nightly-batch framing is the natural first design a
  team reaches for — and the kit's own incident is the concrete cost of not building it
  resumable from the start.
- **Task 232/ADR-0023 (graph edges)** — no meaningful connection; the article never
  discusses relational/connection queries between memories, only promotion + reflection.
- **Tasks 161/203 (compression timeout / distill starvation)** — see the nightly-cron
  point above; both are the kit's lived counter-evidence to the article's implicit "the
  schedule just works" assumption, not a mechanism the article itself describes.

## Borrow candidates

1. **Recall-usage as a promotion/trust signal ("Relevance 30% = has it actually been
   used").** Worth checking (not verified here — this note only compared against
   design.md §21 prose, not the actual `packages/cli/src/*.mjs` trust/auto-extract
   code) whether the kit currently feeds *recall/query usage* (`recall.log`) back into
   any promotion, trust, or cap-relief decision, or whether promotion signals today are
   write-time-only (explicit `cmk remember`, auto-extract heuristics, source-trust tags).
   If usage-feedback isn't already wired in anywhere, a cheap, deterministic (no-LLM)
   "this fact has been recalled N times" counter is a plausible, low-cost floor-level
   signal — consistent with the kit's existing deterministic-floor-before-LLM shape
   (§21.2 point 1), not a new architectural risk.
2. **The AND-gate promotion rule** (score threshold AND repetition-count threshold AND
   context-diversity threshold, not one scalar) as a cheap guard against
   single-mention promotion. Worth checking whether the kit's existing write-time
   gating (Task 70.5 source-trust tags, auto-extract's own thresholds) already
   enforces something structurally equivalent, or relies on a single confidence score
   that a repeated-but-narrow mention could pass on its own.

## Reject candidates

1. **The literal six-signal percentages (24/30/15/15/10/6).** No methodology, formula,
   or validation is given for these numbers anywhere in the article — they read as
   illustrative, not measured. Do not adopt as literal weights; at most, the six
   *signal categories* (frequency, usage, context-diversity, recency, cross-day
   recurrence, concept density) are a reasonable checklist to consider, independent of
   the specific percentages.
2. **Unqualified "runs automatically every night" scheduling.** Reject the framing that
   nightly batch consolidation is a solved, low-risk default — the kit's own D-298
   incident is direct counter-evidence. Nothing to borrow here that the kit's ADR-0020
   resumability requirement doesn't already exceed.
3. **No dedup/contradiction/supersession mechanism is specified in the article at all**
   — there's nothing concrete to compare or borrow; the kit's existing event-time-wins +
   archive-not-delete design (§21.2/§21.6) is already more developed than anything
   described here.
4. **"OpenClaw" as a citable engineering precedent.** The article supplies no repo,
   docs, or any other verifiable primary source for the product it describes. Do not
   cite "OpenClaw does X" in any design doc or ADR as if it were a verified,
   inspectable system — at most it can be cited as "a blog post described a system
   claimed to work this way, unverified."

## Honest gaps

- **Links:** the article contains no load-bearing external links beyond the two
  `miro.medium.com` image CDN URLs (both fetched and read as images, see above) and one
  boilerplate "Level Up Coding" publication-nav link (skipped as non-load-bearing, per
  instructions — it goes to the publication homepage, not a source). **There is no link
  anywhere in the article to an "OpenClaw" repository, product page, or documentation
  site** — none of the mechanism claims (six-signal weights, phase names, file names,
  "3am" scheduling, the AND-gate threshold logic) could be checked against a primary
  source, because the article furnishes none. This is a structural gap in the source
  material, not a search failure on my part.
- **Images:** 2 of 2 read successfully (see "Image read report" above). No images were
  missed.
- **Naming ambiguity, noticed but NOT investigated (out of this task's scope):** while
  checking `<local-wiki>/raw/assets` for local image copies, I incidentally saw
  several *other* files in the same `raw/` directory, created the same day
  (2026-07-21), discussing a very similarly-named "Dreaming" system but attributed to
  **Anthropic** rather than "OpenClaw" — e.g. `AI Agents That Learn From Their Own
  Mistakes Inside Anthropic's "Dreaming" System.md`, `Anthropic Dreaming Is a Markdown
  Rewriter — The Vendor Lock-In Is Real.md`, `3 Layers of AI Agent Memory (And How
  Claude Dreaming Changes the One That Matters Most).md`. **I did not read any of these
  — this note is scoped to the one target article only, per the house rules.** Whether
  "OpenClaw's Dreaming" (this article) and "Anthropic's Dreaming" (the sibling articles)
  describe the same underlying feature, a fork/derivative, or two unrelated products
  using the same name is **unverified and explicitly out of scope here** — do not
  conflate them in any downstream synthesis without reading the sibling notes.
- **Kit-side implementation was not checked.** All relevance comparisons above are
  against `specs/design.md` §21's *prose contract*, as instructed — I did not read the
  actual `packages/cli/src/*.mjs` implementation to confirm whether recall-usage
  already feeds any trust/promotion signal (borrow candidate #1) or whether an
  equivalent AND-gate already exists in auto-extract (borrow candidate #2). Flagged for
  the synthesis stage to verify against source before acting on either borrow
  candidate.
