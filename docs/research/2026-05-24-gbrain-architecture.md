---
date: 2026-05-24
topic: GBrain — Garry Tan's production agent brain (the closest analog to claude-memory-kit)
source: https://github.com/garrytan/gbrain
status: complete
informed_sections: [design.md §16.19 (pending), §16.17 (benchmarks — reframed)]
tags:
  - competitive-analysis
  - knowledge-graph
  - zero-llm-extraction
  - hybrid-retrieval
  - eval-framework
  - architectural-overlap
---

# GBrain (research note)

## Why this research

The user surfaced GBrain on 2026-05-24 via [Tort Mario's affiliate-marketing puff piece](https://medium.com/@tort_mario/give-your-ai-agent-36-superpowers-long-term-memory-in-minutes-with-gbrain-open-source-bc2ddfdea97c) (5k stars claim, VPS promo code at the bottom, classic content-farm signals). The article overhypes, but the underlying project is real and serious.

The honest question: **have we built a worse version of something Garry Tan already shipped?**

Short answer: no — but GBrain is the closest analog we've encountered. This note captures the comparison, the three implementation patterns worth absorbing (extracted from the actual code, not the README), and the v0.2 design impact.

## What GBrain is

- **Author:** Garry Tan, president/CEO of Y Combinator. Built to run his own AI agents (146,646 pages, 24,585 people, 5,339 companies — production scale).
- **Stars / forks:** 18,685 stars, 2,627 forks (as of 2026-05-24, ~7 weeks after release on 2026-04-05). Article claim of 5k was outdated by ~4x even at writing time.
- **License:** MIT. Open source, community PRs batched into release waves.
- **Stack:** TypeScript, Postgres + pgvector (or PGLite embedded by default), MCP over stdio + HTTP, MIT-licensed.
- **Tagline:** "Search gives you raw pages. GBrain gives you the answer." Synthesis layer (`gbrain think`) is the differentiator vs. RAG-style retrieval.
- **Production claim:** 97.9% R@5 on LongMemEval (+31.4 P@5 over vector-only and over ripgrep-BM25 + vector RAG).

## What GBrain has that claude-memory-kit doesn't

| Capability | GBrain | claude-memory-kit |
| --- | --- | --- |
| Markdown source of truth | Yes | Yes (same philosophy) |
| Hybrid retrieval | Vector (HNSW pgvector) + BM25 + RRF + reranker + graph signals + intent-aware rewriting | FTS5 + optional Milvus (basic) |
| Self-wiring knowledge graph | Yes — typed edges via zero-LLM regex extraction (`works_at`, `invested_in`, `founded`, etc.) | None |
| Synthesis layer | `gbrain think` produces answers with citations + gap analysis | Out of scope; we inject context for Claude to synthesize |
| Schema packs | Agent-authored, evolvable types; 13+ verbs to mutate the brain's shape | Fixed (scratchpads + per-fact archive) |
| Eval framework | LongMemEval harness, suspected-contradictions, cross-modal eval | None |
| Dream cycle | Cron-driven nightly enrichment (dedup, citation fixing, contradiction detection) | Planned (Task 28 daily distill, Task 29 weekly compress) |
| Job queue | Minions — BullMQ-shaped, Postgres-native, crash-safe two-phase persistence | None (single-process) |
| Skills shipped | 43 curated skills with eval fixtures | 0 (the kit is infra; skills come from agent platform) |
| MCP tools | 30+ over stdio AND HTTP with OAuth 2.1 + DCR client registration | Planned (Task 31), stdio only |
| Install time | ~30 minutes via agent (the agent installs itself!) | TBD; install is one command |
| Multi-user (team brain) | Yes — federated, OAuth-scoped, fuzz-tested zero-leak | Out of scope |

GBrain is more mature, more sophisticated, more complete. By a lot.

## What claude-memory-kit has that GBrain doesn't

These are the differentiators that justify continuing:

1. **3-tier scope (user / project / local).** GBrain is single-brain-per-workspace with team federation as an add-on. A developer running Claude Code on 8 repos with GBrain has to either run 8 brains (no cross-project memory) or one shared brain (no per-project isolation). The kit's tier model handles this natively — user-tier facts persist across projects, project-tier facts stay per-repo, local-tier facts stay per-machine.
2. **Auto-persona generation** (the the user-prioritized v0.1.0 commitment per design.md §16.16). GBrain has entity extraction at the page level — it builds graphs of people/companies. It does NOT have user-profile-level inference ("this developer prefers terse responses, test-driven workflow, one-PR-per-task"). That's a real gap GBrain doesn't fill.
3. **Claude-Code-native by construction.** GBrain works *with* Claude Code via MCP — generic MCP tools. The kit is built around Claude Code's specific lifecycle (SessionStart hook, Stop hook, auto-extract subagent). Tighter integration; lower install bar; pure-markdown viable (FTS5 as only optional dep).
4. **Smaller surface area.** GBrain is 1949 files, ~36 MB, requires understanding 6 layers (brain repo, skills, core, retrieval, eval, MCP). The kit is targeting ~36 implementation tasks total, with a focused mental model (3 tiers × 4 file types × 1 install).

## Are we duplicating?

**No.** Two big projects independently converging on "markdown source of truth + hybrid retrieval + MCP-accessible" validates the architectural call. We are not redoing GBrain's work; we are scoping a narrower, more opinionated take on the same problem.

But we are **adjacent**. If we ship v0.1.0 with significantly worse retrieval, no eval framework, no graph layer, AND no clear positioning — users won't know which one to pick. The positioning has to be sharp: "the lightweight, Claude-Code-specific, cross-project-user-tier alternative for developers who want the auto-persona pattern and don't need a full Postgres-backed knowledge graph."

## Three implementation patterns observed (from code dive)

Read after cloning the repo locally to /tmp; abstracted from the actual source, not the README. These are the patterns that survive porting and the constants worth stealing.

### Pattern 1: Zero-LLM typed-edge extraction via regex + dir-whitelist

Source: [`src/core/link-extraction.ts`](https://github.com/garrytan/gbrain/blob/master/src/core/link-extraction.ts) (the "+31.4 P@5 lift" mechanism).

The technique has three layers:

**Layer A — link parsing (deterministic).** Two regex shapes match markdown links pointing to entity directories:

```js
// Standard markdown: [Alice Chen](people/alice-chen)
const ENTITY_REF_RE = new RegExp(
  `\\[([^\\]]+)\\]\\((?:\\.\\.\\/)*(${DIR_PATTERN}\\/[^)\\s]+?)(?:\\.md)?\\)`,
  'g',
);

// Obsidian wikilinks: [[people/alice-chen|Alice Chen]]
const WIKILINK_RE = new RegExp(
  `\\[\\[(${DIR_PATTERN}\\/[^|\\]#]+?)(?:#[^|\\]]*?)?(?:\\|([^\\]]+?))?\\]\\]`,
  'g',
);

// Plus v0.17.0 qualified wikilinks for multi-source brains:
// [[wiki-source-id:people/alice-chen|Alice Chen]]
```

`DIR_PATTERN` is a fixed whitelist: `people|companies|meetings|concepts|deal|civic|project|projects|source|media|yc` (canonical) plus their extensions. **The entity TYPE is encoded in the directory path.** When the parser sees `(people/alice-chen)`, it knows the target is a Person purely from the directory prefix — no NLP, no embeddings, no LLM call.

Code-fence stripping is defense-in-depth: ``` and inline `` are replaced with whitespace (preserving byte offsets) so slugs inside code samples aren't treated as entity references.

**Layer B — type inference (verb-based, deterministic).** When a link is found, the type of the edge is inferred from a ~240-character context window around the slug, run through 5 regex catalogs. The catalogs are calibrated against the BrainBench rich-prose corpus (~240 LLM-generated pages, with hit-rate numbers in the comments):

```
WORKS_AT_RE   — works at | worked at | CEO of | director of | engineer at |
                joined | previously at | spent N years at | his/her time at |
                + 50+ phrasings calibrated against narrative prose

INVESTED_RE   — invested in | invests in | backed by | led the seed |
                led the Series A | early investor | portfolio company |
                term sheet for | first check

FOUNDED_RE    — founded | co-founded | started the company | founder of |
                founders include | is a co-founder

ADVISES_RE    — advises | advisor (to|at|for|of) | advisory board |
                joined the advisory board | as a (security|technical) advisor |
                consults for
```

Precedence: `founded > invested_in > advises > works_at > role prior > mentions`.

**Layer C — page-role prior (when per-edge inference falls through).** If a person-page's overall content matches `PARTNER_ROLE_RE` (mentions of "partner at", "venture capital", "portfolio") and outbound links point to company-slugs, edges default to `invested_in` even when the per-edge ~240-char window lacks explicit investment verbs. This catches narrative prose like *"Her current board seats reflect her portfolio: [Co A], [Co B], [Co C]"* where the verb appears once and then portfolio companies are listed downstream.

Why this matters for the kit: the regex catalogs took GBrain ~10 versions to calibrate (commit history shows v0.10.5 specifically dedicated to driving works_at from 58% to >85% on rich prose). If we ever add typed-edge extraction (v0.2+), we can port their regex catalog directly; the patterns are stack-agnostic.

**What adapts to our 3-tier model:** the dir-whitelist approach maps cleanly to our scratchpad sections — instead of `people/`, `companies/`, we'd have `SOUL.md`, `USER.md`, `MEMORY.md` sections with implicit type from the section name. The verb-based inference layer is independent and ports as-is.

### Pattern 2: Hybrid search formula (RRF + boost stack)

Source: [`src/core/search/hybrid.ts`](https://github.com/garrytan/gbrain/blob/master/src/core/search/hybrid.ts).

**The pipeline:** keyword + vector → RRF fusion → normalize → boost (compiled_truth × 2.0) → cosine re-score → backlink boost → salience boost → recency boost → rerank → dedup.

**The RRF formula:**

```
RRF score = sum(1 / (RRF_K + rank_in_list))
RRF_K = 60  // constant; cited as the standard from the Cormack et al. paper
```

**The cosine re-score blend:**

```
final_score = 0.7 * rrf_score + 0.3 * cosine_similarity
```

**Backlink boost:**

```
factor = 1 + 0.05 * log(1 + backlink_count)
// 0 backlinks: factor = 1.0
// 1 backlink:  factor ~ 1.035
// 10 backlinks: factor ~ 1.12
// 100 backlinks: factor ~ 1.23
score *= factor
```

**Compiled-truth boost:**

```
COMPILED_TRUTH_BOOST = 2.0  // entity-page summary chunks get 2x after RRF normalization
```

**Floor-ratio gate (v0.35.6.0):** boost stages (backlink + salience + recency) only apply to results whose score is at least `top_score * 0.85`. Stops weak-overlap candidates from leapfrogging legitimate primary hits via accumulated metadata boost. The exact-match boost (lexical relevance) bypasses the gate by design.

The formula is small enough to port and isn't tied to Postgres specifics — it operates on already-ranked result lists from any keyword+vector backend. If/when the kit adds vector retrieval (v0.2+), reusing this formula gets us to "credible hybrid ranking" without burning ablation cycles.

### Pattern 3: LongMemEval harness architecture

Source: [`src/eval/longmemeval/harness.ts`](https://github.com/garrytan/gbrain/blob/master/src/eval/longmemeval/harness.ts), [`src/commands/eval-longmemeval.ts`](https://github.com/garrytan/gbrain/blob/master/src/commands/eval-longmemeval.ts).

**Key architectural decisions worth absorbing:**

1. **Hermetic by design.** When `gbrain eval longmemeval` is invoked, the CLI skips `connectEngine()` so the user's actual brain is never touched. Tests stub the LLM client so the full pipeline runs without an API key. The eval harness must NEVER mutate user-facing state — this is the property we need for §16.17 benchmarks.

2. **Reset-in-place, not fresh-per-question.** Sequential 500-question benchmark uses ONE in-memory PGLite. Between questions: `TRUNCATE` all `public` schema tables (enumerated at runtime via `pg_tables`) except a `PRESERVE_TABLES` allow-list (`sources`, `config`, `gbrain_cycle_locks`, `subagent_rate_leases`). Avoids the snapshot/restore complexity that would otherwise be required.

3. **Resume-from-path.** `--resumeFromPath` reads a previous run's hypothesis JSONL, skips question IDs already processed, appends new ones. Recovery path for mid-run aborts (rate-limit, cost-cap, OS interrupt). Production-grade benchmark UX.

4. **Mode flags.** `--retrieval-only` (skip LLM, score retrieval alone), `--keyword-only` (skip vector path), `--expansion` (query rewriting on/off), `--mode conservative|balanced|tokenmax`. Lets the same harness produce comparable scores across configuration variations.

5. **By-type aggregation.** `--by-type` emits per-question-type pass rates as the last JSONL line. `--by-type-floor 0.45` exits non-zero if any bucket falls below the floor. Catches the "average looks good but one category collapsed" failure mode that a single aggregate hides.

6. **Trajectory routing methodology disclosure (v0.40.2.0).** When extra preprocessing is enabled (Haiku-based intent classifier in front of retrieval), the output JSON gets stamped with `extractor=haiku-preprocess-full-haystack-v1`. Honest comparison vs. baseline — downstream readers see the preprocessing step is in the pipeline.

**What adapts to the kit:** items 1, 2, 3, 4 port directly. Our v0.2 benchmark harness wants the same hermetic-by-default + reset-in-place + resume-from-path properties. By-type aggregation is a nice-to-have once we have multiple query categories to bucket.

## What's worth absorbing (verdicts)

### 1. The typed-edge regex catalog — v0.2 candidate

**Verdict:** keep filed; absorb if/when we add a knowledge-graph layer.

The 5 catalogs (`WORKS_AT_RE`, `INVESTED_RE`, `FOUNDED_RE`, `ADVISES_RE`, `PARTNER_ROLE_RE`) plus the page-role prior layer are calibrated against real prose with measured hit rates. Re-deriving this independently would take weeks. If we add typed edges (likely tied to design.md §16.18 fact-shape annotation from the Beyond-the-Log note), port the catalogs directly with credit.

Caveat: the catalogs are tuned for VC/business prose (Tan's actual use case). For developer use cases ("works on", "owns the X subsystem", "reviewing PR #") we'd need our own catalog. But the *technique* (dir-whitelist + verb-based inference + page-role prior) ports as-is.

### 2. Hybrid search formula — v0.2 (when we add vector retrieval)

**Verdict:** absorb the constants directly. Adapts cleanly.

`RRF_K = 60`, `0.7 rrf + 0.3 cosine`, `1 + 0.05 * log(1 + backlinks)`, `compiled_truth × 2.0`, floor-ratio gate at 0.85. These are not arbitrary — they're measured against LongMemEval. Reusing them gets us to "credible hybrid ranking" without burning ablation cycles. Cite GBrain in the implementation.

If we ever ship vector retrieval (design.md §9.3), this formula is the right starting point.

### 3. LongMemEval harness architecture — v0.2 (informs §16.17)

**Verdict:** the §16.17 benchmark design should mirror GBrain's harness shape.

Specifically: hermetic-by-default (never touch user brain), reset-in-place between questions (cheaper than snapshot/restore), resume-from-path (survive mid-run aborts), mode flags for retrieval-only vs LLM-augmented, by-type aggregation. The methodology-disclosure pattern (`extractor=...` stamp on output) is also a good honest-comparison practice.

We can run a smaller benchmark suite (10-15 questions across our task categories, not 500), but the harness shape should be the same.

### 4. The 7 fact shapes — already absorbed via Beyond-the-Log note

GBrain doesn't have explicit fact shapes (State/Event/Plan/etc. per Chandra's blueprint), but it has *implicit* shapes via page types (`person`, `company`, `meeting`, `deal`, `concept`). The schema-pack system (`gbrain schema use ...`) lets agents author their own types. We don't need both Chandra's shape taxonomy AND GBrain's page-type system — pick one. Current plan (per §16.18): adopt Chandra's because it's at the fact level, not the page level, and composes with our existing per-fact archive.

### 5. Schema packs (agent-authored evolvable types) — v0.3+ (deferred)

**Verdict:** interesting but out of v0.1.0/v0.2 scope.

GBrain's schema-pack system lets agents propose new page types via `gbrain schema detect` (clusters filesystem into proposed types), `gbrain schema suggest` (LLM-refined), `gbrain schema review-candidates --apply`. The brain's shape is itself agent-editable.

For our scope: the fixed scratchpad set + per-fact archive is the v0.1.0 commitment. Making it agent-evolvable adds scope we can't carry pre-v0.1.0. Worth filing as a v0.3+ candidate IF user feedback indicates the fixed scratchpads are too rigid.

## What we wouldn't absorb (deliberate divergence)

1. **The synthesis layer (`gbrain think`).** GBrain produces synthesized answers with citations + gap analysis. Our scope is to *inject context*; Claude does the synthesis using its native model. Different positioning: GBrain ships the model loop; we ship the context-injection harness. Both defensible; ours is intentionally narrower.

2. **Postgres dependency by default.** GBrain ships PGLite as default (eliminates the prior install friction) but still requires Postgres semantics. Our kit is markdown-first; SQLite/FTS5 is the optional retrieval cache. Pure-markdown is viable for a small brain (no DB needed at all). The install bar is lower.

3. **Skills layer.** GBrain ships 43 curated skills as part of the install. Our kit is the infra layer — skills are the agent platform's responsibility (Claude Code's slash-commands, your CLAUDE.md, agent-specific instructions). We don't compete on skill count.

4. **Multi-user / team brain.** GBrain has OAuth-scoped multi-user with fuzz-tested zero-leak. We're explicitly single-user per machine. Different target.

5. **The dream-cycle infrastructure (Minions queue).** BullMQ-shaped Postgres-native queue with two-phase persistence is right for GBrain's scale (~100K-page brains, multiple agents). Our daily-distill (Task 28) and weekly-compress (Task 29) run as single-process cron with no durable queue. Right for our scope; over-engineered for a per-developer kit.

6. **Markdown-as-DB-row mapping.** GBrain syncs the markdown brain repo INTO Postgres on every write; the markdown is system-of-record but the DB is the read path. We're the inverse: markdown is the read path, optional SQLite/FTS5 is the index cache. Different tradeoff (theirs: faster retrieval, more DB ops; ours: simpler, slower, no DB required).

## What we already have that overlaps

For the record:

- **Markdown source of truth.** Same philosophical bet.
- **MCP server (planned Task 31).** Stdio-only; smaller surface than GBrain's 30+ tools, intentionally.
- **Content-addressed citation IDs.** GBrain uses slug-based addressing; ours is content-hash-based. Different tradeoff (theirs: human-readable, ours: dedup-friendly cross-machine).
- **Trust levels (high/medium/low).** GBrain has source-tier boosts but no explicit user-attestation contract. The trust-as-attestation contract is ours.
- **Provenance frontmatter (per-bullet HTML comment).** GBrain uses YAML frontmatter on pages; we use per-bullet HTML comments. Different shape; same property (every fact has source + sha1 + write-source + trust + at).
- **Tombstones (design §6.5).** GBrain has soft-delete via DB; we have explicit `archive/tombstones/`. Both preserve the audit trail.
- **CLAUDE.md / AGENTS.md entry points.** Both projects use these. Independent convergence on the agent-readable-doc pattern.

## Specific design.md §16 entries to add (after PR-15 + auto-persona task land)

To avoid conflict with cold session's in-flight PR-15 work and the upcoming auto-persona task append, the new §16 entry below will be added in a separate docs commit AFTER both land.

### §16.19 Self-wiring knowledge-graph layer — v0.2 candidate

Inspired by GBrain (research note: [`docs/research/2026-05-24-gbrain-architecture.md`](../../docs/research/2026-05-24-gbrain-architecture.md)).

**The gap.** Our current model has per-fact files (granular archive) and bulleted scratchpads. Facts link to source transcripts via the `source` provenance field. They do NOT link to each other via typed edges. A search for "what does Alice work on?" can find facts mentioning Alice but cannot traverse "Alice → Acme (works_at) → Acme's recent decisions (made_at)" the way GBrain's typed-edge graph can.

**Proposed v0.2 absorbs:**

1. **Auto-link on every fact write.** When `writeFact()` (Task 7) commits a new fact, scan the body for entity-reference patterns (markdown links, wikilinks, bare slug references) and emit candidate edges. Zero LLM calls.

2. **Verb-based type inference** using regex catalogs ported from GBrain's [`link-extraction.ts`](https://github.com/garrytan/gbrain/blob/master/src/core/link-extraction.ts). Adapt for developer prose (add `works_on`, `owns`, `reviewed`, `merged_by`, etc. to the catalog; keep the technique).

3. **Page-role prior layer** for cases where per-edge context is sparse. If the source page is about a specific developer, outbound facts about repos default to `works_on`. Same fall-through mechanism as GBrain.

4. **Graph queries** via new `cmk graph-query <src> --type <edge-type>` subcommand. Multi-hop traversal.

5. **Backlink storage.** Every typed edge writes both directions (`from → to` AND `to ← from`) so traversal is symmetric. Per-page backlink count feeds the §16.17 retrieval ranking when we add hybrid search.

**Deferred to v0.3:**

- Schema packs (agent-authored evolvable types). Filed under §16.20 candidate.
- Frontmatter-derived edges (per-fact `related: [...]` fields auto-becoming edges). Useful but bigger than the v0.2 cut.

### Reframing §16.17 (Empirical benchmarks)

The pending §16.17 entry should pick up GBrain's harness architecture directly:

- Hermetic by default (the benchmark never touches the user's actual brain)
- Reset-in-place between questions (TRUNCATE-equivalent on our markdown corpus — wipe to fresh state)
- Resume-from-path for mid-run aborts
- Mode flags: retrieval-only vs LLM-augmented; by-tier-only filters
- By-category aggregation with floor enforcement
- Methodology-disclosure stamps for non-baseline configurations

Smaller suite than GBrain's 500 questions (probably 30-50 across categories) but the harness shape mirrors theirs. Cite GBrain as the methodology source.

## Reference URLs

- Repo: <https://github.com/garrytan/gbrain>
- Hyped article (use with discount — affiliate-marketing tone): <https://medium.com/@tort_mario/give-your-ai-agent-36-superpowers-long-term-memory-in-minutes-with-gbrain-open-source-bc2ddfdea97c>
- Companion eval repo: <https://github.com/garrytan/gbrain-evals>
- LongMemEval dataset: <https://huggingface.co/datasets/xiaowu0162/longmemeval>
- Specific files cited:
  - <https://github.com/garrytan/gbrain/blob/master/src/core/link-extraction.ts> (Pattern 1)
  - <https://github.com/garrytan/gbrain/blob/master/src/core/search/hybrid.ts> (Pattern 2)
  - <https://github.com/garrytan/gbrain/blob/master/src/eval/longmemeval/harness.ts> (Pattern 3)

## Related research notes

- [`2026-05-24-tencentdb-agent-memory.md`](2026-05-24-tencentdb-agent-memory.md) — sibling project; convergent on layered abstraction; divergent on scope (single-workspace vs per-project tiers)
- [`2026-05-24-beyond-the-log-time-aware-memory.md`](2026-05-24-beyond-the-log-time-aware-memory.md) — temporal-blindness diagnosis; complements GBrain's typed-edge approach (Chandra's fact shapes are at the fact level; GBrain's typed edges are at the relationship level — both compose)
- [`2026-05-24-openclaw-templates.md`](2026-05-24-openclaw-templates.md) — sibling project's template design

## Key takeaway

GBrain is the closest analog we've encountered to claude-memory-kit. The overlap is real — same philosophy (markdown source of truth), same surface (long-term memory for AI agents), same MCP integration pattern. The divergence is also real:

- We have 3-tier scope (user/project/local) — they don't
- We have auto-persona generation as a v0.1.0 commitment — they don't (their entity extraction is at the page level, not the user-profile level)
- We are Claude-Code-native by construction — they are MCP-generic
- They have 10x our retrieval sophistication, a graph layer, an eval framework, a synthesis layer, 43 skills, and an actual production user base

**Three concrete patterns worth absorbing** (with verdicts already filed above): the zero-LLM typed-edge extraction technique (v0.2 §16.19 candidate); the hybrid-search formula constants (v0.2 if we ship vector retrieval); the LongMemEval harness architecture (informs §16.17 benchmarks).

**Strategic call:** continue building. The 3-tier + auto-persona + Claude-Code-native combination is real differentiation. But ship v0.1.0 with sharp positioning — "the lightweight, opinionated, Claude-Code-specific alternative" — not as a competitor to GBrain's retrieval depth. Two big projects converging on markdown-as-source-of-truth validates the architecture; doesn't threaten the niche.
