# ECC (`affaan-m/ecc`) vs core-memory-kit — a code-level comparison

**Date:** 2026-07-20 · **Method:** shallow clone (`--depth 50`) at `v2.0.0`, read at CODE level per the D-153 discipline (docs claim, code ships) · **Trigger:** the user asked how the kit stacks up against ECC before continuing the v0.6.0 lane.

> **Verification posture.** Every claim below is anchored to a file:line in the clone. Where a documented feature has no implementation, that is stated explicitly with what was searched. One claim in the first pass of this study was made from an architecture diagram rather than code and was **wrong** — it is corrected in §6 and kept visible per the decision-trail rule.

---

## 1. What ECC actually is

**Not a memory system.** ECC is an *agent harness operating system*: a catalog of skills/agents/commands plus lifecycle hooks, install surfaces, and an operator control plane, spanning ~12 agent harnesses (Claude Code, Codex, Cursor, Gemini, Zed, OpenCode, Copilot, …).

| Dimension | ECC v2.0.0 | core-memory-kit v0.6.0-dev |
| --- | --- | --- |
| Category | Harness OS / operator platform | Per-project memory system |
| Catalog | 278 skill dirs · 67 agent md · 94 command md | 40 CLI verbs · 12 MCP tools · 2 skills |
| Harnesses | ~12 | 4 (Claude Code, Kiro, Cursor, Codex) |
| Tests | 190 test files | 187 test files |
| Structural validators | `catalog:check`, `command-registry:check`, `harness:audit`, unicode-safety, IOC scan | 21 `validate-*.mjs` |
| Distribution | 2 npm packages, GitHub App, paid Pro tier, Discord, 12 doc languages | 1 npm package + plugin |
| Contributors | 230+ | 1 |

Memory is **one subsystem inside** ECC, and it is the subsystem they have invested in least.

---

## 2. ECC's memory architecture (verified)

Three disconnected stores, none of which is a durable project fact store.

### 2.1 Session summaries — the only thing auto-recalled

- **Write:** `scripts/hooks/session-end.js` (Stop hook, fires per response). Mechanical extraction (last 10 user messages @200 chars, ≤20 tool names, ≤30 edited paths) plus an **LLM summary** (`scripts/lib/llm-summary.js:112-150`, `claude -p`) triggered only when context remaining <20% **or** every 50th user message.
- **Storage:** `~/.claude/session-data/{YYYY-MM-DD}-{shortId}-session.tmp` (`session-end.js:207`, `utils.js:56-58`) — markdown despite the `.tmp` extension, written between `<!-- ECC:SUMMARY:START/END -->` markers, idempotently replaced each turn.
- **Machine-local, never committed, NOT per-project.** One global directory; project scoping is *retrieval-side only* (`selectMatchingSession`, `session-start.js:643`, matches a `**Project:**` header against cwd).
- **Read:** `session-start.js:575-741` assembles ≤**8000 chars** of `additionalContext`: best-matching prior summary (≤7 days old) + ≤6 instincts above 0.7 confidence + ≤6 learned-skill blurbs + project-type JSON. Startup mode only; 30-day prune.
- **`pre-compact.js`** regenerates the summary into the same file at the compaction boundary — the highest-value moment, and a hook event **we do not currently use**.

### 2.2 Instincts — atomic learned behaviors (`skills/continuous-learning-v2/`)

Real and substantial: a 78KB `instinct-cli.py`, a 23KB `observe.sh`, an LLM observer agent.

- **Pipeline:** PreToolUse/PostToolUse hooks → per-project-hash `observations.jsonl` → background Haiku observer → atomic instinct YAML (`id`, `trigger`, `confidence`, `domain`, `scope`) → `/evolve` clusters → `/promote` project→global (gate: 2+ projects, avg confidence ≥0.8).
- **Storage:** `${XDG_DATA_HOME}/ecc-homunculus/projects/<hash>/` — machine-local, but genuinely **per-project** (project id = hash of git remote URL, so it is portable across machines for the same repo). Nice touch.
- **Secret scrubbing exists** (`observe.sh:271-292, 339-354`): keyword-anchored regex (`api_key|token|secret|password|authorization|credentials|auth`) with bounded quantifiers + an 8s SIGALRM self-kill, added after a catastrophic-backtracking CPU peg (their #2278).
- **Retention:** 10MB rotation → `observations.archive/` → **deleted** after 30 days (`observe.sh:201-209`). Archived observations are *purged, never distilled*.

### 2.3 State store + context graph — not memory, not wired to recall

- `scripts/lib/state-store/` (sql.js → `~/.claude/ecc/state.db`): 8 tables — `sessions`, `skill_runs`, `skill_versions`, `decisions`, `install_state`, `governance_events`, `work_items`. This is a **dashboard/control-plane backend** (`queries.js:736-778` `getStatus()` returns readiness counts, success rates, blocked items).
- The `decisions` table (`migrations.js:61-72`) is the one knowledge-shaped surface, with `title/rationale/alternatives/supersedes/status`. But it is **session-scoped** (`ON DELETE CASCADE`, line 70) — delete the session, the decisions vanish — and it is written by *release/operator tooling*, not the memory loop. The "Decisions Made" in session summaries is an unrelated **markdown heading** in an LLM prompt (`llm-summary.js:139`).
- `ecc2/` (Rust, separate `~/.claude/ecc2.db`) has a context graph (`context_graph_entities/_relations/_observations`) with an `ecc graph recall "<query>"` verb. Ranking is a **substring scan** (`store.rs:2967-3040`) over an `updated_at`-ordered candidate window — no index, no IR ranking. **Not wired into any session hook**: nothing it stores is ever automatically recalled.

---

## 3. Memory-primitive scorecard

| Primitive | ECC | core-memory-kit |
| --- | --- | --- |
| Durable atomic fact files | **NO** — searched `scripts/ src/ ecc2/ skills/`; nearest analogues are transient session `.tmp`, purged `observations.jsonl`, behavioral instinct YAML | YES — `context/memory/<type>_<slug>.md`, committed |
| Search over knowledge | **NO FTS, NO embeddings** (searched `fts5|MATCH|bm25|embedding|cosine|vector`); only a substring `includes()` scan in an unwired CLI | YES — FTS5 + embeddings + hybrid RRF |
| Citations / provenance-back-to-source | **NO** — recall output cannot cite where a claim came from | YES — id, source file, date, heading path |
| Dedup of facts | **NO** — searched `dedup|contentHash|fingerprint`; all hits are other domains | YES — content-hash dedup |
| Conflict detection | **NO** — every `conflict` hit is agent-coordination or SQL `ON CONFLICT` upsert (last-write-wins, the *opposite* of detection) | YES — conflict queue |
| Tombstones / forget | **NO** — hard `DELETE`/cascade/`mv`; no retraction record survives | YES — tombstones + `cmk forget` |
| Trust that CHANGES over time | **NO** — confidence set at authoring/import only | YES — Task 194 survival gate |
| Committed / team-shared | **NO** — everything under `~/` | YES — `context/` travels with `git clone` |

**Every ECC retention mechanism is time-based expiry** (30-day session prune, 30-day observation purge, 10MB rotation). Nothing graduates, condenses, or is cited. *It forgets on a timer rather than curating.*

---

## 4. The confidence gap (their documented-vs-shipped miss)

`skills/continuous-learning-v2/SKILL.md:318-327` documents:

> **Confidence increases** when: pattern is repeatedly observed / user doesn't correct… **Confidence decreases** when: user explicitly corrects the behavior / pattern isn't observed for extended periods / contradicting evidence appears.

**Not implemented.** `instinct-cli.py` references `confidence` **55 times** — reading, filtering (`>= min_conf`), sorting, averaging for promotion — and **never writes an updated value**. It is assigned once at creation by the LLM observer from raw frequency (`agents/observer-loop.sh:174`: `3-5 times=0.5, 6-10=0.7, 11+=0.85`), then reconciled on import by max-wins (`:945`) or defaulted to 0.5 when malformed (`:546`).

The irony is instructive: `skill_runs` sits in their state DB recording exactly the success/failure signal a trust loop would consume, and nothing reads it back.

---

## 5. What we should take from them

Ranked by fit. None of these are memory features — their strength is **operations**.

1. **Stale-replay guard (highest value, cheap).** `session-start.js:651-671` wraps injected prior-session context in `HISTORICAL REFERENCE ONLY — NOT LIVE INSTRUCTIONS`, declaring task descriptions and slash-command `ARGUMENTS=` payloads stale-by-default, to be verified against git/working-tree state before any action. Added after a production bug (their #1534) where post-compaction the model re-ran an ARGUMENTS-bearing slash command with stale arguments, duplicating issues/branches/Notion tasks.
   **Our exposure is worse than theirs was:** `AUTHORITATIVE_MEMORY_PREAMBLE` (`inject-context.mjs:238-249`) says "injected memory wins" and "lead with memory" with **no line between durable recorded knowledge and stale work-state**. Our own snapshots carry `Active Threads` bullets naming shipped tasks and completed user actions. → captured as `P-RYN7KWJJ`.
2. **A `PreCompact` hook.** They capture at the compaction boundary; we only compress at SessionEnd. The boundary is where context is about to be lost — the highest-value capture moment.
3. **Catalog/registry CI gates** (`catalog:check`, `command-registry:check`) — independent validation of the Task 186 approach: assert the shipped catalog matches the tree.
4. **Supply-chain posture** — SLSA3 provenance publishing, `supply-chain-watch.yml`, and `scripts/ci/scan-supply-chain-iocs.js` (a curated blocklist of known-compromised package@versions scanned against lockfiles *and AI-tool configs*). High maintenance cost; the **watch workflow** is the cheap part worth copying, the hardcoded IOC list is not.
5. **Agent-proximity collision avoidance** (`scripts/lib/agent-proximity/`) — genuinely novel prior art, unrelated to memory: a TCAS-style advisory steering two concurrent agents off the same files via edit-overlap (Szymkiewicz–Simpson over line ranges) + dependency-graph coupling (BFS with γ-decay) + tree proximity, combined by noisy-OR. Relevant only if we ever support parallel agents on one repo. *(Note: its "vector-space view" comment is a red herring — coordinates are deterministic path-segment hashes, not semantic embeddings.)*

**What we should NOT take:** their memory design. It is thinner than ours in every primitive that matters.

---

## 6. Correction (decision-trail preservation)

**Original claim (first pass, 2026-07-20):** "their instinct evolution pipeline is essentially our Task 95 dream re-curation engine, already shipped."

**Corrected, same day, after the user challenged it:** ECC ships the **generation half only** (observe → instinct → cluster → promote). The **re-curation half is absent** — confidence never updates from outcomes, `skill_runs` is never read back, archived observations are deleted rather than distilled. Task 95's hard part (revisiting and re-scoring existing memory against later evidence) is **unbuilt in ECC too**.

**Why the error matters:** the claim was decided from their SKILL.md architecture diagram, not verified in code — the exact docs-claim-vs-code-ships error this study was auditing *them* for, committed while auditing them for it. Cite ECC as prior art for instinct extraction/clustering/promotion only. → captured as `P-ENJNBQ7N`.

---

## 7. Bottom line

ECC and core-memory-kit are **not competitors in the same category**. ECC competes on *breadth* (harness coverage, catalog size, distribution, community); the kit competes on *memory depth*.

- ECC's memory is a **rolling 7–30 day machine-local window** of LLM-written session summaries plus per-project behavioral instincts. Team members share nothing; nothing is searchable; nothing is cited; nothing survives its timer.
- The kit's memory is a **committed, searchable, cited, conflict-aware, trust-evolving fact store** that travels with the repo.

Where ECC is genuinely ahead — multi-harness breadth, release/supply-chain rigor, operator tooling, community — the gaps are addressable and mostly non-memory. Where we are ahead, we are ahead by an architecture generation, and the field's most-cited "learning" project turning out to never update its own confidence scores is evidence that outcome-driven re-curation (our Tasks 95 and 194) remains genuinely unsolved territory rather than catch-up work.
