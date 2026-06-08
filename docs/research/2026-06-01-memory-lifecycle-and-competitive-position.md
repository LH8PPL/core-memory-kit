---
date: 2026-06-01
topic: "Memory lifecycle (what happens to memory over time) + competitive position + the niche wedge + Layer 5 deep-research brief"
status: complete
informed_sections: [design.md §7 (rolling-window), design.md §16.18 (temporal validity), tasks.md "Road to 1.0", DECISION-LOG D-24..27, tasks.md Task 65.0/66]
tags:
  - memory-lifecycle
  - two-track-model
  - competitive-analysis
  - the-wedge
  - video-parity
  - layer-5-semantic-recall
  - deep-research-brief
---

# Memory lifecycle + competitive position + Layer 5 deep-research brief (consolidated)

## Why this doc

2026-06-01, the user asked three questions in sequence that all point at the same thing — *is this a real product, and what makes it worth someone's time*:

1. *"What do we do with memory history? what happens after a few days / a week / a month / a year?"*
2. *"How do we do weekly-curate? daily? do we create daily files and keep MEMORY.md minimal with links to other days? what is the solution here?"*
3. *"When I give it to somebody I want him to be excited as me, and I am not excited at all."*

This note is the **single durable answer** so we never re-derive it: the lifecycle model we actually built, how every other memory system ages memory, where we genuinely stand competitively, the niche wedge, and the decision-grade deep-research brief for the one true gap (Layer 5 semantic recall). Strategic decisions live in [DECISION-LOG D-24..27](../journey/DECISION-LOG.md); the roadmap lives in [tasks.md "Road to 1.0"](../../specs/tasks.md). This is the **history / research** backing.

## 1. The lifecycle: two parallel tracks (the answer to "what happens over time")

Memory splits into a **time-ordered diary** (what happened when) and a **durable fact store** (what's true). They age completely differently — that's the whole trick.

### Track A — the session diary (progressive compression; nothing deleted)

```
sessions/now.md          ← live buffer; hooks append all session
   │  SessionEnd: Haiku compresses now.md → today-{date}.md, truncates now.md
   ▼
sessions/today-2026-06-01.md   ← ONE compressed file per day
   │  Daily cron (23:00): re-compress last 7 days of today-*.md → recent.md
   ▼
sessions/recent.md       ← rolling 7-day window
   │  Weekly cron (Sun 09:00): today-*.md older than 7d → archive.md (compressed, deduped, grouped by week)
   ▼
sessions/archive.md      ← append-only, forever, heavily compressed
```

A day's raw work gets denser as it ages: `now → today-X → recent (7d) → archive (forever)`. A year out, last March is two bullets in `archive.md`, not 200 lines. (Design §7; verified built in [`weekly-curate.mjs`](../../packages/cli/src/weekly-curate.mjs) + [`daily-distill.mjs`](../../packages/cli/src/daily-distill.mjs).)

### Track B — the durable facts (where "MEMORY.md stays minimal" comes from)

```
MEMORY.md                ← HOT working set, byte-capped, stays small
context/memory/*.md      ← one typed fact per file (permanent brain), INDEX.md ties them
```

`MEMORY.md` stays small via **three mechanisms together**: (1) byte cap → consolidates at >95%; (2) stale-drop → bullets >14d old with no recent reference fall off; (3) **graduation** → durable facts move *out* into granular fact files, day-to-day churn moves *out* into the diary. MEMORY.md is the **hot index**, not the archive.

### the user's instinct vs the design

His *"daily files + keep MEMORY.md minimal with links to other days"* **is the architecture**, with one refinement: MEMORY.md holds **facts**, and the durable ones graduate to **fact files**, not day-files. Days are the episodic diary ("what we did"); facts are the knowledge ("what's true"). Both age, separately — because "what did we do last Tuesday" and "what's our deploy target" decay at totally different rates.

### What the two-track model does NOT solve: currency

Track A handles **volume** (compression). Track B handles **durability** (permanent archive). Neither handles **currency** — "is this fact still TRUE now?" If you said "we use Postgres" in March and "moved to SQLite" in May, both can sit in the archive; keyword recall might surface the stale one. That's the temporal-validity gap → [design §16.18](../../specs/design.md) / Task 66. Also: **`expires_at` is a defined frontmatter field with ZERO code enforcement** (verified 2026-06-01) — folded into Task 66.3.

## 2. How every other system ages memory (the cross-system check)

| System | Lifecycle mechanism | What we took / how we differ |
| --- | --- | --- |
| **Simon Scrapes video** (our seed) | Self-curation via cron: daily distill / nightly index / weekly curate keep MEMORY.md bounded. Frozen-snapshot read once per session. | We built all of it. **Did NOT address fact consolidation/retention** — we extended past him (content-addressed IDs, supersession, tombstones). |
| **claude-remember** | Rolling window: `now → today-X (1h cooldown) → recent (entries >3d rotate out) → archive (by week)`. Caps: recent <600 tokens, archive <400. `.done.md` rename = never delete. | We ported the rolling-window shape (Tasks 28/29/33). Our caps are byte-based; our prompts are our own. |
| **GBrain** (Garry Tan) | "Dream cycle" — nightly cron does dedup + citation-fixing + **contradiction detection** + synthesis ("gives the answer, not raw pages"). | Contradiction-detection → our Task 66.4. Synthesis → past-1.0. Their entity-graph scale is wrong weight class for single-user. |
| **Beyond the Log** (Chandra) | The deepest: episodic ≠ temporal. **Validity windows** (`started_at`/`ended_at`), 7 fact *shapes*, nudged reranking by query mode. | Absorbed as [design §16.18](../../specs/design.md) → Task 66. Full research: [`2026-05-24-beyond-the-log-time-aware-memory.md`](2026-05-24-beyond-the-log-time-aware-memory.md). |
| **Native Auto Memory** (Anthropic) | Single-project, machine-local, opaque. Same `MEMORY.md + <type>_<slug>.md` shape. | NOT our benchmark (the kit exists to beat it; v0.1.1 did). Coexist by default (D-21/ADR-0011). |

## 3. Competitive position + the niche wedge (why anyone picks us)

The honest read after the v0.1.1 + v0.2.0 self-tests: **capture + bounded scratchpads + rolling compression is table-stakes.** Native and claude-mem already do that. If that's all we ship, there's no reason to pick us. The user 2026-06-01: *"this is still a model of a car and not a car."*

**The wedge (D-27, unoccupied):** claude-mem = single-user local capture+recall; native = single-project, opaque, Anthropic-controlled; GBrain = enterprise entity-graph, heavy. **Nobody owns "your coding persona + project memory, committed to git, portable across machines, shareable with your team, that gets sharper the more you use it."** That's the reason to exist — but it only pays off once **recall is good (L5b)** AND the **persona tier actually fills (F2)**. Which is exactly why those two are the front of the roadmap.

### Why it doesn't excite yet (D-26)

We built the **skeleton**, and skeletons don't demo. Excitement = the *wow moment*: the thing no other tool does, in front of you, unprompted. Three wows, sequenced by shippability:

1. **Cross-project cold-open** — open Claude on a brand-new project and it already knows how you work. Unlock = F2 (Task 64). The wedge. Nearly the next task.
2. **Recall with reasoning** — "what did we decide about X 3 weeks ago and why" → answer + rationale. Unlock = L5b (Task 65).
3. **Currency / contradiction-catch** — "you said Postgres, now SQLite — which is current?" Unlock = temporal validity (Task 66). Beyond video parity.

### Video-parity scorecard (the "give it to a friend" bar, D-25)

L1 in-repo ✅ · L2 granular archive ✅ · L3 bounded scratchpads ✅ · L4 memory-aware hooks ✅ · **L5 semantic Recall ⚠️ (keyword FTS5 only — the ONE true gap)** · L6 cron self-curation ✅ · frozen-snapshot ✅. **4-of-6 layers + frozen-snapshot are built; the single video-parity gap is L5b semantic recall** — which is also the video's own headline ("recall is the most important function").

## 4. Layer 5 deep-research brief (run before Task 65 — see Task 65.0)

**Why deep research, not just a bake-off:** we have a lean (sqlite-vec/qmd over Chroma/Milvus, from [liorwiki's search-architecture decision](file:///C:/Projects/liorwiki/docs/search-architecture.md) + our own research base) but not certainty. The genuinely open question is the **local embedding model** — Anthropic has **no embeddings API**, so recall quality rides a local embedder whose quality/size/speed tradeoff has moved since our last research. Recall is the #1 function; de-risk the backbone before sinking build time.

**Constraints the research must respect (our actual profile):**
- Single-user, local-first, **node-only / no-server** ethos (hardened in Task 62 / D-23). A Docker/Milvus server is almost certainly the wrong weight class.
- We already run **SQLite + FTS5** (keyword) with a `semanticBackend` DI seam + `reciprocalRankFusion` in [`search.mjs`](../../packages/cli/src/search.mjs) — the winner just drops in. FTS5 already does metadata filtering, so we need *less* than a general vector DB (mostly pure semantic + hybrid fusion).
- Corpus is small (hundreds–low-thousands of memory-shaped facts/bullets per project), short text, latency-sensitive (runs at session start + on `cmk search`).
- Cross-platform (Win/mac/Linux), installable without a heavy toolchain. Embedding model must run locally (CPU-acceptable; GGUF/ONNX).

**Questions to answer (decision-grade):**
1. **Embedded vector store for a node/single-user-local app in 2026** — confirm or update the shortlist: `sqlite-vec` (in-our-SQLite, best architectural fit) vs `qmd` (node, MCP-native, what the user runs in liorwiki) vs `Chroma` (Python embedded) vs anything newer. Which gives hybrid keyword+vector in ONE place with least install weight?
2. **Best local embedding model** for short developer-memory text, CPU-friendly, small footprint: candidates incl. `embeddinggemma` (GGUF, what qmd uses), `all-MiniLM-L6-v2` / `all-mpnet-base-v2` (sentence-transformers), `bge-small/`base`, `nomic-embed-text`, ONNX-quantized variants. Tradeoff table: recall quality vs model size (MB) vs embed latency vs license.
3. **Hybrid retrieval** best-practice: how do current local-memory systems fuse FTS5/BM25 + vector (RRF? weighted? rerank stage?) — confirm our `reciprocalRankFusion` choice is current, or what beats it.
4. **Chunking/granularity** for per-bullet/per-fact memory (vs document chunking) — does the winner support our per-fact granularity cleanly?
5. **What do the comparable single-user-local-markdown memory tools actually ship in 2026** for semantic recall (claude-mem, basic-memory, others)? Convergence = signal.

**Output we want:** a recommended (store + embedding model + fusion) triple with the one-sentence why, a fallback, and the 2–3 things to verify in the bake-off on our data (recall@5 + latency + install weight over ~30–50 facts + ~10 synonym/paraphrase queries).

**Where the answer lands:** a new research note (`docs/research/{date}-layer5-semantic-recall-backend.md`), then Task 65.1 bake-off confirms the pick, then build. Update [design §9.3.1](../../specs/design.md) + D-26 NOTE with the decision.

## Related

- [DECISION-LOG D-24..27](../journey/DECISION-LOG.md) — the roadmap/cadence/wedge decisions (current).
- [tasks.md "Road to 1.0"](../../specs/tasks.md) — the sequenced milestone + Tasks 65/66.
- [`2026-05-24-beyond-the-log-time-aware-memory.md`](2026-05-24-beyond-the-log-time-aware-memory.md) — temporal-validity source (Task 66).
- [`../sources/simon-scrapes-master-claude-memory.md`](../sources/simon-scrapes-master-claude-memory.md) — the video; the parity bar.
