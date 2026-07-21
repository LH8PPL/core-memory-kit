# ChatGPT's New Memory, Explained: What "Dreaming" Actually Does Under the Hood

**Date:** 2026-07-21
**Source:** `<local-wiki>/raw/ChatGPT’s New Memory, Explained What “Dreaming” Actually Does Under the Hood.md` (Medium, published 2026-06-05, author byline "Hiro Nakamura | LLM Engineer" — public Medium byline, kept as-is per house rules)

## What it claims

OpenAI shipped a ChatGPT memory update ("Dreaming") that replaces isolated bullet-point facts ("user is traveling to Singapore in July") with a coherent **prose profile split into categories** (work, hobbies, travel — the Decoder's fetch adds education), updated automatically from conversations with no explicit "remember that" prompt. OpenAI reports three metrics improved: fact-retrieval accuracy 41.5%→82.8%, preference-factoring 31.4%→71.3%, freshness 52.2%→75.1%. The article's central architectural claim is that "dreaming" = **offline consolidation**, analogous to write-behind caching or a nightly ETL job: writes happen off the hot path, in the background, over whole conversations (or many), producing a periodically-*rewritten* profile rather than an append-only log. The article's thesis: rewrite beats append because append-only memory drifts stale and self-contradicts; the "fight" in LLM products is moving to the memory/retrieval layer, not raw model capability.

## What the evidence actually shows

The article is a **systems-engineering interpretation of a product announcement**, not a technical disclosure — and this distinction matters more than the article's "under the hood" framing suggests. I attempted to fetch OpenAI's own source page (`openai.com/index/chatgpt-memory-dreaming`) twice and got **HTTP 403 Forbidden both times** — I could not verify any claim against OpenAI's primary text. The secondary source I *could* fetch (The Decoder) is explicit about the limits of what's public: *"The article provides no specifics on processing schedules, trigger frequencies, or the underlying data format beyond describing outputs as 'narrative' prose organized by category. Details about the actual technical architecture remain proprietary."* The Decoder fetch also surfaced one number not in the Medium article — an intermediate 2025 fact-retrieval figure of 67.9% (41.5%→67.9%→82.8%) — and a claim that compute cost was "cut by a factor of five," neither of which I could cross-check against the primary source.

So: the three reported percentages and the category list (work/hobbies/travel/[education]) are the only facts here traceable to OpenAI (via two hops of reporting, not the primary page). Everything the article presents as "the architecture" — write-behind caching, nightly ETL, the specific shape of "rewrite not append" — is the **author's own analogy and inference** dressing a marketing post in systems vocabulary, not a disclosed mechanism. The article is honest about this in one place ("According to OpenAI's write-up and reporting from The Decoder...") but the piece's title and framing oversell "under the hood" relative to what's actually known.

## Mechanism detail (the HOW, as far as it is knowable)

What IS stated (attributed, not independently verified against primary source):
- **Storage format:** prose paragraphs, not discrete facts, grouped into named categories (work / hobbies / travel / education).
- **Update trigger:** automatic, conversation-driven, "no explicit prompt needed" — but the actual trigger condition (every turn? end of session? time-based cron? volume-based?) is **not disclosed** anywhere in either source.
- **Processing locus:** described as "background"/"offline," i.e., decoupled from the request/response hot path — but no schedule, batch size, or latency budget is given.
- **User controls:** view a memory, correct it, tell the model "don't mention this again" (a targeted per-fact suppression, not detailed further).

What is the article author's own inference, explicitly NOT OpenAI's stated design (and should not be cited as such):
- The "write-behind cache" / "nightly ETL" framing — a plausible engineering analogy for "offline, periodic, whole-conversation rewrite," but unconfirmed against any implementation detail.
- Any claim about *how* contradictions are resolved, *how* dedup happens, *what* an LLM call (if any) is prompted with, or *what* triggers a consolidation run.

The one genuinely load-bearing piece of mechanism information is the **pipeline diagram** (image 2 of 3, read successfully): `Conversation (messages) → Extraction → Consolidation ('dreaming' — offline) → Long-term store: prose profiles by category → Retrieval → Context window (stateless model) → Response to user`, with a dotted "next session" edge looping back to `Conversation`. This is the article-author's OWN diagram (not sourced from OpenAI) — it renders the write-path/read-path split explicit: **Extraction** (turn-level, presumably cheap/fast) is a distinct stage from **Consolidation** (offline, batched, the "dreaming" step that rewrites the long-term store), which is distinct again from **Retrieval** (query-time, reads the consolidated store into context). This three-stage separation (extract → consolidate → retrieve) is the one concrete structural claim in the piece, even though the internals of the middle stage remain a black box.

## Relevance to core-memory-kit

**Task 95 (dream re-curation engine, design.md §21) — strong, corroborating-at-the-shape-level, diverging-at-the-mechanism-level.** I read §21.1–21.6 before writing this section. Both systems name the same three-stage shape the diagram shows (extract → offline consolidate → retrieve), and both frame consolidation as "periodically re-read and rewrite beats pure append" — this generic shape is independently corroborated, which is useful as external validation that the shape is sound. But the actual CONTRACTS diverge sharply, and Task 95 is considerably more specified than anything ChatGPT discloses:

| Dimension | ChatGPT "Dreaming" (as reported) | Task 95 (design.md §21) |
| --- | --- | --- |
| Destructive rewrite? | Implied yes — profile is "rewritten," old bullet-facts replaced by prose | **No DELETE op** (§21.6); AUTO class is non-destructive/reversible; supersession is archive-not-delete, both sides retained |
| Contradiction resolution | Not disclosed | Explicit: **event-time wins, never LLM-decided** (§21.2 stage 2) |
| Provenance after consolidation | Not disclosed (prose blob — likely opaque) | Explicit: source pointers + timestamps union retained per merged claim (§21.3) — "lossy summarization is where provenance dies" is a named anti-pattern |
| Trigger/schedule | Not disclosed ("background," no specifics per Decoder) | Explicit: runs against the today→archive roll, composed with Haiku cooldown, resumable per ADR-0020 (§21.4) |
| Output review | Not disclosed; user can correct/suppress after the fact | Explicit AUTO/QUEUE split — lossy or high-trust-touching ops land in a reviewable diff queue BEFORE landing (§21.2 stage 3) |
| Screening | Not disclosed | Explicit: shared `screenBeforeCommittedWrite`, source-trust tags gate which claims may auto-promote (§21.3) |

Net read: the article confirms the kit is pointed at a real, product-validated problem shape (retrieval/freshness/preference-use as the metrics that matter, not raw model quality), but it supplies **no usable technical detail** for Task 95's actual design — §21 is already more rigorous (auditable, reversible, provenance-preserving, gated) than what's publicly known about ChatGPT's implementation. This is a case where the corroboration is at the "yes, this shape is worth building" level, not the "here's how to build it" level.

**Task 232/ADR-0023 (graph edges) — weak.** The categorization (work/hobbies/travel/education) is a flat, one-level taxonomy for grouping facts — not an entity-relationship graph with typed edges. Nothing in the article or the fetched secondary source describes cross-fact relations, entity linking, or edge types. At most it's a naming precedent for category buckets, not graph structure.

**Tasks 233/161/203 (context-compaction, daily-distill) — moderate corroboration.** The article's core prescription — "separate the write path from the read path; consolidate on a schedule or after a session ends, not inside the request" — matches the kit's existing split (Stop-hook auto-extract = cheap per-turn write; `daily-distill`/nightly cron = batched consolidation) already in place per Task 203. No new mechanism to adopt here, but it's independent validation the split is the right shape.

## Borrow candidates

- **"Make retrieval the thing you evaluate"** — the article's advice to build a small "given this history, what should be recalled?" eval set before tuning anything is a concrete, checkable practice not yet explicit in the kit's own gates (Task-212's stats probe covers fact-count/dup-pair/queue-depth deltas, not a labeled recall-correctness set). Worth considering as a lightweight addition to the Task-95 or Task-212 verification surface: a small fixture of (history → expected-recall) pairs.
- **Categorical grouping for retrieval precision** — loosely relevant to how `context/USER.md` or a future persona surface could bucket facts by domain (work/habits/travel-style/etc.) for more targeted retrieval, though this is a UX/organization idea, not a mechanism, and the kit already has category-like structure via `context/memory/<type>_<slug>.md` naming.
- **The general "rewrite beats pure append" thesis** — already settled and already MORE conservative in Task 95 (archive-not-delete vs. implied overwrite). Counts as corroborating evidence for a decision already made, not a new technique.

## Reject candidates

- **Prose-blob-as-storage-format** — replacing structured, provenance-tagged fact entries with a single rewritten paragraph per category is explicitly incompatible with Task 95's anti-scope (§21.6: no in-entry trail-lossy merges, no DELETE, provenance retained per claim) and with Poison_Guard's need for discrete, trust-tagged claims to screen. Reject as a storage-format direction.
- **"Write-behind cache / nightly ETL" as an implementation reference** — this is the article author's own analogy, not a disclosed OpenAI mechanism; there is nothing concrete underneath it to borrow (no algorithm, no prompt shape, no trigger condition). Reject as a technical source; it's framing language only.
- **Adopting the reported percentages as a benchmark target** — the numbers (82.8%, 71.3%, 75.1%) are OpenAI's own internal eval on an undisclosed methodology/dataset; not comparable or actionable as a target without knowing what "fact retrieval" or "freshness" measured in their harness.

## Honest gaps

- **Primary source unreachable.** `https://openai.com/index/chatgpt-memory-dreaming` returned HTTP 403 Forbidden on two separate WebFetch attempts. Every claim attributed to "OpenAI" in this note is two-hop (via the Medium article and/or The Decoder), never verified against OpenAI's own text.
- **The Decoder's own reporting says the technical internals are not public** ("details about the actual technical architecture remain proprietary") — so the gap isn't just my access; the underlying mechanism (trigger, schedule, dedup algorithm, consolidation prompt/model) appears to not be publicly disclosed by OpenAI at all, not merely something I failed to find.
- **The 67.9% (2025) intermediate figure and the "5x compute reduction" claim** came only from the Decoder fetch, not the original Medium article; I could not cross-verify either against OpenAI's primary text.
- **Images:** 3 of 3 read successfully (all local via WebFetch-then-Read on the saved binary: hero/title image — decorative, no technical content; the pipeline diagram — described in Mechanism detail above; the before/after bar chart — numbers match the article's prose, no additional information). 0 images missed.
- **Links:** attempted 2 of the article's 2 cited sources (within the 5-link cap). OpenAI primary — failed (403 x2). The Decoder — succeeded, fetched and quoted above.
- Cannot verify the author's ("Hiro Nakamura") engineering claims or credentials independently; treated as an opinion/analysis piece, not a primary technical source, throughout this note.
