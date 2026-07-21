# Primary-source verification: OpenAI Dreaming + Anthropic Dreams/Managed-Agents (the 4 previously-403'd pages)

**Date:** 2026-07-21 · **Source:** four locally-saved primary-source captures, read in full:

1. `<local-wiki>/raw/Dreaming Better memory for a more helpful ChatGPT.md` — capture of
   `openai.com/index/chatgpt-memory-dreaming/` (OpenAI's own announcement post, published
   2026-06-04 per its frontmatter).
2. `<local-wiki>/raw/Memory FAQ.md` — capture of
   `help.openai.com/en/articles/8590148-memory-faq` (OpenAI's memory help-center FAQ).
3. `<local-wiki>/raw/New in Claude Managed Agents dreaming, outcomes, and multiagent orchestration.md`
   — capture of `claude.com/blog/new-in-claude-managed-agents` (Anthropic's launch blog post),
   this time the **raw markdown clip**, not a model-summarized re-fetch.
4. `<local-wiki>/raw/claude-managed-agents-dreams.md` — capture of
   `platform.claude.com/docs/en/managed-agents/dreams` (Anthropic's Dreams API reference page).

This closes the 403-blocked gap left by the 2026-07-21 29-source research pass
(`docs/research/2026-07-21-*.md`) and its synthesis note
(`docs/research/2026-07-21-synthesis-dreaming-vs-s21.md`).

---

## Checklist A–G

### A. "100 sessions" / "~200-line index cap" / named phase list (Orient / Gather Signal / Consolidate / Prune & Index) — in either ANTHROPIC page?

**Verdict: MOSTLY ABSENT, with one important nuance on the number 100.**

- The **phrase "100 sessions"** does not appear verbatim, but the **numeral 100** does, in a
  *different semantic role* than the Tier-3 claim. Dreams docs: *"1 to 100 **sessions**: past
  transcripts Claude mines for patterns and insights to fold into the output."* and the Limits
  table: *"Sessions per dream | 100"*. This is a **hard cap on how many session IDs a caller may
  pass into one `POST /v1/dreams` call** — not a claim that the (unrelated, Claude-Code-specific)
  "Auto Dream" feature automatically reads "the last 100 sessions" on some rolling cadence. Same
  digit, different fact. The community-repo framing (grandamenium/dream-skill) that the earlier
  pass flagged as unverified Tier-3 is **still unverified** — nothing here confirms *that*
  specific claim.
- **"200-line" / any index-size cap in lines**: **ABSENT** from both pages. No mention of a
  200-line, 200-entry, or ~25 KB index anywhere in the blog post or the Dreams docs page.
- **Named phase list** (Orient / Gather Signal / Consolidate / Prune & Index, or any 4-phase
  breakdown): **ABSENT**. Neither page names any pipeline stages at all — the Dreams docs
  describe the process as a single opaque async job (`pending` → `running` → `completed`), with
  no phase/stage decomposition exposed anywhere in the public contract.

**This settles the pass's biggest open question**: the phase-name/200-line-index claims trace
**only** to the unofficial GitHub reimplementation, confirmed now by their **absence** from both
primary Anthropic sources actually fetched. The "100" figure is real but is a different claim
(per-call session cap) than the one those articles were laundering.

### B. OpenAI eval numbers — which are actually on the page?

**Verdict: ALL FIVE CONFIRMED**, drawn from the page's embedded SVG chart data + prose.

- Factual recall: 2024 → 2026 bar chart data-points are `41.5%`, `67.9%` (2025, the intermediate
  figure), `82.8%` (2026). Quote (chart `aria-label`s): `"Task success: 41.5; year: 2024"`,
  `"Task success: 67.9; year: 2025"`, `"Task success: 82.8; year: 2026"`.
- Preference adherence: 2024 `31.4%`, 2025 `55.3%`, 2026 `71.3%`. Quote: `"Task success: 31.4;
  year: 2024"` … `"Task success: 71.3; year: 2026"`.
- Staying-correct-over-time (freshness): 2024 `9.4%`, 2025 `52.2%`, 2026 `75.1%`. Quote:
  `"Task success: 9.4; year: 2024"` … `"Task success: 75.1; year: 2026"`.
- **Caveat on how the checklist paired them**: the `67.9%` intermediate belongs to the
  **factual-recall** chart's 2025 bar, not preference adherence (preference adherence's own 2025
  midpoint is `55.3%`, not `67.9%`). And `52.2%` is the freshness chart's **2025** value, not a
  2024 baseline — freshness's actual 2024 baseline is `9.4%`. The endpoints in the checklist
  (`41.5%→82.8%`, `31.4%→71.3%`, `52.2%→75.1%`) are each individually confirmed as real
  points-on-the-chart, just not all uniformly "2024→2026" pairs.
- "5x" / "factor of five" compute claim: **CONFIRMED verbatim**. *"Recent improvements reduced
  the compute required to serve dreaming to Free users by approximately 5x, making it possible to
  begin rolling out dreaming to Free users over the coming weeks and to increase memory capacity
  for Plus and Pro users."*

### C. OpenAI mechanism disclosure — trigger / schedule / batch size / model / dedup: disclosed vs undisclosed?

**Verdict: UNDISCLOSED across both pages — CONFIRMS the "internals are proprietary" framing (the primary is not more specific than The Decoder's characterization).**

- Trigger/schedule: only "a background process" (blog) / "updates memories automatically" (FAQ).
  No cadence (per-message, nightly, idle-triggered, etc.) is named anywhere.
- Batch size: not mentioned in either page.
- Model: not named in either page — no model identifier is tied to the dreaming/synthesis
  pipeline specifically (the blog's "Keep reading" footer links to an unrelated GPT-5.6 post, not
  a dreaming-model disclosure).
- Dedup/consolidation algorithm: not described. The FAQ's closest statement is *"ChatGPT keeping
  track of the details it determines are most important so it can continue building on the
  context you've already shared"* — outcome-level description, no mechanism.
- The only concrete engineering number disclosed anywhere is the "~5x compute reduction" claim
  (item B above) — a result, not a mechanism detail.

### D. Memory FAQ — system-prompt injection at inference? User controls named? Displayed-date-not-add-date claim?

- **System-prompt injection**: **PARTIALLY CONFIRMED, weaker phrasing than "system prompt."** The
  FAQ never uses the words "system prompt" or "context window." Its closest statement, under
  *saved memories* specifically: *"Like custom instructions, saved memories are part of the
  context ChatGPT uses to generate a response. Unless you delete them, saved memories are always
  considered in future responses."* This describes injection-into-context in substance but not in
  the specific "system prompt" terminology, and it's stated about the legacy "saved memories"
  system, not the new dreaming-based memory summary specifically.
- **User controls named** (all CONFIRMED, itemized):
  - Enable/disable memory entirely: Settings > Personalization > Memory.
  - View/edit the memory summary: free-text edit box, or highlight text in the summary "to make a
    specific correction."
  - Delete-and-turn-off: "Delete and turn off memory" from the three-dot menu (does not delete
    past chats; turning memory back on may recreate memories from chats still in history).
  - View sources: tap the book icon under a response to see what sources (custom instructions,
    past chats, files, memories) shaped it; tap a memory to see why it was used; 3-dot menu to
    correct it.
  - Refresh the memory summary on demand (triple-dot menu → "Refresh").
  - Revert to the legacy "saved memories" system (Settings > Memory > Saved memories), with a
    "Try improved memory" path back.
  - For saved memories specifically: add a memory by direct instruction ("Remember that I am
    vegetarian…"), delete individual memories, clear all, or use Temporary Chat to bypass memory
    entirely for one conversation.
  - Full deletion requires deleting the fact from **every** source it appears in (chats, archived
    chats, files, memory summary, connected apps) — the FAQ states memory alone isn't sufficient.
- **Displayed-dates-not-being-add-date claim**: **ABSENT.** The only date-related statement is
  that the memory summary page shows a last-updated timestamp ("2 hours ago") for the **summary
  as a whole**. There is no statement anywhere in the FAQ about individual memory items showing a
  misleading "date added" — that specific claim from the prior pass is not on this page.

### E. Anthropic Dreams API contract

- **Supported models**: **CONFIRMED**. *"During the research preview `claude-fable-5`,
  `claude-opus-4-8`, `claude-opus-4-7`, `claude-sonnet-5`, and `claude-sonnet-4-6` are
  supported."* — repeated identically in the Limits table.
- **Review-before-apply control**: **CONFIRMED**, one in each page. Blog: *"You decide how much
  control you want: dreaming can update memory automatically, or you can review changes before
  they land."* Docs page's mechanism for this is the output-store workflow itself: *"Review it
  with the Memory Stores API or in the Console, then either: Leverage it… or Discard it."* — i.e.
  the actual "review" primitive is whole-store adopt/discard, not a per-op gate.
- **Session range per dream (1–100)**: **CONFIRMED verbatim**. *"1 to 100 **sessions**: past
  transcripts Claude mines for patterns and insights to fold into the output."* Limits table:
  "Sessions per dream | 100".
- **Separate output store**: **CONFIRMED**. *"The dream produces another **output memory store**,
  separate from the input."* / *"The input store is never modified."*
- **Billing model**: **CONFIRMED**. *"Dreams are billed at standard API token rates for the model
  you select; `usage` on the resource reports the exact totals. Cost scales roughly linearly with
  the number and length of input sessions."*
- **Redact call / `redacted_at` field**: **ABSENT from this page.** The Dreams reference page
  (`.../managed-agents/dreams`) has no "redact" section, no `memver_...` version concept, and no
  `redacted_at` field anywhere in its JSON examples or prose. The synthesis note's claim about a
  redact op on non-head memory versions must come from the separate `/managed-agents/memory` page
  (Tier-1 sources fetched that page directly in the earlier pass) — **not one of the 4 files
  provided for this verification pass**, so it stays unverified by this check specifically (it
  was already primary-source-verified by the earlier pass's Tier-1 notes, per the synthesis doc —
  just not re-confirmed here).

### F. Harvey / "6x" mention in either Anthropic page?

**Verdict: CONFIRMED**, in the blog post's "What teams are building" section: *"[Harvey]
(https://www.harvey.ai/) uses Managed Agents to coordinate complex legal work like long-form
drafting and document creation. With dreaming, their agents remember what they learned between
sessions, including filetype workarounds and tool-specific patterns. **Completion rates went up
~6x in their tests.**"* — the still-unfetched Reuters article is unnecessary; the "6x" figure is
Anthropic's own primary-source claim, not a Reuters number.

### G. Anything contradicting the 2026-07-21 synthesis note?

**Verdict: NO CONTRADICTIONS FOUND.** Checked every claim in the synthesis's "What the evidence
actually shows" (a) and "Mechanism detail" sections against these 4 files:

- Input-never-modified / separate output store / adopt-or-discard whole-store /
  automatic-vs-review-gate / 1–100 sessions / 5 whitelisted models / `instructions` ≤4,096 chars
  as synthesis-only (imperative line-edits "generally produce no change") / billing scales with
  session count / no exposed pipeline stage boundaries / lifecycle states
  (`pending`/`running`/`completed`/`failed`/`canceled`) / partial output retained on
  failure-or-cancel with no stated auto-resume — **all CONFIRMED, matching the synthesis's
  "Mechanism detail" block essentially verbatim.**
- Several synthesis claims are **not checkable against these 4 files** because they describe
  content that lives on the `/managed-agents/memory` page, which was not one of the 4 provided
  captures: the `memver_...` immutable-version model, 30-day retention, the redact endpoint, the
  100 KB/memory + 2,000 memories/store + 8 stores/session caps, the "trigger a dream near the
  2,000-memory cap" best-practice, and the prompt-injection-into-memory-store warning. None of
  these are contradicted — they are simply out of scope for the 4 files read in this pass, and
  the synthesis note already sourced them from Tier-1 notes that fetched that separate page
  directly.
- One thing worth flagging as a **precision gap in the synthesis**, not a contradiction: the
  synthesis's mechanism-detail block writes `session_ids:[1..100]` as if the *sessions input*
  itself is bounded 1–100 inline in the request; the actual doc phrasing is "1 to 100 sessions"
  in prose plus a separate Limits-table line "Sessions per dream: 100" — consistent in substance,
  just worth citing the two separate spots rather than treating it as one field-level bound.
- No source in these 4 files disputes any REJECT or CONFIRM verdict in the synthesis's section
  (b)/(c)/(d). No source here even discusses graph memory (ADR-0023) — orthogonal, as the
  synthesis already noted.

---

## What this settles / what stays open

**Upgraded to primary-verified by this pass:**

- The "100 sessions" figure IS real and IS in Anthropic's own docs — but as a **per-dream-call
  input cap** (`session_ids` array, max 100), not as the community-repo's "reads the last 100
  sessions automatically" cadence claim. Any future kit doc citing "100" for Dreams must use this
  framing, not the Tier-3 one. (Was Tier-3-unverified per `2026-07-21-dreaming-ai-part1.md`/
  `part2`; the *number* is now Tier-1, the *semantics* attributed to it in Tier-3 sources remain
  unverified.)
- The 5 whitelisted models, the 1–100 session range, the ≤4,096-char `instructions` field and its
  synthesis-only (not line-editor) behavior, the whole-store adopt-or-discard review mechanic, the
  never-modified input store, and the token-rate billing model are now directly quote-verified
  from `claude-managed-agents-dreams.md` (previously relied on Tier-1 *notes'* paraphrase of the
  same page).
- The automatic-vs-review-gate control surface is now verified from the **raw** blog markdown
  (previously only a model-summarized WebFetch), matching the earlier paraphrase exactly.
- Harvey's "~6x" completion-rate claim is now a direct Anthropic primary-source quote — the
  planned Reuters cross-check for this specific number is no longer necessary.
- OpenAI's 5 headline eval numbers (41.5/67.9/82.8 factual recall; 31.4/55.3/71.3 preference
  adherence; 9.4/52.2/75.1 freshness) and the "~5x" compute-reduction claim are now directly
  quote-verified from the OpenAI announcement page itself, not a secondary summary.
- OpenAI's Memory FAQ user-controls list (enable/disable, summary edit, delete-and-turn-off,
  sources view, refresh, legacy-system revert, Temporary Chat) is now a complete primary-source
  enumeration.

**Killed by this pass:**

- The claimed ~200-line (or any line-count) index-size cap, attributed to Anthropic: **not in
  either Anthropic primary page.** Stays sourced only to the unofficial `grandamenium/dream-skill`
  reimplementation (`docs/research/2026-07-21-dreaming-ai-part1.md` /
  `2026-07-21-dreaming-ai-part2-built-a-brain.md`) — should not be cited as an Anthropic-documented
  number in any kit doc.
- The named 4-phase pipeline (Orient / Gather Signal / Consolidate / Prune & Index, or the
  reworded Orient / Extract patterns / Restructure / Update index variant): **not in either
  Anthropic primary page.** Same disposition as above — Tier-3-only, community-reconstructed, not
  an Anthropic-documented mechanism. `design.md` §21 should continue to avoid implying phase
  parity with a documented Anthropic pipeline, since no such public phase breakdown exists to be
  parallel to.
- The Decoder's "dreaming internals are proprietary" framing for OpenAI's system: **the primary
  source does not contradict this** — mechanism (trigger/schedule/batch/model/dedup) remains
  genuinely undisclosed on both OpenAI pages checked.

**Remains unverified (not resolved by this pass, and where the open question lives):**

- The `memver_...` immutable-version model, 30-day retention window, the redact endpoint and its
  response shape (`redacted_at` or otherwise), the 100 KB/memory + 2,000 memories/store + 8
  stores/session caps, the "trigger near the 2,000-memory cap" best practice, and Anthropic's
  prompt-injection-into-memory-store warning — all live on the `/managed-agents/memory` page, not
  one of the 4 files read here. Per the synthesis note, these were already independently verified
  by two Tier-1 notes (`2026-07-21-anthropic-dreaming-markdown-rewriter-lockin.md`,
  `2026-07-21-claude-dreaming-memory-debt-critique.md`) that fetched that page directly — this
  pass did not re-check it and has no reason to doubt those notes, but cannot itself confirm them.
- Whether "Auto Dream" (the Claude-Code-specific, unreleased feature the community repo
  reimplements) and "Dreams" (the Managed-Agents API verified here) are definitively two separate
  product surfaces, or the same feature described inconsistently across sources — still an
  inference, not a confirmed Anthropic statement, per the synthesis note's own "Honest gaps"
  section. Nothing in these 4 files resolves this either way; the Dreams docs page never mentions
  "Claude Code" or an "Auto Dream" name at all.
