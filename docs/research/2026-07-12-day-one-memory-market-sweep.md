---
date: 2026-07-12
topic: Day-one-memory market sweep — the origin creator's v3 (Hermes rebuild), OpenWiki Brains (proactive memory), and the MLM memory-taxonomy decision tree, gap-mapped against the kit
source: The user's full-read directive — two clipped articles (the user's personal-wiki raw captures) + the complete youtube-to-slide capture (transcript, 20 slides + OCR, the free build plan) of the 2026-07-10 video
tags: [market, recall, import, team, taxonomy, provenance, D-326]
---

# Day-one-memory market sweep (2026-07-12) — three sources, one 48-hour window

_Three independent sources published 2026-07-10 all converge on the kit's thesis. This note
records what each says, what the kit already does, and the real gaps — driving Tasks 225–229,
the Task-127 re-lane, and the v0.6.0/v0.7.0 lanes (D-326)._

## Source 1 — Simon Scrapes v3: "I Rebuilt Hermes's Best Feature in Claude Code" (YouTube 9CiOwbmOKdU, 2026-07-10, 14:42)

**The origin creator's third memory video** (v1 is the kit's founding source; v2 = the
2026-06-10 note). Reviewed in FULL: transcript + all 20 slides/OCR + the companion free
build plan ("Claude Code Memory Plan").

**Market data (the demand signal):** Hermes agent 0 → 211k GitHub stars in 5 months; an
analysis of 1,300 Reddit comments found **~30% of switchers cite memory defaults** as the
switching reason. Key quotes: *"Remembering context is worth more than a thousand
integrations"*; Hermes is *"competing against the session model itself — the next layer of
value sits in continuity."*

**His framework:** every memory system answers three questions — **storage / injection /
recall** (his v1 framing, stable across all three videos).

**Hermes flaws he names (why rebuild-in-Claude-Code):** the self-rewriting loop (edits its
own skills/memory, trusts its own summary, overwrites good information — users bolt on
approval gates); a separate runtime (VPS/billing/security surface); hard char caps that
silently compress away standing instructions; FTS5 keyword-only recall (cites a real Hermes
GitHub issue); NO import of pre-existing history (day one = empty database).

**What he built** (files-in-folders inside Claude Code): (1) frozen snapshot — capped
memory.md (2,500 chars) + profile + today's log, SessionStart-injected, frozen-for-session;
(2) agent-curated writes — a "remember/note/forget" skill, read-whole-file dedup, editable
judgment rules; (3) capture-everything — detached Stop hook, cheap-model summary, hash-
idempotent, raw transcript archived; (4) semantic recall — PGlite+pgvector, hybrid
vector+keyword merged, reranked by recency/source weight, **context-expansion into the
neighboring conversation**, an explicit **recall ladder** (search rung → expand → transcript
drill, stop at the shallowest rung that answers); (5) **citations** — every chunk carries
source file/date/heading; admit-when-absent; (6) **bootstrap import** — `npm run
memory:import-sessions` walks ALL existing Claude Code history (his demo: 19 workspace + 30
global sessions), interactive source/count picker, Haiku-summarizes into dated
`context/memory/<date>.aos.md` files, embeds them, keeps full transcripts — "day one isn't
empty"; sentinel-guarded run-once; (7) **TeamOS (beta)** — one shared brain, every memory
tagged by owner/client, every query filtered by who's asking (system/team/client/private
levels; inspired by Garry Tan's GBrain).

**The convergence is near-total** — down to `context/memory/` as the directory, frozen-
snapshot semantics, detached idempotent Stop-hook capture, hybrid+rerank, and even "recall
ladder"/"sanctioned path" vocabulary visible in his own terminal captures. The kit's
architecture is the convergent design.

## Source 2 — OpenWiki Brains (LangChain blog, Brace Sproul, 2026-07-10)

OpenWiki (their OSS codebase-wiki CLI) expanded into a general-purpose **"Personal Brain"**:
connectors (Gmail, Notion, git repos, X, Hacker News, web search; Slack next) pull content
into a **local markdown wiki** agents read as memory, refreshed by a local scheduled job. A
setup-time focus prompt decides what ingestion preserves. Deterministic connectors fetch
feeds; agentic connectors (Notion/web) get tools + a goal.

**The framing that matters: reactive vs PROACTIVE memory.** Built-in memory remembers what
you tell the agent or what it infers from conversations (reactive — the kit's class);
OpenWiki ingests context that never passed through a chat (proactive). Markdown-first is
explicit and deliberate ("keeps the brain visible on the filesystem"). Their retrieval is
currently NOTHING (a wiki on disk; FTS/MCP/semantic "being explored" — the kit is well
ahead). **Roadmap flag: "Claude/Codex local sessions" as a future connector** — LangChain
intends to ingest agent conversation history, i.e. moving into the kit's territory.

## Source 3 — "Choosing the Right AI Agent Memory Strategy" (MachineLearningMastery, Bala Priya C, 2026-07-10)

A taxonomy + decision-tree piece. **Four memory types** (working / semantic / episodic /
procedural) with per-type assumptions; a **five-question tree run per CATEGORY of
information** (persist beyond turn? beyond session? stable fact vs evolving event? full-read
vs search retrieval — explicitly citing Anthropic's memory tool as the small-store full-read
pattern? recurring task shape → procedural distillation?). **Pitfalls table:** re-asking =
over-trimmed working memory; contradictory retrieval = facts+events in one undifferentiated
store; corrupted semantic memory = no write-time validation; procedural memory that never
improves = storing replays not distilled lessons.

**The kit implements all four types** (working = MEMORY.md scratchpad; semantic = fact
archive + USER.md; episodic = rolling window + transcripts; procedural = HABITS/LESSONS +
judgment records) and answers every pitfall (dedup/conflict-queue/Poison_Guard = write-time
validation; distill = lessons-not-replays) — **but never speaks this vocabulary** in its
user-facing docs.

## Gap map → the tasks (D-326)

| Video/source capability | Kit today | Verdict |
| --- | --- | --- |
| Frozen snapshot, capped, SessionStart-injected | ✅ core (≤10 KB, importance-aware eviction — stronger than his 2,500-char lossy cap) | — |
| Agent-curated writes, editable rules, dedup | ✅ memory-write skill + `cmk remember` + auto-extract + conflict queue | — |
| Capture everything (detached, idempotent, raw archived) | ✅ Stop hook + rolling window + gitignored transcripts | — |
| Hybrid vector+keyword + rerank | ✅ shipped v0.3.0 (RRF fusion + D-72 keyword-overlap/temporal rerank; R@5 0.941) | tuning research = existing trio 149/176/178 |
| Context-expansion to neighboring content + explicit recall ladder | ⚠️ partial (mk_get/mk_timeline/transcripts exist; no expand rung; ladder implicit in the memory-search skill) | **Task 226** |
| Citations: date+heading+source on every recall, admit-when-absent | ⚠️ partial (heading_path + path in results; keyword-only honesty note; `cites` param unwired §16.39; date not surfaced) | **Task 227** |
| **Bootstrap import of existing session history** | ❌ the big gap — `cmk transcripts extract` (38b) extracts raw markdown but NO summarize→dated-memory→index pipeline; day one is empty | **Task 225 — the v0.6.0 differentiator** |
| Team memory (owner-tagged, query-filtered) | ❌ Task 127 (parked, memclaw prior art) — demand signal now FIRED (TeamOS beta live) | **127 re-laned v0.7.0** |
| Proactive/connector memory (OpenWiki class) | ❌ nothing; nearest in-theme cut = OTHER AGENTS' local sessions (the connector LangChain plans) | **Task 228 (GO/NO-GO research)** |
| Memory-taxonomy vocabulary in docs | ❌ implemented, never named | **Task 229 (docs)** |

**Kit-only strengths none of the three sources have:** Poison_Guard + screen-before-
committed-write (216), L3 privacy judge (148/ADR-0019), conflict queue + trust + append-only
DECISIONS journal, tiering with graduation (graduate-don't-truncate — his 2,500-char cap is
the exact Hermes flaw he criticized), temporal validity (66), the learn-loop (ADR-0017),
resumable jobs (ADR-0020), doctor/health checks, cross-agent adapters. **The import task
must keep these:** his import writes raw summaries unscreened; the kit's version routes
every imported write through the privacy judge + Poison_Guard — a differentiator inside the
differentiator.
