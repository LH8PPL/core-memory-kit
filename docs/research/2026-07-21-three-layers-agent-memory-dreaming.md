# 3 Layers of AI Agent Memory (And How Claude Dreaming Changes the One That Matters Most)

**Date:** 2026-07-21
**Source:** `<local-wiki>/raw/3 Layers of AI Agent Memory (And How Claude Dreaming Changes the One That Matters Most).md` (Medium, published 2026-05-24, author Divy Yadav, "AI Engineering Simplified" newsletter)

## What it claims

The article frames agent memory as three layers — (1) short-term/context-window, (2) long-term/external-store fact extraction, (3) "Claude Dreaming," a scheduled maintenance process. It claims Dreaming was announced by Anthropic on 2026-05-06 at "Code with Claude," is in research preview on "Claude Opus 4.7 and Claude Sonnet 4.6," reads up to 100 past sessions plus the whole memory store, and runs four phases — **Orient** (read MEMORY.md index + recent transcripts) → **Extract patterns across sessions** (find recurring mistakes/workflows/preferences no single session shows) → **Restructure** (merge duplicates, remove stale entries, delete contradictions with newer-fact-wins, convert relative dates to absolute) → **Update the index** (rewrite MEMORY.md, kept under 200 lines). It cites Harvey (legal AI) seeing a "roughly 6x" task-completion jump after enabling it, and frames a separate four-tier taxonomy (in-context / external / in-weights / cache memory) with Dreaming operating on layer 2. Triggered nightly or via `/dream`; standard token-rate pricing; access is a developer request form, not in the consumer app.

## What the evidence actually shows

I fetched the article's three most load-bearing links directly (Reuters was blocked by the fetch tool — could not be checked):

- **`claude.com/blog/new-in-claude-managed-agents` (official, reachable) — CONFIRMS the feature exists**, but frames it as a **Claude Managed Agents** capability, not "Claude Code." Verbatim: *"Dreaming is a scheduled process in Claude Managed Agents that reviews agent sessions and memory stores, extracts patterns, and curates memories so agents improve over time."* And: *"Memory lets each agent capture what it learns as it works. Dreaming refines that memory between sessions, pulling shared learnings across agents and keeping it up-to-date."* It also confirms an approve-or-automate control: *"dreaming can update memory automatically, or you can review changes before they land."* Research-preview / access-request gating is confirmed. **The fetched page did NOT surface the specific numbers the article leads with** — no "100 sessions," no "200 lines," no named four-phase breakdown, no model list, no Harvey figure appeared in what the fetch returned. Only a summarized fetch was obtained (not the raw page), so absence here is suggestive, not proof of absence on the page.
- **`code.claude.com/docs/en/overview` (official Claude Code product docs, reachable) — does NOT mention Dreaming, `/dream`, or memory consolidation anywhere.** It documents a *different*, existing Claude Code capability instead: `CLAUDE.md` + "auto memory" (*"Claude also builds auto memory as it works, saving learnings like build commands and debugging insights across sessions without you writing anything"*) — this is the ordinary Claude Code memory feature, not Dreaming. The article's specific attribution — *"documented in Anthropic's Claude Code implementation"* — is **not supported by the actual Claude Code docs** at the point I checked them. Either the docs page has since changed, the documentation lives elsewhere and wasn't linked, or the attribution is loose/incorrect. I cannot resolve which.
- **`github.com/grandamenium/dream-skill` (reachable) — this is the load-bearing surprise.** Its own README states plainly: *"Anthropic is building an auto-dream feature into Claude Code (currently unreleased). This skill replicates that functionality today."* It is an **explicitly unofficial, third-party shell-script reimplementation**, not Anthropic's shipped mechanism. Its own four phases — Orient → Gather Signal → Consolidate → Prune & Index — closely parallel the article's "official" four-phase breakdown (Orient → Extract patterns → Restructure → Update index), down to the "under 200 lines" index cap and the merge/stale/contradiction/date-normalize bullet list. This raises a real possibility that the article's granular mechanism claims are synthesized from this **unofficial** community repo (plus press coverage) rather than from an Anthropic primary source — the exact "convention-convergence is not primary-source verification" failure mode.
- Reuters (`reuters.com/...anthropic-unveils-dreaming...`) — **fetch blocked** by the tool (`Claude Code is unable to fetch from www.reuters.com`); the Harvey 6x figure could not be independently corroborated. VentureBeat / Ars Technica / Forbes / Decode The Future were not fetched (5-link cap reached across successful+failed attempts, prioritized toward primary/official sources per the house rule).

**Net: the existence of a real Anthropic "Dreaming" feature is verified** (official blog, confirmed live, research preview, Claude Managed Agents product). **The specific mechanism internals as the article states them (four named phases, 100-session cap, 200-line index cap, Opus 4.7/Sonnet 4.6 gating, Harvey's 6x) are NOT independently confirmed** by the two official pages I could reach, and partially trace to an admittedly-unofficial GitHub reimplementation.

## Mechanism detail (the HOW, as the article + official blog together describe it)

```
Session 1-N happen → memory store grows (facts appended, unmanaged)
DREAM RUNS (nightly, or /dream manually):
  1. Orient       — read current MEMORY.md index + recent session transcripts
  2. Extract       — read up to 100 past sessions AT ONCE (not one at a time);
                      surface recurring mistakes, workflows that worked,
                      preferences repeated across sessions — patterns no
                      single session log could show
  3. Restructure   — four ops on the memory store:
                      - merge duplicate entries (same fact noted N times → 1)
                      - remove stale entries (references deleted/replaced things)
                      - delete contradictions (newer fact wins; old one is GONE,
                        not archived — per the article's wording)
                      - convert relative dates → absolute ("yesterday" → "2026-05-01")
  4. Update index  — rewrite MEMORY.md, kept under ~200 lines (startup load budget)
Next session → retrieves from the cleaned store, "behaves like it learned
  from N sessions, not just 1"
```

Official-blog-confirmed control surface: Dreaming can run **fully automatic** or **review-before-land** (an approval gate) — this is a real, primary-source-backed detail even though the granular phase mechanics above are not.

Explicitly out of scope per the article: no model-weight update (memory-only), no fix for in-session context-window limits, no protection against bad input ("garbage in, organized garbage out" — Dreaming will consolidate wrong info efficiently if the source sessions were wrong).

## Relevance to core-memory-kit

**Task 95 (dream re-curation engine, design.md §21) relevance: strong** — this is a close structural cousin of exactly what §21 specifies, and the differences are as informative as the similarities:

| Aspect | Article's "Dreaming" | core-memory-kit Task 95 (§21) |
|---|---|---|
| Trigger | Nightly cron or manual `/dream` | Runs against the today→archive roll, on idle/cron + lazy machinery, Haiku-cooldown composed |
| Input scope | Up to 100 past sessions + memory store | Raw transcripts + fact corpus + scratchpads (no stated session-count cap in §21) |
| Dedup | LLM merges duplicates found across the read | **Deterministic zero-LLM floor first** (canonical-ID/hash); LLM only sees what the floor couldn't decide |
| Contradiction resolution | "Newer fact wins. Old conflicting entries are **gone**" | Event-time decides which wins, but **archive-not-delete** — both sides retained (explicit anti-scope: *"No DELETE op exists"*) |
| Who decides | Implied: the dream/LLM process itself resolves and applies | **Explicit split**: LLM only *proposes* (action + target_ids + wording); **code decides** IDs validity, event-time winner, and recurrence counting — "no LLM-counted recurrence" is a named anti-scope line |
| Risk gating | "review changes before they land" is offered as an *option* (confirmed on the official blog) | **Structural, not optional**: AUTO class (non-destructive/reversible/audited) vs QUEUE class (lossy/generative/high-trust-touching) is a hard split, not a toggle |
| Index cap | MEMORY.md rewritten, kept under 200 lines | Kit's own MEMORY.md is a bounded scratchpad (design elsewhere caps the injected snapshot ≤10 KB) — same *shape* of constraint, different unit/number |
| Date normalization | Explicit 4th restructure op: relative → absolute dates | Not named as an explicit op in §21 (a timestamps *union* feeds the Task-66 validity engine, which is adjacent but not the same operation) — **possible gap/borrow candidate** |
| Provenance on merge | Not addressed by the article at all | Explicit: merged/condensed claims keep source pointers (Task-213 pattern) — kit is stricter here |
| Resumability | Not addressed (single monolithic run implied) | Explicit ADR-0020 resumable-per-batch contract; ties to the kit's binding "long jobs are incremental" rule |

**Task 232/ADR-0023 (graph edges) relevance: none** — the article never describes anything resembling entity/relationship graph structure. Its whole mechanism is flat-markdown-file rewriting (merge/delete/reindex within `.md` files), not a graph of typed edges. Nothing here informs graph-edge design.

**Tasks 233/161/203 (context-compaction) relevance: weak** — Dreaming's "keep MEMORY.md under N lines" constraint is the same *shape* of problem as compaction (bounding what loads into context), but the article gives no compaction-specific technique (no chunking/summarization-ladder/eviction-order detail) beyond "rewrite the index smaller." Not much to borrow beyond the general "the index must stay small enough to load at session start" principle, which the kit already has independently.

## Borrow candidates

- **Explicit relative→absolute date conversion as its own named op.** §21.2's Restructure/AUTO-class op list doesn't currently name this; it's cheap, deterministic (no LLM judgment needed for a date rewrite), and directly prevents the "yesterday" staleness-of-meaning problem as facts age — worth a look for whether it belongs in the AUTO class alongside dedup.
- **The optional "auto-apply vs. review-before-land" toggle**, confirmed by the official blog as a real control surface Anthropic ships. Task 95 already has this as a structural AUTO/QUEUE split rather than a toggle — the article doesn't add anything the design doesn't already have, but the official blog's phrasing is a second, independent confirmation that this exact control point (apply automatically vs. gate for human review) is the right place to split in a consolidation pass generally.
- **"Read across N sessions at once, not one at a time" as the explicit selling point.** Confirms (weakly, since the specific number "100" is unverified) that batching the read window is the mechanism that surfaces cross-session patterns a single-session extractor structurally cannot see — consistent with §21.2's "ONE batched LLM call" design already, not a new idea, but useful external corroboration of the batching choice.

## Reject candidates

- **"Delete contradictions — old conflicting entries are gone."** Task 95 deliberately rejects this (`No DELETE op exists`, archive-not-delete, both sides retained). The article's own worked example ("API uses Express" removed when you switched to Fastify) is exactly the kind of decision the kit's anti-scope line was written against. Do not adopt; the divergence looks intentional and already-decided (D-352), not an oversight.
- **LLM counts recurrence / LLM resolves which-wins.** The article describes the dream process itself as noticing "preferences that came up in five different sessions" and applying "newer fact wins" — i.e., the LLM (or the opaque "dream" step) is doing both the counting and the resolution. §21.2 explicitly forbids both ("the LLM never counts recurrence," "which-wins... is decided by EVENT-TIME, never by the LLM"). Reject as a model to imitate; the kit's code-decides split is a deliberate, already-settled improvement on this shape.
- **The specific "100 sessions" / "200 lines" / model-gating numbers as facts to design against.** Neither official source I reached confirmed these; they may be real (unreachable in official docs I fetched, or accurate press paraphrase) but should not be cited as Anthropic-documented budgets in the kit's own docs without independent confirmation.

## Honest gaps

- Reuters link (the primary citation for the Harvey 6x figure) was **blocked by the fetch tool** — could not verify that number against even its cited press source, let alone a primary Anthropic source. VentureBeat, Ars Technica, Forbes, and Decode The Future were not fetched at all (5-link budget spent on the two official Anthropic pages, the GitHub repo, and the failed Reuters attempt).
- The official-blog fetch returned a **model-summarized** version of the page (via WebFetch's small-model pass), not the raw HTML/markdown — so "the page didn't mention X" is not airtight; a follow-up raw fetch could still find the missing specifics (100-session cap, 200-line cap, phase names, Harvey figure) if they exist further down the page.
- Could not determine whether "Claude Dreaming" (the article's/press's popular name) and "Dreaming" (the official blog's name, scoped to Claude Managed Agents) are describing the exact same feature surface as Claude Code's own memory system, or a distinct, cloud-hosted-agents-only capability that happens to share a name and general shape. This matters for how directly "it's an Anthropic feature" should be cited as validation for a Claude-Code-targeted kit like core-memory-kit.
- All 5 images were read successfully (5/5) via WebFetch (saved binary) → Read (rendered). All five are clearly **AI-generated illustrative infographics** commissioned/made by the article's author, not screenshots of real Anthropic product UI or Anthropic's own architecture diagrams — they carry the author's interpretation, not primary-source visual evidence. Noted so their content isn't mistaken for a leaked/official diagram.
- Did not independently verify "Claude Opus 4.7 and Claude Sonnet 4.6" as real model identifiers via a primary source (Anthropic's model docs were not fetched in this pass) — recorded as the article's unverified claim only.
