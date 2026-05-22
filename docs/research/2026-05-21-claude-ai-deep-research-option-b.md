---
date: 2026-05-21
topic: Targeted research for claude-memory-kit design questions (Option B)
source: Claude.ai Deep Research mode
prompt_template: docs/process/research-prompt-design.md (Option B style)
status: complete (caveat — see "Bank context" note below)
informed_adrs: [0006, 0007, 0008]
informed_specs: [v0.1.0/requirements.md]
tags:
  - deep-research
  - option-b
  - claude-ai
  - targeted-design
---

# Option-B research — claude-memory-kit targeted design

> Verbatim output from Claude.ai Deep Research mode (2026-05-21). Editorial preface added 2026-05-22 when the file was moved into `research/` and frontmatter applied. The original report begins under "Original report" below.

## Note on bank / air-gap framing in this report

This research output assumes a "regulated bank / air-gapped" deployment context throughout, despite the prompt being scoped to a personal open-source project. This is a known Claude.ai memory-injection artifact (a stored work-context detail; Claude.ai's memory feature pulled that context into research mode unprompted).

**Where the bank framing taints the output:**

- TL;DR third bullet ("dominant cost driver for a regulated bank is not API spend but the egress/audit problem")
- Stage 3 production recommendations (Bedrock adapter, local Llama, audit log)
- "For the bank specifically" subsection in Q6
- Final caveats section's bank/air-gap mention

**Where the output is sound regardless of deployment context:**

- All technical findings (5+1 hook architecture, content-addressed IDs, two-stage compression, FTS5 schema, 5-tool MCP, first-match-wins tier merging) hold for personal use.
- The "pluggable compressor interface" recommendation is good advice for any deployment — see ADR-0008 for how we applied it.

When folding findings into requirements.md and design.md, drop bank-specific framing. Reframe "pluggable compressor for bank" as "clean compressor interface for future flexibility."

See [../process/scope-override-claude-memory.md](../process/scope-override-claude-memory.md) for the prompt-pattern we now use to prevent this in future research runs.

---

## Original report — claude-memory-kit: Targeted Research Report

**TL;DR**
- For a self-hostable, air-gap-friendly per-project memory plugin for Claude Code, the strongest reference architecture today is the **thedotmack/claude-mem** pattern (markdown + SQLite FTS5 + 6 lifecycle hooks + ~4-tool MCP server, Haiku-4.5 for compression), but you should diverge from it in three ways: (1) use **content-addressed hash IDs with a tier prefix** (e.g., `P-7Q3K2A4F`) rather than auto-increment integers so IDs survive consolidation and are stable across machines; (2) compress on **rolling window + Stop + SessionEnd** rather than every PostToolUse; (3) treat the bank's policy walls (no outbound Anthropic API calls in air-gapped zones) by making the compressor model a *pluggable* component — Haiku 4.5 in dev, a locally-hosted summarizer in prod.
- Anthropic-blessed primitives — the **6 lifecycle hooks**, the **plugin marketplace**, and the **MCP** protocol — are now production-grade, but two confirmed bugs (hook double-fire from marketplace + cache, command-template deduplication) mean you cannot rely on plugins coexisting cleanly without kit-unique hook command paths.
- Anthropic's product page (anthropic.com/claude/haiku) states "Pricing for Haiku 4.5 on the Claude Platform starts at $1 per million input tokens and $5 per million output tokens, with up to 90% cost savings with prompt caching and 50% cost savings with batch processing." A typical 30 KB transcript → 700-char summary therefore costs ≈ $0.0001–0.0005 per session; the dominant cost driver for a regulated bank is **not API spend** but the egress/audit problem.

---

## QUESTION 1 — Claude Code hook patterns (2026)

### 1.1 Existing-system survey

**Named starting points**
- **thedotmack/claude-mem** — 6 hooks (Setup → SessionStart → UserPromptSubmit → PreToolUse(Read) → PostToolUse → Stop) dispatched through a single Bun worker (`scripts/worker-service.cjs`, built from `src/services/worker-service.ts`). Timeouts: SessionStart 60 s, PostToolUse 120 s, Stop 120 s. Confirmed hook config snippet (issue #810):
  ```json
  "SessionStart": [{"type":"command","command":"bun \"${CLAUDE_PLUGIN_ROOT}/scripts/worker-service.cjs\" start","timeout":60}],
  "UserPromptSubmit": [{"type":"command","command":"bun \"${CLAUDE_PLUGIN_ROOT}/scripts/worker-service.cjs\" hook claude-code session-init","timeout":60}]
  ```
  Notable design: hooks never block (Exit 0 on error) to prevent Windows Terminal tab accumulation; the Setup hook does only a sub-100 ms `.install-version` marker check and on mismatch prints `run: npx claude-mem repair` to stderr but never blocks.
- **Digital-Process-Tools/claude-remember** — bash-only hooks, all detached via `</dev/null >/dev/null 2>&1 & disown` to dodge the Windows libuv assertion (fix referenced in PR #39). Uses Haiku for summarization; per its README, "A typical session save costs < $0.01 — a few thousand input tokens (the session exchanges) and a few hundred output tokens (the summary)."

**Novel finds**
- **disler/claude-code-hooks-mastery** — reference logger covering all 13 events using UV-managed single-file Python scripts in `.claude/hooks/`, demonstrating how to keep hook code out of the project's dependency tree.
- **luongnv89/claude-howto** — comprehensive 29-event matrix (post-March-2026 events including `InstructionsLoaded`, `UserPromptExpansion`, `PostToolBatch`, `WorktreeCreate`, `TaskCreated`, `TeammateIdle`), all with example schemas.
- **NOVEL:** **codenamev/claude_memory** (Ruby) — uses only 3 hooks (SessionStart, Stop, SessionEnd) plus an MCP server for everything else. This is a deliberate inversion: lifecycle hooks for *capture* only, MCP for *retrieval and writes*. Worth borrowing.
- **coleam00/claude-memory-compiler** — SessionEnd + PreCompact (safety net) → background Claude Agent SDK call to compile a daily log into knowledge articles. Explicitly forks heavy work to a *background* process so the hook itself returns under 100 ms.
- **memvid/claude-brain** — single binary `.mv2` file (Rust core), no SQLite/DB. Interesting as a zero-dependency endpoint, less useful for citations.

**Confirmed bugs to design around (open Anthropic issues, May 2026)**
- **anthropics/claude-code #24115** — plugin hooks fire **twice** because Claude Code loads hooks from both `marketplaces/<name>/plugin/hooks/hooks.json` and `cache/<name>/<version>/hooks/hooks.json`.
- **anthropics/claude-code #29724** — multiple plugins registering hooks for the same event are de-duplicated **by the raw command template string before `${CLAUDE_PLUGIN_ROOT}` expansion**. Two plugins running `bash ${CLAUDE_PLUGIN_ROOT}/hook.sh` collide; only one survives.

### 1.2 Per-hook tradeoff matrix

| Hook | Payload essentials | Recommended timeout | Common failure | Recommended use in claude-memory-kit |
|---|---|---|---|---|
| **SessionStart** | `source` (`startup`/`resume`/`clear`/`compact`), `session_id`, `cwd` | ≤ 60 s | Slow context injection blocks first prompt; libuv assertion on Windows if subprocess not fully detached | Read merged 3-tier markdown index, emit `additionalContext` JSON (≤ 4 KB) |
| **UserPromptSubmit** | `prompt`, `session_id` | ≤ 15 s | Prompt validators that mutate prompt silently confuse Claude | Inject 3-5 most-relevant memory citations (`#P-7Q3K2A`) as additionalContext |
| **PreToolUse** | `tool_name`, `tool_input`, `permission_mode` | ≤ 10 s | Blocking exit 2 on bulk operations stalls agent loops | **Don't use for memory writes.** Use only for opportunistic capture of read targets |
| **PostToolUse** | `tool_name`, `tool_response`, `tool_use_id` | async, ≤ 120 s | Synchronous lint/format chains add seconds to every turn | Async fire-and-forget enqueue to compressor; do NOT block |
| **Stop** | `last_assistant_message`, `stop_hook_active` | ≤ 30 s | Stop hooks that exit 2 force-loop Claude and rack up tokens | Guard with `stop_hook_active` to avoid recursion; trigger a compression batch |
| **SessionEnd** | `reason` (`exit`/`sigint`/`error`) | ≤ 60 s | Errors here are silent | Final rollup compression + flush to markdown source-of-truth |

**Hook chaining and coexistence**
- Multiple hooks on the same event run **in parallel** (claudefa.st guide; Anthropic hook reference). For deterministic ordering, write one dispatcher script that fans out internally.
- Async hooks (`"async": true`) deliver output on the **next turn** — useful for memory writes, dangerous for security validation.
- Use the new (v2.0.10+) PreToolUse `updatedInput` field to transparently inject memory citations into Read/Grep without Claude noticing.

### 1.3 Recommendation

For claude-memory-kit, ship **5 active hooks + 1 setup hook**:

```json
{
  "hooks": {
    "SessionStart": [{"hooks":[{"type":"command",
      "command":"$CLAUDE_PROJECT_DIR/.claude/memkit/bin/inject-context",
      "timeout":30}]}],
    "UserPromptSubmit": [{"hooks":[{"type":"command",
      "command":"$CLAUDE_PROJECT_DIR/.claude/memkit/bin/cite-relevant",
      "timeout":10}]}],
    "PostToolUse": [{"matcher":"Write|Edit|MultiEdit","hooks":[{
      "type":"command",
      "command":"$CLAUDE_PROJECT_DIR/.claude/memkit/bin/capture",
      "async":true,"timeout":120}]}],
    "Stop": [{"hooks":[{"type":"command",
      "command":"$CLAUDE_PROJECT_DIR/.claude/memkit/bin/compress-rolling",
      "timeout":30}]}],
    "SessionEnd": [{"hooks":[{"type":"command",
      "command":"$CLAUDE_PROJECT_DIR/.claude/memkit/bin/flush",
      "timeout":60}]}],
    "Setup": [{"hooks":[{"type":"command",
      "command":"$CLAUDE_PROJECT_DIR/.claude/memkit/bin/version-check"}]}]
  }
}
```

**Justification:** PreToolUse is omitted because writing memory before a tool runs racks up writes for tool calls that are then declined or fail. PostToolUse is matched narrowly (`Write|Edit|MultiEdit`) to avoid firing on every `Read`. To dodge issue #29724, make the command path include a kit-unique segment (`memkit/bin/...`) so it cannot collide with other plugins. To dodge #24115 during development, install via `--plugin-dir` only (no marketplace registration).

---

## QUESTION 2 — AI compression for session summarization

### 2.1 Existing-system survey

**Named systems**
- **Mem0** — extraction-as-a-service; per Mem0's own published numbers (docs.mem0.ai highlights), "Mem0 achieves 26% higher accuracy than OpenAI Memory, 91% lower latency, and 90% token savings!"; uses GPT-4o-mini by default; offers a self-hostable OSS variant.
- **Letta (formerly MemGPT)** — OS-inspired tiered memory; the agent itself decides when to spill from "core" to "archival" memory via tool calls. Self-hostable.
- **Cognee** — knowledge-graph-first with 14 retrieval modes; favors graph extraction over flat summarization.
- **Zep / Graphiti** — temporal knowledge graph, async background extraction. Apache-2.0 self-host path.

**Novel finds (2025-2026)**
- **NOVEL: LightMem (arXiv:2510.18866, zjunlp et al., accepted ICLR 2026)** — three-stage architecture (sensory → topic-aware short-term → sleep-time long-term). Verbatim claim from the paper: *"On LongMemEval and LoCoMo, using GPT and Qwen backbones, LightMem consistently surpasses strong baselines, improving QA accuracy by up to 7.7% / 29.3%, reducing total token usage by up to 38× / 20.9× and API calls by up to 30× / 55.5×."* Strongest 2025 evidence for **offline batch consolidation** rather than per-turn LLM extraction. Repo: `github.com/zjunlp/LightMem`.
- **NOVEL: SGMem (arXiv:2509.21212)** — sentence-graph memory that operates at sentence granularity with cross-session aggregation; outperforms session-level retrieval baselines.
- **NOVEL: A Simple Yet Strong Baseline (arXiv:2511.17208, Zhou et al., Nov 2025)** — argues for **non-compressive enriched EDUs (elementary discourse units)** rather than aggressive summarization: *"we instruct an LLM to decompose each session into enriched elementary discourse units… self-contained statements with normalized entities."*
- **KVzip (arXiv:2505.23416, Kim et al.)** — verbatim: *"KVzip reduces KV cache size by 3-4× and FlashAttention decoding latency by approximately 2×, with negligible performance loss in question-answering, retrieval, reasoning, and code comprehension tasks. Evaluations include LLaMA3.1-8B, Qwen2.5-14B, and Gemma3-12B, with context lengths reaching up to 170K tokens."* Runs locally — relevant for air-gapped deployments.
- **ProMem ("Beyond Static Summarization", arXiv:2601.04463)** — adds a "self-questioning" extraction phase to fix HaluMem's "missing information accumulation" problem.

### 2.2 Cost & frequency matrix (Anthropic models, May 2026)

| Model | Input $/MTok | Output $/MTok | Compression cost (30 KB tx → 700 char summary)¹ | Quality for headings/IDs/citations |
|---|---|---|---|---|
| **claude-haiku-4-5** (`claude-haiku-4-5-20251001`) | $1 / $5 (batch $0.50/$2.50) | | ~$0.0001–0.0005 | Good; reliably preserves bullet lists and short IDs |
| **claude-sonnet-4-6** (`claude-sonnet-4-6`) | $3 / $15 (batch $1.50/$7.50) | | ~$0.0004–0.0015 | Excellent; preserves citation chains and reasoning |
| **claude-opus-4-7** | $5 / $25 | | $0.0007–0.0025 | Overkill for compression |

¹ ≈ 7,500 input tokens + 200 output tokens; with caching of system prompt down to ~10% input cost.

**Compression-frequency matrix**

| Cadence | Latency cost | API cost (Haiku 4.5, 10 sessions/day) | Drift risk | Best fit |
|---|---|---|---|---|
| Every turn (PostToolUse) | +1-3 s per turn | $0.05-0.30/day | Low — bullets stay aligned to events | Tight coupling to commits |
| **Rolling window every N turns (N≈5-10)** | Async, none felt | $0.01-0.05/day | Low; LightMem-validated | **Recommended default** |
| SessionEnd only | None during session | $0.002-0.01/day | Medium — late-session drift | Long-running sessions |
| Daily cron (sleep-time) | None | $0.001-0.005/day | High — multi-pass loss documented as "summarization drift" | Batch consolidation only |

### 2.3 Recommendation

**Two-stage compression, mirroring LightMem:**

1. **Per-tool, online (cheap):** A lightweight regex/jq filter (no LLM) strips tool output to "what was read/written/decided" — runs in PostToolUse async hook, costs $0.
2. **Rolling window every ≈5 turns + Stop hook (Haiku 4.5):** Compresses last N filtered observations into a 500-1000-char durable summary with preserved heading hierarchy and citation IDs.
3. **SessionEnd consolidation (Haiku 4.5, optionally Sonnet 4.6 for high-stakes projects):** Final session summary written to `memory/sessions/YYYY-MM-DD-<sid>.md` (source of truth).

**Prompt skeleton (preserves headings/IDs/citations):**

```
You are a memory compressor. Output exactly the following Markdown:

## Decisions
- <≤80 chars>. cites: [#P-XXXXXX, …]

## Open Questions
- <≤80 chars>

## Files Touched
- path: <relative path> — <verb> (cites: [#P-XXXXXX])

Hard rules:
1. Preserve any citation ID (matches /#[ULP]-[A-Z0-9]{6,8}/) verbatim.
2. Total output ≤ 1000 characters.
3. If a section has no entries, omit the heading.
4. Never invent new IDs.

INPUT:
<the rolling-window transcript>
```

**Failure handling:** Wrap each Haiku call with (a) 30 s timeout, (b) retry-once with exponential backoff, (c) on second failure, write a stub observation containing the raw filtered text with `compression: failed` frontmatter and continue. **Never** block the user-facing session on compression. claude-mem documents this as "Graceful hook failures — hooks exit 0 with empty responses instead of crashing."

**Air-gap variant for the bank:** swap the Haiku client for an in-tenant Bedrock endpoint (claude-haiku-4-5 is GA on Bedrock) or for a locally-hosted Llama-3.1-8B-Instruct summarizer (KVzip-style local compression) through a thin compatibility shim. The prompt above is model-agnostic enough to survive that swap.

---

## QUESTION 3 — Citation ID generation

### 3.1 Existing-system survey

| System | Format | Length | Sortable | Notes |
|---|---|---|---|---|
| **thedotmack/claude-mem** | `INTEGER PRIMARY KEY AUTOINCREMENT`; rendered `#123`. Session anchors `S<n>` | Variable | Yes (insert order) | Not portable across machines — collisions on merge |
| **codenamev/claude_memory** | Predicate + entity-typed facts (no exposed numeric ID) | n/a | n/a | Truth maintenance via supersession |
| **Logseq** | UUID block IDs in frontmatter | 36 char | No | Per Logseq forum: "block references are logseq specific, meaning blocks are referenced by the block's UUID, which is only known within the LogSeq application" — non-portable |
| **Roam** | 9-char hash | 9 char | No | Stable within Roam graph |
| **Notion** | UUID v4 | 36 char | No | Hidden behind page URLs |
| **BibTeX** | Human-mnemonic (e.g., `kim2025kvzip`) | 10-20 char | Sort by author-year | Survives consolidation because mnemonic, not random |
| **DOI** | Prefix/suffix | Variable | No | Registered authority |
| **NanoID** | URL-safe random | Configurable | No | Fast, customizable alphabet |
| **ULID** | Base32 timestamp + random | 26 char | Yes | Per Nima Karimian Kakolaki, *"A Comparative Analysis of Identifier Schemes: UUIDv4, UUIDv7, and ULID for Distributed Systems"* (arXiv:2509.08969, Sep 10 2025): "statistical analysis further shows ULIDs offer a 98.42% lower collision risk compared to UUIDv7, while maintaining negligible collision probabilities even at high generation rates." |
| **KSUID** | 160-bit, base62 | 27 char | Yes | Larger entropy than ULID |
| **UUIDv7** | Time-ordered UUID | 36 char | Yes | RFC 9562 standard |

### 3.2 Tradeoff matrix for memory observations

| Scheme | Length | Collision prob (10⁶ items) | Stable across machines? | Survives consolidation? | Citeable in Markdown? |
|---|---|---|---|---|---|
| Auto-increment INT | 1-7 char | 0 (per-DB) | **No** | **No** — IDs shift on merge | Yes (`#123`) |
| UUIDv4 | 36 | ~0 | Yes | Yes (random) | Ugly |
| **6-char base32** | 6 | ~0.4% at 10⁶ | Yes | Yes if globally generated | **Excellent** (`#P-7Q3K2A`) |
| **8-char base32 (≈40 bits)** | 8 | ~9·10⁻⁷ at 10⁶ | Yes | Yes | **Excellent** (`#P-7Q3K2A4F`) |
| Hash-of-content (SHA-256 → 8 char) | 8 | ~10⁻⁶ + content collisions | Yes | **Best** — same content = same ID; idempotent | Excellent |
| ULID | 26 | ~0 | Yes | Yes | Acceptable |
| BibTeX-style mnemonic | 10-20 | n/a (human-chosen) | Yes | Yes (semantic) | Best for humans |

### 3.3 Recommendation

**NOVEL pattern:** Use **content-addressed hash IDs with tier prefix**: `<tier>-<base32(SHA-256(canonical_text))[:8]>`

```
U-7Q3K2A4F   ← user-tier observation
P-A8FN3MQ2   ← project-tier
L-K1B0X9YZ   ← local-tier
S-2026Q2-001 ← session marker (human-mnemonic, BibTeX-style)
```

**Why:**
1. **Survives consolidation:** If two rolling-window passes produce the same bullet text, they hash to the same ID — natural dedup. Different text → different ID.
2. **Survives 3-tier merge:** Prefix prevents collisions across scopes even if hashes coincide.
3. **Stable across machines / air-gapped clones:** No clock, no counter, no central authority.
4. **Markdown-citeable:** `#P-A8FN3MQ2` reads cleanly in prose and survives copy-paste.
5. **6 chars ≈ 30 bits** is too risky at 10⁶ scale (≈40% chance of collision); **8 chars ≈ 40 bits** gives ≈ 10⁻⁶ collision probability per pair at 10⁶ — acceptable, and you have content+tier as natural disambiguators.

**Consolidation merging rule:** When the compressor merges bullets A (`#P-AAAAAAAA`) and B (`#P-BBBBBBBB`) into C, store C's frontmatter as `merged_from: [P-AAAAAAAA, P-BBBBBBBB]`. The merged bullet gets a *new* hash ID. This mirrors how DOIs handle deprecation (the old DOI never dies; it just points to the new one).

---

## QUESTION 4 — Markdown-as-source + SQLite-as-cache patterns

### 4.1 Existing-system survey

**Named tools**
- **Obsidian** — markdown source of truth; ad-hoc indexes in-memory; no first-party SQLite. Various community plugins.
- **Logseq** — markdown source + per-graph index; UUID block IDs.
- **Foam** (foambubble/foam) — VS Code extension; in-memory graph index; community discussion (`#1369`) about SQLite indexer never landed.
- **vimwiki** — flat markdown, no index.

**Novel finds**
- **Fail-Safe/Noema** — explicit "Plain markdown on disk as the source of truth; a local SQLite database with FTS5 as the index. No cloud, no API keys, no telemetry." File-watcher pushes editor edits through the same event path as MCP writes. Peer-to-peer federation with vector clocks. **Closest architectural sibling to claude-memory-kit's stated goals.**
- **sqliteai/sqlite-memory** — SQLite extension giving "agents persistent, searchable memory, optimized for markdown content. Features hybrid semantic search (vector similarity + FTS5), markdown-aware chunking, and local embedding via llama.cpp." Explicitly: "markdown files as the source of truth."
- **willynikes2/knowledge-base-server** — Obsidian-as-source + SQLite-FTS5-as-cache + MCP. "Obsidian is the source of truth — the human layer where you organize, link, and curate knowledge. The KB server is the optimized retrieval layer."
- **pmmvr/obsidian-index-service** — file-watcher → SQLite (WAL mode) for concurrent access; minimal, single-purpose. Good reference for the indexer process.
- **SilverBullet** — markdown files on disk, no DB for content; objects derived from frontmatter via Lua scripting. Less applicable but interesting for self-hosting.

### 4.2 Reindex-strategy matrix

| Tool | Strategy | Latency at 10k docs | Concurrent-write story |
|---|---|---|---|
| Obsidian core | In-memory rescan on launch | <1 s | Single-process (Electron) |
| Foam | In-memory rescan on workspace open | seconds | VS Code single-process |
| **Noema** | File-watcher → event log → SQLite incremental | sub-second per file | Vector clocks + divergence traces |
| **obsidian-index-service** | File-watcher → SQLite WAL | sub-second per file | WAL mode allows N readers, 1 writer |
| **sqlite-memory** | Triggers in SQLite mirror writes to FTS5 + vector | μs per row | Single-process |
| **willynikes2/kb-server** | Hash-diff on ingest, incremental | sub-second per changed file | Single writer; readers via MCP |

### 4.3 Recommendation

**Architecture:** Markdown files in `memory/` are the source of truth. SQLite at `.claude/memkit/index.db` is a **rebuildable cache**, gitignored, with FTS5 over `(title, text, headings, citations)` and an explicit `INTEGER source_mtime`.

**Reindex strategy (hybrid):**
1. **Boot:** Walk `memory/`, compare each file's `mtime`+`sha1` against `files(path, mtime, sha1)` table. Reindex only diffs. This is hash-diff, not full rebuild.
2. **Runtime:** A `fswatch`/`inotify` process (or `chokidar` if Node) re-indexes on FS event. Debounce 500 ms.
3. **Catastrophic recovery:** `memkit rebuild --from-markdown` drops the DB and rebuilds. SHA-256 manifest at `memory/.manifest` lets you detect tampering.
4. **Concurrency:** Open SQLite with `PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;` — supports many concurrent readers (MCP server) + one writer (the indexer process). Per coddy.tech FTS5 guide, use triggers on the canonical table to mirror to FTS5.

**Schema sketch (FTS5 contentless not used — keep text in canonical table):**

```sql
CREATE TABLE observations (
  id TEXT PRIMARY KEY,           -- e.g., 'P-7Q3K2A4F'
  tier TEXT NOT NULL CHECK(tier IN ('U','P','L')),
  path TEXT NOT NULL,            -- relative markdown path
  heading_path TEXT,             -- 'Decisions > Auth'
  body TEXT NOT NULL,
  cites TEXT,                    -- JSON array of cited IDs
  created_at INTEGER NOT NULL,   -- epoch
  source_sha1 TEXT NOT NULL      -- of containing markdown file
);
CREATE VIRTUAL TABLE observations_fts USING fts5(
  body, heading_path,
  content='observations', content_rowid='rowid',
  tokenize='porter unicode61'
);
-- + AFTER INSERT/UPDATE/DELETE triggers
```

This mirrors thedotmack/claude-mem's schema (observations + observations_fts contentless FTS5), but **with content-addressed IDs and explicit `source_sha1` tying every row back to its markdown line**. (claude-mem's real schema, from `src/services/sqlite/migrations.ts`, uses an `INTEGER AUTOINCREMENT id` and adds AI-extracted hierarchical fields `title, subtitle, narrative, facts, concepts, files_read, files_modified` — useful columns to borrow.)

---

## QUESTION 5 — MCP server design for memory exposure

### 5.1 Existing-system survey

**Named systems**
- **claude-mem MCP** (`src/servers/mcp-server.ts`) — 4 core tools plus 6 corpus tools added in v13:
  - `search(query, limit, project, type, dateStart, dateEnd, offset, orderBy)` — compact index ~50-100 tokens/result.
  - `timeline(anchor, query, depth_before, depth_after)` — anchor can be numeric, `S<n>`, or ISO timestamp.
  - `get_observations(ids)` — full details, ~500-1000 tokens/result.
  - Plus `build_corpus`, `list_corpora`, `prime_corpus`, `query_corpus`, `rebuild_corpus`, `reprime_corpus`.

- **modelcontextprotocol/servers — `src/memory`** (Anthropic-managed, knowledge-graph based). **9 tools, verbatim:** `create_entities`, `create_relations`, `add_observations`, `delete_entities`, `delete_observations`, `delete_relations`, `read_graph`, `search_nodes`, `open_nodes`. Storage: JSONL at `MEMORY_FILE_PATH`. **Known schema bug** (#3074, #3144): `read_graph`/`search_nodes`/`open_nodes` emit a `type: "entity"` field that fails output schema validation — unfixed as of release `2025.11.25`. Data model: `Entity { name, entityType, observations[] }`, `Relation { from, to, relationType }` in active voice.

- **mem0ai/mem0-mcp** — 8 tools: `mem0-memory-add`, `mem0-memory-search`, `mem0-memory-list`, `mem0-memory-get`, `mem0-memory-update`, `mem0-memory-delete`, `mem0-memory-delete-all`, `mem0-list-entities`.

**Novel finds**
- **doobidoo/mcp-memory-service** (v10.60.0) — multi-backend (SQLite-vec, Milvus, Cloudflare Vectorize), OAuth, REST API + MCP, autonomous consolidation with temporal contradiction detection. The project's README (via Glama mirror of `github.com/doobidoo/mcp-memory-service`) self-reports: "Using `memory_store_session` (added in v10.35.0) brings our score to 86.0% R@5" — figure is self-reported, tied specifically to the session-level storage mode introduced in v10.35.0, not the default turn-level mode.
- **NOVEL: jean-technologies/jean-memory** — combines mem0 + graphiti through a single MCP. 169 ⭐, May 2026 active.
- **NOVEL: ssmirnovpro/extended-memory-mcp** — cross-session continuity for Claude Desktop specifically.
- **NOVEL: pmmvr/obsidian-index-service** — not an MCP itself but designed as the data plane behind one. The architectural separation (file-watcher writes SQLite; MCP reads SQLite read-only via Docker volume) is the cleanest air-gap pattern in this list.
- **knowall-ai/mcp-neo4j-agent-memory** — graph-DB-backed memory MCP.
- **JamesANZ/memory-mcp** — multi-LLM memory store.

### 5.2 Tool-shape matrix

| Pattern | Pros | Cons |
|---|---|---|
| **Few high-level tools (claude-mem: 4)** | Lower context overhead per session; agent rarely confused about tool choice | Hides power; bulk operations need extra calls |
| **Many fine-grained tools (Anthropic memory: 9)** | CRUD-complete; clear semantics | Tool-selection burden; `create_entities` vs `add_observations` confusion |
| **Backend-agnostic skill + thin MCP (danielrosehill/Claude-User-Memory-Plugin v2)** | Vendor-portable; per-workspace `memory-config.md` | One more config file users must maintain |
| **Manual + auto save (mem0-mcp `save_memory` PR #662)** | Explicit user control alongside auto-capture | Two write paths to keep consistent |

### 5.3 Recommendation

**Ship a 5-tool MCP** (close to claude-mem, with two adjustments):

1. `mk_search(query, limit?, tier?, since?, until?)` — BM25 + optional vector hybrid. Returns `[{id, heading, snippet, score}]`. ≤ 100 tokens/result.
2. `mk_get(ids: string[])` — full body + frontmatter + citations. ≤ 1000 tokens/result.
3. `mk_timeline(anchor, depth_before?, depth_after?)` — sequential context window around an ID or ISO timestamp.
4. `mk_cite(id) → markdown_link` — returns the canonical citation URL (e.g., `[#P-7Q3K2A4F](memkit://obs/P-7Q3K2A4F)`) for the agent to embed in chat.
5. **NOVEL: `mk_remember(text, tier="P", cites?: string[])`** — explicit user-driven save. Mirrors mem0's `save_memory`; addresses the regulated-bank case where some captures *must* be deliberate (audit trail).

**When to use MCP vs hooks vs skills:**
- **Hooks** = involuntary lifecycle automation (capture on Stop, inject on SessionStart). Hidden from Claude.
- **MCP** = explicit retrieval/write tools Claude calls when reasoning needs them. Visible.
- **Skills** = SKILL.md files that teach Claude *when* to call the MCP tools. Cheap to update.

For claude-memory-kit, the canonical pattern is: hooks **write** automatically; skills **teach Claude when to read**; MCP **provides** the read tools. This matches the consensus in `mem-search` and `recall` plugins and avoids the failure mode where Claude either over-saves (hook + MCP both writing) or never-recalls (writes happen but Claude doesn't know to query).

**Error handling pattern (from doobidoo/mcp-memory-service v10.59.x):** Reflect state verbatim per RFC 6749 §4.1.2 for OAuth flows; return structured error objects with `code`, `message`, `recoverable: bool`. Symmetric project-affinity prevents stale cache hits.

---

## QUESTION 6 — Three-tier scope merging

### 6.1 Existing-system survey

| System | Order (highest → lowest) | Merge rule | Documented pitfall |
|---|---|---|---|
| **Git config** | local → global → system → compiled default | **First match wins** (per key) | Surprising precedence: `git config --list --show-origin` is the canonical debug tool |
| **VS Code settings** | workspace → user → default | Last-write per key, but with caveats | Issue #292016: opening a single file mutates user settings that then "leak" into workspaces |
| **kubeconfig** (KUBECONFIG=) | leftmost file wins per key/value | Kubernetes docs: "The first file to set a particular value or map key wins. Never change the value or map key" | Name collisions (two "default" contexts) silently drop one — must `rename-context` first |
| **direnv .envrc** | Single matched file; **no cascade** | None (issues #111, #360, #652, #757, #807, #1432 all asking for cascading) | Frequent user surprise — child `.envrc` *replaces*, doesn't merge |
| **Helm values** | `--set` CLI > `-f` later files > `-f` earlier files > parent chart values > child chart defaults | Deep-merge for maps, override for scalars | Order of `-f` flags matters; YAML lists fully replace, never merge |
| **npm workspaces** | workspace pkg → root pkg | Resolution algorithm | Conflicting peer deps surface only on install |

**Novel finds**
- **rustup / nvm / asdf / pyenv** — all use a "shim + version file" pattern. asdf reads `.tool-versions` walking up the directory tree (cascading) and the **closest file wins per tool** — closer to direnv-but-correct. Worth borrowing for tier resolution.
- **chezmoi / yadm** — dotfile managers handle machine-vs-user with templating rather than precedence: variables like `{{ if eq .chezmoi.hostname "work-laptop" }}` produce different rendered output per machine. Useful for the bank's air-gap variant where some memory must never leave a specific host.
- **Nix overlays** — function composition: `final: prev: { ... }` lets each tier *transform* the previous tier rather than just override. Powerful but high learning curve.

### 6.2 Tradeoff matrix

| Strategy | Predictability | Power | Surprise factor |
|---|---|---|---|
| First-match-wins (Git, kubeconfig) | High | Low | Low — but only if users know the order |
| Last-write-wins (VS Code) | Medium | Low | Medium — leaks between scopes |
| Deep-merge (Helm) | Low | High | High — list-vs-map semantics confuse |
| Closest-file-wins (asdf .tool-versions) | High | Medium | Low |
| Templated render (chezmoi) | Medium | Very high | Medium — debugging hard |
| Function composition (Nix overlays) | Low | Very high | High |

### 6.3 Recommendation

For claude-memory-kit, **adopt Git's first-match-wins semantics at the *observation-ID* level, with deep-merge at the *settings* level**:

```
.claude/memkit/settings.json   ← local (highest)
.memkit/settings.json          ← project (committed, mid)
~/.memkit/settings.json        ← user (lowest)
```

Resolution at SessionStart:
1. Read all three files; deep-merge `settings.json` (scalar override, list concatenate with dedup by ID).
2. For observations: **union** the three tiers into one view, tagged by tier prefix (`U-` / `P-` / `L-`). If two observations have the same ID across tiers — which under content-addressed hashing means same text — keep the one from the most-specific tier and add a `shadowed_by: [tier]` log line to a debug file.
3. **Pitfall to avoid** (lessons from direnv issues): document the precedence in plain English in `memkit doctor` output, and ship `memkit config --show-origin` (mirroring `git config --show-origin`) so users can answer "where does this setting come from?" in one command. This single debug command is the difference between adopters and rage-quitters.
4. **Never** auto-write to a higher scope. If a user runs `memkit remember "X"` from a project, write to project; from `~`, write to user. Explicit `--tier local|project|user` for overrides. (VS Code's #292016 bug is the cautionary tale.)

**For the bank specifically:** add a `--tier machine` (chezmoi-style) for observations that must never leave the host. Implement by storing them in `~/.memkit/machine/<hostname>/` and **never** syncing to git. The audit story: `memkit audit` prints every observation, its tier, its citation ID, and whether it has ever been exported.

---

## Recommendations (staged)

**Stage 1 — Prototype (week 1-2)**
- Fork the directory layout of `Fail-Safe/Noema` (markdown + SQLite-FTS5 + filesystem watcher).
- Implement 5 hooks + 1 setup hook per Q1.3.
- Single MCP tool: `mk_search`. Defer the others.
- IDs: content-addressed 8-char base32 with `U-/P-/L-` prefix.
- Compressor: Haiku 4.5 via API; rolling window every 5 turns + Stop hook.

**Stage 2 — Pilot (week 3-6)**
- Add `mk_get`, `mk_timeline`, `mk_cite`, `mk_remember`.
- Add 3-tier merging with `memkit config --show-origin` debug.
- Add `memkit doctor` and `memkit rebuild --from-markdown`.
- Benchmark on LongMemEval; goal: ≥ 80% R@5 with rolling-window compression.

**Stage 3 — Production for regulated workloads (week 7-12)**
- Pluggable compressor: shim Haiku 4.5 (dev) ↔ Bedrock Anthropic (prod) ↔ local Llama-3.1-8B (air-gapped tier, KVzip-compatible).
- `--tier machine` for never-sync observations.
- Audit log (`memkit audit`) covering every export.
- Internal security review: confirm no MCP tool can exfiltrate via `tool_input` echo (claude-mem v10.x learned this lesson with CORS restricted to localhost + DOMPurify XSS hardening).

**Benchmarks/thresholds to change recommendations**
- If compression latency on Haiku 4.5 routinely > 3 s p95 → switch to async-only (Stop+SessionEnd only, drop rolling window).
- If 8-char hash IDs show > 0.01% real collisions in prod corpus → migrate to 10 chars.
- If LongMemEval R@5 < 70% → add a vector index (e.g., sqlite-vec) alongside FTS5.
- If Anthropic ships first-class `Memory` MCP primitives beyond the current knowledge-graph server at `modelcontextprotocol/servers/src/memory` → reassess whether to depend on it directly.

## Caveats

- **claude-mem star count appears inflated** in some GitHub UI pages (issue listings show 72.7k stars/6.2k forks — unusual for a year-old single-maintainer plugin); treat with skepticism.
- The **Anthropic memory MCP `read_graph` schema bug** (#3074, #3144) is unfixed as of `2025.11.25`. Do not depend on it directly today.
- Several "comparison" pages cited (omegamax.co, evermind.ai, maximem.ai) are **vendor-published** and their published LongMemEval scores favor the publisher. The independently-run **Synap harness** is the closest thing to a neutral benchmark. doobidoo/mcp-memory-service's 86.0% R@5 is self-reported on the project's own README and tied to a specific storage mode (`memory_store_session`).
- The **LightMem** quantitative claims (38× token reduction) are from the authors' own benchmark (zjunlp / Zhejiang University NLP Group, accepted ICLR 2026); independent replication on LongMemEval is in progress but not yet conclusive.
- **claude-code-hooks-mastery** and several other community guides reference up to 29 hook events (March 2026); claude-memory-kit's stated scope is the 6 "stable" events, which is the right conservative choice — peripheral events (Setup, InstructionsLoaded, UserPromptExpansion, Elicitation, ElicitationResult) churn frequently.
- The bank's air-gap requirement makes any compressor-via-public-API design non-starter. The local-Llama fallback path (KVzip-style or vanilla summarization) is essential and should be in scope from week 1, not deferred.
- Issue **anthropics/claude-code #29724** (command-template deduplication) means you MUST give every hook command a kit-unique prefix. If you don't, another plugin's identically-named hook will silently win.
- Mem0's headline "90% token savings" comes from the vendor's own marketing (docs.mem0.ai); the "80%" figure widely repeated in third-party comparisons is a slight rounding-down of that same self-reported number. No independent benchmark currently confirms either figure on a standardized harness.