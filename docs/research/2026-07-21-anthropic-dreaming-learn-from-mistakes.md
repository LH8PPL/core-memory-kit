# AI Agents That Learn From Their Own Mistakes: Inside Anthropic's "Dreaming" System

**Date:** 2026-07-21 · **Source:** `<local-wiki>/raw/AI Agents That Learn From Their Own Mistakes Inside Anthropic's "Dreaming" System.md` (Medium, author Naveen Pandey, published 2026-05-16; secondary/analyst piece, not an Anthropic primary source)

## What it claims

The article covers Anthropic's May-2026 "Code with Claude" announcement of three Claude Managed Agents features — **dreaming**, **outcomes**, and **multi-agent orchestration** — as a coherent self-improvement loop:

- **Dreaming**: an async process running *between* sessions. It reads the agent's existing memory store plus up to 100 past session transcripts, then merges duplicate entries, removes/replaces outdated entries a later session contradicted, surfaces recurring cross-session patterns as explicit lessons, and creates "structured playbooks" — step-by-step procedures distilled from successful task completions. It never touches model weights; output is plain-text/markdown, human readable/editable/deletable. Two control modes: fully automated (scheduled, unattended) vs human-in-the-loop (propose → human approve/edit/reject). Raw session transcripts are never modified either way.
- **Outcomes**: a rubric the agent works toward; a separate "grader" agent scores the output in an isolated context window (not influenced by the working agent's own reasoning) and sends it back for another pass if it fails, up to a max-iteration count.
- **Multi-agent orchestration**: a lead agent splits work across specialist subagents with independent context windows, coordinating through a shared filesystem.
- Headline numbers: Harvey (legal AI) saw ~6x task-completion-rate improvement from dreaming; outcomes reportedly improved task success "up to 10 points" (+8.4% on docx, +10.1% on pptx); Wisedocs cut document-review time 50% using outcomes.
- Framing device: "state reconstruction, not chat continuity" — sessions start fresh and reconstruct operational context from compact sources (CLAUDE.md, auto-memory notes, dreamed memories) instead of carrying forward full conversation history.
- Anecdote (attributed, not independently sourced in-article): in an Anthropic Pokémon-playing-Claude experiment, Claude 3.5 Sonnet dumped raw unstructured notes into its memory folder while Claude Opus 4, given the identical tool, built a structured directory and a self-reflective `learnings.md` — "the harness provided the file system; the model provided the intelligence to use it well."
- Quotes attributed to Alex Albert (Anthropic, research product management) framing dreaming as the agent auto-writing its own "runbook"/institutional knowledge, analogized to a senior engineer distilling six months of debugging into a documented pattern.
- Vendor-lock-in caveat: dreamed memories are optimized for Claude's format/tooling/session model and may not be portable.

## What the evidence actually shows

I cross-checked the article's core claims against Anthropic's own blog post, fetched live today: `https://claude.com/blog/new-in-claude-managed-agents` (the `anthropic.com/news/claude-managed-agents` URL guessed first 404'd).

- **Confirmed by the primary blog**: dreaming is "a scheduled process" between sessions that "reviews agent sessions and memory stores, extracts patterns, and curates memories," surfacing "recurring mistakes, workflows that agents converge on, and preferences shared across a team," and "restructures memory so it stays high-signal as it evolves." Two modes confirmed near-verbatim: "dreaming can update memory automatically, or you can review changes before they land." Confirmed: research-preview access-on-request status at announcement time.
- **Confirmed by the primary blog**: outcomes' isolated-grader-context mechanism and the exact percentages (+8.4% docx / +10.1% pptx, "up to 10 points") match the article precisely.
- **Confirmed via this repo's own earlier primary-source capture**, not re-verified by me today: the "1–100 past session transcripts" figure, the "focus via an `instructions` field" scoping mechanism, and "partial output preserved on failure" all appear in `docs/research/2026-06-04-anthropic-managed-agents-memory-and-dreams.md`, which fetched Anthropic's `platform.claude.com/docs/en/managed-agents/dreams` directly. That note is the stronger primary source and should be read alongside this one — it also covers memory-store mechanics (2,000-file cap, 100KB/file cap, immutable versioning, `content_sha256` optimistic concurrency, `redact`) that this Medium article never mentions at all.
- **Not found in the primary blog text I fetched** (may exist elsewhere on Anthropic's site, but I did not locate it): the Harvey "6x" and Wisedocs "50%" figures. They do appear consistently across several independent secondary sources found via search (letsdatascience.com, techzine.eu, forbes.com), so they are widely reported, but I am recording them as **secondary-source-corroborated, not primary-page-verified by me**.
- **Unverified by me this session**: the Alex Albert quotes (not present in the blog text I extracted — likely from conference/interview coverage) and the Pokémon Claude-3.5-vs-Opus-4 memory-folder anecdote. Both are plausible and consistent with Anthropic's known research style, but I did not independently locate a source for either.

## Mechanism detail (the HOW)

Combining the article with the kit's own 2026-06-04 primary-source note (marked `[2026-06-04]` where the detail comes only from that earlier fetch, not from today's sources):

- **Trigger**: scheduled, runs in the gap between agent sessions (not mid-session).
- **Inputs**: (a) the current memory store (markdown-like files), (b) a batch of **1–100 past session transcripts** `[2026-06-04]`.
- **Processing** (single reasoning pass over both inputs together):
  1. **Dedup**: collapse semantically-equivalent duplicate entries (example given: "client prefers PDF format" appearing 7× → one entry).
  2. **Contradiction resolution**: when a later session contradicts an earlier memory, the earlier entry is replaced — i.e. **latest-wins**, described in plain language rather than as a formal temporal model.
  3. **Pattern surfacing**: a difficulty recurring across many sessions (example: the same file-format issue across 12 sessions) gets promoted to an explicit lesson rather than staying buried in transcript logs.
  4. **Playbook creation**: step-by-step procedures distilled specifically from *successful* task completions — a fourth output type distinct from dedup/contradiction/pattern-lesson.
- **Output**: a new, reorganized memory store. `[2026-06-04]`: this is explicit in Anthropic's own docs — dreams produce a **new output store**; the input is never modified; the output is reviewable and is either adopted (attached to future sessions) or discarded — "safe by construction."
- **Control modes**: fully automated (scheduled, unattended, "no human intervention," "best for standardized domains") vs human-in-the-loop (dreaming proposes, a human approves/edits/rejects, "best for high-stakes domains"). Raw transcripts stay untouched under both modes.
- **Runs as its own model session** `[2026-06-04]`: billed per token, model-selectable, and can be scoped via a free-text `instructions` field (example given in the 2026-06-04 note: *"Focus on coding-style preferences; ignore one-off debugging notes"*) — a directable re-curation pass, not one-size-fits-all.
- **Failure handling** `[2026-06-04]`: partial output is preserved on failure — a resumability-adjacent property this Medium article does not discuss.
- **Composition with the other two features**: multi-agent orchestration fans work to parallel specialists sharing a filesystem (contexts isolated from each other); outcomes grades each specialist's output against a rubric via an isolated grader, iterating until pass or max-iterations; dreaming then extracts lessons across the accumulated runs. The three compose at a coarse, between-session/between-run grain — nothing in either source describes dreaming operating *inside* the outcomes revise-loop.

## Relevance to core-memory-kit

**Task 95 dream re-curation engine (design.md §21) — strong.** Design §21 already self-describes as built in "Anthropic Dreams' shape," and this article (plus the stronger 2026-06-04 note it corroborates) confirms the correspondence is close, point by point:

| Anthropic dreaming | Kit design §21 | Match |
| --- | --- | --- |
| Reads memory store + raw transcripts together | §21.1: "reads raw transcripts + the fact corpus + scratchpads... re-curating from the RAW tier rather than derivative-over-derivative" | same shape |
| Merge duplicates | §21.2 stage 1 (canonical/hash dedup) + stage 2 (LLM θ≥0.80 pool merge) | same shape |
| Contradiction = latest-wins | §21.2: "which-wins on a contradiction is decided by EVENT-TIME, never by the LLM" | kit is *more* precise (formal event-time rule vs the article's plain description) |
| Input never modified; output reviewable, adopt-or-discard | §21.2: AUTO class (non-destructive/reversible) vs QUEUE class (lands in `context/queues/recuration.md` for review); "inputs are never modified; the prospective output is validated before anything applies" | same shape, kit adds an explicit two-class split Anthropic's public description doesn't name |
| Automated vs human-in-the-loop modes | AUTO-class auto-applies; QUEUE-class requires review | same shape, different vocabulary |
| Playbook creation from successful completions | not currently named as a distinct output type in §21 | **gap** — see borrow candidates |
| Partial output preserved on failure | §21.4: ADR-0020 resumability, "partial output preserved on failure (the Dreams behavior)" — design.md already cites this explicitly | confirms an already-made borrow, not new information |

**Task 232/ADR-0023 graph edges — none/weak.** Neither this article nor the primary blog post describes dreaming in terms of graph structure, typed edges, or relational traversal — the described mechanism is flat memory-file merge/prune/pattern-surfacing. Nothing here bears on the edges-activation work.

**Context-compaction tasks (233/161/203) — weak, tangential.** The "state reconstruction, not chat continuity" framing (start fresh, reconstruct from compact curated sources rather than carrying full history) is philosophically adjacent to any compaction/hint work, but it restates a decision the kit has already made (frozen per-session snapshot injection, per SYSTEM-MAP) rather than adding new mechanism.

## Borrow candidates

1. **Playbook/procedure as a distinct re-curation output type.** §21 currently names "cross-session insights" as a QUEUE-class output but doesn't call out a step-by-step-procedure artifact extracted specifically from *successful* completions as its own category. Worth a look at whether Task 95's QUEUE class should carry a playbook sub-type alongside merged-wording and insight entries.
2. **Directable/scoped re-curation via a focus instruction** (corroborated by the 2026-06-04 note, e.g. "focus on X, ignore Y") — not currently in §21; would let a dream run be pointed at a specific tier or topic rather than always running over everything.
3. The "state reconstruction, not chat continuity" phrase itself is a good rationale-articulation for docs/README explanation of why the kit does frozen-snapshot injection — not a new mechanism, just useful language.

## Reject candidates

1. **Weight-level "self-improving agent" framing** — marketing language; irrelevant, the kit never touches model weights and this was never in scope.
2. **Outcomes' isolated-grader-subagent + multi-agent orchestration** — interesting but off-target for a local single-agent CLI memory kit; no natural fit for a per-task "grader" concept here.
3. **The literal "100 transcripts" batch cap** — Anthropic's number reflects their cloud/token economics; the kit already has its own batching contract (per-batch durable units, ADR-0020) sized to local/session realities. Copying "100" specifically would be cargo-culting a number without justification.
4. **Vendor-lock-in warning** — inapplicable; the kit's defensible niche (per the existing 2026-06-04 note, citing D-27) is git-committed, portable markdown — the opposite of what this warning describes.

## Honest gaps

- **Images**: 1 image in the article (the header hero graphic). `WebFetch` could not render it (returned raw WebP binary as text, as expected — the tool converts HTML to markdown and cannot describe binary image content); however it saved the binary locally, and the `Read` tool then rendered it visually. It turned out to be an 8-panel composite infographic (dreaming cycle, before/after memory, "system architecture," results table, control modes, state-reconstruction comparison, worked example, "why it matters"). This graphic has no Anthropic branding markers and uses generic stock-icon styling — I judge it **likely the article author's own illustrative interpretation, not an official Anthropic diagram**, so its specific box labels (e.g. "Session Manager → Memory Store → Agent Orchestrator → Tools & Actions") are recorded here as the *article's* mental model, not confirmed Anthropic architecture. Read: 1, missed: 0.
- **Links**: followed 3 (cap was 5). (1) the header image URL — rendered via the Read-tool fallback described above; (2) `anthropic.com/news/claude-managed-agents` — guessed, 404'd, not the real URL; (3) `claude.com/blog/new-in-claude-managed-agents` — the actual official post, fetched successfully and used for verification above. Did not re-fetch `platform.claude.com/docs/en/managed-agents/dreams` (the deeper API docs) myself this session; relied on this repo's existing 2026-06-04 note, which already captured it, for the transcript-count/focus-instruction/partial-output details.
- **Unverified claims**: the Alex Albert quotes and the Pokémon Claude-3.5-vs-Opus-4 anecdote are recorded as "the article claims," not independently confirmed by me. The Harvey 6x / Wisedocs 50% figures are corroborated across multiple secondary sources but not located by me in the specific primary-blog text fetched.
- A stronger, more detailed primary-source note on this exact topic already exists in this repo (`docs/research/2026-06-04-anthropic-managed-agents-memory-and-dreams.md`) — this note should be read as a secondary confirmation plus a few new angles (playbook-as-output-type, the Pokémon anecdote, the infographic), not a replacement.
