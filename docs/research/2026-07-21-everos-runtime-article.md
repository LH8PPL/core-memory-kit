# EverOS — Markdown-First Agent Memory Runtime (MarkTechPost article + primary-source follow-up)

**Date:** 2026-07-21
**Source:** `<local-wiki>/raw/Meet EverOS An Open Source Markdown-First Agent Memory Runtime With Hybrid BM25 + Vector Retrieval and Self-Evolving Skills.md` (MarkTechPost, published 2026-06-29, byline Asif Razzaq) + primary-source follow-up: `github.com/EverMind-AI/EverOS` (repo metadata via `gh api`), `evermind.ai/everos` (product page), and three files fetched raw from the repo's `main` branch: `README.md`, `docs/how-memory-works.md`, `docs/architecture.md`, `docs/engineering.md`.

## What it claims

The article (a product-announcement piece, not an independent evaluation) claims EverOS is an Apache-2.0 open-source memory runtime for AI agents that: stores all memory as plain, human-editable Markdown (SQLite + LanceDB are rebuildable indexes, not the source of truth); does hybrid retrieval (BM25 + dense vector + scalar filtering) in one query, scoped by `user_id`/`agent_id`/`app_id`/`project_id`/`session_id`; separates "user-side" memory (Profile, Episode, Fact, Foresight) from "agent-side" memory (Case, Skill); "self-evolves" by distilling repeated successful agent trajectories (Cases) into reusable Skills, offline, with no manual curation; and added a v1.1.0 "Reflection" process that merges episode clusters and refines profiles/skills between sessions. It reports EverMind-self-benchmarked scores: 93.05% LoCoMo, 83.00% LongMemEval, 93.04% HaluMem, sub-500ms p95 retrieval latency — the article itself flags these as EverMind-reported and unverified.

## What the evidence actually shows

The repo is real and active: Apache-2.0, created 2025-10-28, last push 2026-07-20 (the day before this note), 11,386 stargazers at time of check — a young repo with unusually fast adoption, worth noting but not something I independently corroborated beyond the GitHub API count. The three-piece storage stack (Markdown / SQLite / LanceDB), the hybrid hint (`"single LanceDB query = BM25 + vector ANN + scalar filter"`), the five scoping identifiers, and the two-step `add`→`flush` demo all check out against the primary docs — the article's TL;DR is accurate as far as it goes. But the article (and even EverOS's own marketing page at evermind.ai/everos) states these as capability bullets with **no mechanism** — the actual "how" (schemas, thresholds, schedules, formulas) lives only in the repo's `docs/` tree, and even there several load-bearing details are genuinely undocumented as of this read (see Honest gaps). The benchmark numbers could not be verified against any third-party source — I did not find or attempt an independent LoCoMo/LongMemEval run; they are recorded here as claimed, not confirmed.

## Mechanism detail (the HOW)

**Directory layout** (`docs/how-memory-works.md`, memory root `~/.everos/` or `$EVEROS_ROOT`, partitioned `<app_id>/<project_id>`):

```
~/.everos/<app_id>/<project_id>/
├── users/<user_id>/
│   ├── user.md                                  # Profile — single-file rewrite
│   ├── episodes/episode-<YYYY-MM-DD>.md         # daily-log append
│   ├── .atomic_facts/atomic_fact-<YYYY-MM-DD>.md
│   └── .foresights/foresight-<YYYY-MM-DD>.md
├── agents/<agent_id>/
│   ├── .cases/agent_case-<YYYY-MM-DD>.md
│   └── skills/skill_<name>/SKILL.md             # one directory per skill
└── knowledge/<category_id>/<title_dirname>/
```

Three named storage strategies: **daily-log append** (many entries coalesce into one file per calendar day — episodes, atomic facts, foresights, cases), **single-file rewrite** (`user.md` overwritten in place), **skill-named directory** (`skills/skill_<name>/SKILL.md` + optional `references/`/`scripts/`). Markdown is explicitly the source of truth; deleting the `.index/` directory causes no data loss because both indexes rebuild from `.md` files.

**Storage stack, three layers**, all except Markdown rebuildable:
- Markdown + YAML frontmatter — human-editable, canonical.
- SQLite (`aiosqlite`), split into three DBs: `system.db` (state, audit log, cascade queue `md_change_state` table, an LSN watermark), `ome.db` (Offline Memory Engine run state/counters), `ome.aps.db` (APScheduler jobstore — split out specifically "to avoid lock contention").
- LanceDB (Arrow-backed) — vector + BM25 + scalar columns for retrieval.

**Extraction pipeline** (ASCII reconstruction from `how-memory-works.md`):

```
POST /add  →  unprocessed_buffer (SQLite, keyed per session/app/project)
                ↓
  [boundary detection]  OR  [POST /flush forces it]
                ↓
  LLM extracts a "MemCell"  →  memcell row (SQLite)
                ↓
  ┌─ UserMemoryPipeline (SYNC) ────────┐   ┌─ AgentMemoryPipeline (ASYNC) ─┐
  │ writes episode .md NOW,            │   │ emits AgentPipelineStarted;   │
  │ response only returns after this   │   │ OME writes derived .md later: │
  └─────────────────────────────────────┘   │ atomic facts, foresight,     │
                                             │ profile, agent cases, skills │
                                             └────────────┬──────────────────┘
                                                           ↓
                                     Cascade daemon watches the .md tree
                                                           ↓
                                     md_change_state queue (SQLite, durable)
                                                           ↓
                                     Rebuild affected LanceDB rows → searchable
```

Only the **episode** markdown write is synchronous / on the request's critical path; everything else (atomic facts, profile, agent cases, agent skills) is produced asynchronously by the **Offline Memory Engine (OME)**.

**Cascade daemon (index sync)** — runs **in-process**, not a separate OS daemon: a filesystem watcher (`watchdog`; FSEvents on macOS, inotify on Linux) detects any `.md` create/modify → the change is enqueued in `md_change_state` (SQLite, durable — survives a crash) → a worker drains the queue at **entry-level granularity**: it diffs the file and re-embeds only the entries whose `content_sha256` changed, then upserts just those LanceDB rows. Direct edits in an external editor (VSCode/Obsidian/Vim) are fully supported and trigger the same fine-grained re-index ("the daemon re-indexes just that entry").

**OME strategies** (configurable per-strategy via `ome.toml` at the memory root, hot-reloaded roughly every 2 seconds): `extract_atomic_facts`, `extract_foresight`, `extract_user_profile`, `extract_agent_case` (skipped by design when a trajectory isn't "substantive enough"), `extract_agent_skill` (clusters related Cases into one named Skill — the Case→Skill distillation step), `trigger_profile_clustering`, `trigger_skill_clustering`, and `reflect_episodes`.

**Reflection = the `reflect_episodes` strategy** — the article's "self-evolving" / "between sessions" claim, concretely: cron-scheduled, default `0 2 * * 1` (Monday 02:00), **disabled by default**. Steps as documented: (1) select episode clusters that have multiple members; (2) an LLM merges the cluster into one narrative; (3) the merged episode is written to markdown; (4) atomic facts are re-extracted from the merged text; (5) the original episodes are marked `deprecated_by` (a frontmatter pointer to the merge — not deleted); (6) the merged episode carries `parent_type=cluster` and `session_id=None`. Enabling it is a one-line `ome.toml` flip. **No review/approval gate is documented anywhere in the fetched docs** — as written, Reflection appears to write its merged output directly, not stage it for human or programmatic review.

**Consistency model:** writes are strong (episode `.md` is on disk before the `/flush` response returns; the write path never blocks on LanceDB); reads are eventual (search reads LanceDB, which lags the markdown by cascade-processing time — "sub-second typically, up to ~10-15s under load"). **Integrity anchors:** a frontmatter `id`/`entry_id` is the immutable join key between the markdown and the index rows; `content_sha256` decides whether an entry needs re-embedding; an LSN watermark in `system.db` orders rebuilds; the durable `md_change_state` queue doubles as a replayable audit trail. Documented explicitly: **there is no markdown-grep fallback** if the LanceDB index is unavailable — the only recovery path is rebuilding the index from markdown (no `everos reindex` command exists; the documented recovery is `rm -rf <root>/.index/lancedb` + restart).

From the product page (`evermind.ai/everos`, WebFetch-summarized, not directly quotable at the byte level): the self-evolution flow is drawn as **Agent (online execution) → Case (execution trajectories) → Distillation (offline consolidation) → Skill Memories (skill self-evolution)**, and memory auto-categorizes into "Profile, Episodic, or Skill — with no manual curation."

## Relevance to core-memory-kit

**graph_relevance: none.** EverOS's retrieval is flat: one hybrid BM25+vector+scalar LanceDB query, scoped by five flat identifiers (`user_id`/`agent_id`/`app_id`/`project_id`/`session_id`). No graph/traversal query mode, no edge model, and no mention of anything resembling Task 232 / ADR-0023's link/`superseded_by` edge-activation work is documented anywhere I could fetch (README, how-memory-works.md, architecture.md). The Case→Skill "clustering" is an aggregation/collapse operation (many Cases → one Skill file), not an exposed, queryable graph edge — it doesn't inform Task 232.

**task95_relevance: weak-to-moderate — a real but partial analog, useful mainly as a contrast case, not a template.** EverOS's `reflect_episodes` strategy is the closest thing in this article to our design.md §21 dream re-curation engine: it is offline, scheduled (cron, weekly by default, currently *disabled* by default), reads across multiple raw records (episode clusters), and writes a **non-destructive** result — the source episodes are marked `deprecated_by`, not deleted, which echoes our own archive-not-delete posture (§21.6: "No DELETE op exists"). The `deprecated_by` field is a clean small confirmation of the same idea our `superseded_by` foreign key already implements. But the documented mechanism **diverges from our settled D-352 op-class split** in one load-bearing way: as written, Reflection appears to auto-apply its LLM-generated merge (rewrite + re-extract + deprecate) with **no review-queue step** — nothing in `how-memory-works.md` or `architecture.md` describes a human-in-the-loop or reviewable-diff stage analogous to our `context/queues/recuration.md` QUEUE class for lossy/generative merges (§21.2 step 3). If this is accurate (I could not fetch `docs/how-memory-works.md`'s sibling `storage_layout.md`, nor the actual `orchestrator.py` code, to confirm there's truly no gate), it's a genuine design difference worth naming explicitly rather than borrowing quietly: our §21.6 anti-scope line ("no in-entry trail-lossy merges … no unscreened raw-verbatim to the LLM") is a deliberate, already-settled rejection of exactly the auto-apply shape EverOS's docs describe. Distillation (Case→Skill) is explicitly **out of Task 95's scope** (§21.6 forbids new-skill/trail-lossy merges) — it's a closer cousin to Task 177 (correction-trained behavior doc), Task 151 (persona promotion), and Task 180 (memory→skill synthesis), all visible in `specs/tasks.md`.

**Tasks 233/161/203 (context-compaction) — convergent-design confirmation, no new mechanism.** The "daily-log append" strategy (many entries → one file per calendar day) is structurally identical to our `today-<date>.md` day-file shape (Task 203's daily-distill). The cascade daemon's `content_sha256`-keyed, entry-level selective re-embedding (only touch what actually changed, not the whole file) is the same "bound the work to what changed" instinct behind ADR-0020's resumability contract, applied to index maintenance rather than a long batch job — worth checking our own reindex/self-heal path against this granularity if it currently re-embeds whole files, but this is a convergence observation, not something I verified as superior; per this project's own verification discipline, convergence across one third-party implementation is not evidence the approach is right, only that someone else also arrived there.

## Borrow candidates

- **`deprecated_by`-style explicit pointer on a merged-away record** — reinforces (doesn't add to) our existing `superseded_by` pattern; useful as an external confirmation the naming/shape is sound.
- **Entry-level, hash-keyed selective re-indexing** (`content_sha256` per entry, not per file) — worth a deliberate comparison against however our own reindex path currently scopes its work, as a possible sharpening, not an assumed gap.
- **Per-strategy hot-reloadable config toggle** (`ome.toml`, ~2s reload, one strategy enabled/disabled at a time) — a clean pattern for letting an operator turn off a costly LLM-driven extraction strategy without a restart; worth comparing to however we currently gate optional/costly passes.
- **The three-way storage-strategy vocabulary** (daily-log append / single-file rewrite / named-directory) as a naming device — could sharpen glossary.md's description of our own tiers (scratchpad ≈ single-file-rewrite-ish, `today-*.md` ≈ daily-log-append, `context/memory/<fact>.md` ≈ one-file-per-record) even though the tiers themselves are unchanged.

## Reject candidates

- **Reflection's apparent no-review auto-apply merge**, as documented — conflicts directly with our already-settled §21.2 QUEUE class requirement for lossy/generative merges and §21.6's anti-scope line. Do not adopt the auto-apply shape even as a starting point; if anything it's a useful "here's the thing we deliberately didn't build" reference point in a future write-up.
- **LanceDB as a fourth storage engine** — EverOS's own rationale for it (hybrid BM25+vector+scalar in one engine call) is real, but we already have FTS5 + sqlite-vec covering the same ground without adding an Arrow-backed dependency; adopting LanceDB would be redundant infrastructure against our own "no managed services, minimal stack" posture, not a genuine capability gap.
- **Case→Skill distillation as a Task-95 mechanism** — explicitly out of scope per §21.6; it belongs (if anywhere) to Task 177/151/180, not the fact re-curation engine.

## Honest gaps

- **Images: 0 read, 0 missed.** The clipped article markdown contains zero `![...]` image links (verified via grep) — there was nothing to fetch. I did not check the live marktechpost.com page itself (only the local clipping was in scope), so I cannot say whether the original page had architecture diagrams that the clipping tool stripped.
- **Benchmark numbers unverified.** 93.05% LoCoMo / 83.00% LongMemEval / 93.04% HaluMem / sub-500ms p95 are recorded as EverMind's own claim, per the article's own caveat. I did not locate or attempt an independent verification.
- **LanceDB hybrid retrieval formula is genuinely undocumented** in every doc I could fetch (README, how-memory-works.md, architecture.md all confirm only the one-line description "BM25 + vector ANN + scalar filter" with no weighting, reranking, or threshold detail). Not stated as fact anywhere I could reach — may exist in `storage_layout.md` or the source code itself, neither of which I fetched (link budget of 5 was used on evermind.ai/everos, README.md, how-memory-works.md, architecture.md, engineering.md).
- **Case and Skill exact data schemas** (field-by-field) are not documented in any file I fetched; architecture.md explicitly states they're listed only as named "business kinds" with no structure given.
- **Case→Skill promotion thresholds** (how many repeated successful Cases trigger a Skill) are not documented; `architecture.md` explicitly confirms zero thresholds/counts are given anywhere in that file.
- **Deletion, pruning, TTL, or decay behavior** — explicitly absent from README, how-memory-works.md, and architecture.md (all three were asked and all three came back empty on this point). I cannot say whether EverOS has any forgetting mechanism at all.
- **I did not clone or read the EverOS source code.** All mechanism detail above comes from WebFetch's LLM-mediated summarization of the docs' raw markdown, not from reading the files myself byte-for-byte or reading the actual Python. Quoted fragments are as extracted by that summarization step; treat short quotes as high-confidence but not independently re-verified against the raw file bytes.
- `docs/engineering.md` (fetched as a candidate 5th link before `architecture.md` was chosen instead — see below) turned out to be a contributor CI/tooling doc with no memory-mechanism content; it is not a useful reject, just a dead end noted for completeness. Link budget used: `evermind.ai/everos`, `README.md`, `docs/how-memory-works.md`, `docs/engineering.md`, `docs/architecture.md` (5 of 5).
