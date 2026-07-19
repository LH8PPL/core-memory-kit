---
date: 2026-07-19
topic: Task 149 — recall-trigger architecture study (15 systems code-verified + 4 closed products docs-level) feeding the recall-architecture ADR
source: Cloned repos read directly (the D-153 discipline — code, not note summaries) + primary web sources for the uncloneable systems + the closed-products docs track
tags: [recall, trigger, research, ADR-0024, D-362, task-149]
---

# Recall-trigger architecture study (Task 149) — feeds ADR-0024

**Kit baseline (verified):** already a three-surface hybrid — (1) SessionStart frozen
snapshot ≤14,500 B (`inject-context.mjs:221`) with the authority preamble whose last line
points at `cmk search`; (2) a per-prompt STATIC nudge (`capture-prompt.mjs:53-73`, ≥10-char
gate copied from memsearch) that performs NO search; (3) the judgment-pulled `memory-search`
skill ladder (fork-context, description-triggered, stop-at-shallowest-rung).

## The per-system verdicts (each from the actual code; evidence quoted in the task transcript)

| System | Model | Deciding evidence |
| --- | --- | --- |
| graphiti (Zep MCP) | judgment-pulled | tools + instructions blob; rerank floors `reranker_min_score` inside RRF (`search.py:374`) |
| mem0 | SPLIT: library = host decides; `proxy/` = **always-search** | proxy splices memories into every user message (`proxy/main.py:105-110`), query = last 6 messages (:168), floor 0.1 (`memory/main.py:1341`) |
| MemoryOS (BAI-LAB) | **always-search** | retrieval is step 1 of `get_response` (`memoryos.py:262-276`); 0.1 thresholds |
| MemOS (MemTensor) | always-search in its own chat loop; judgment-pulled MCP beside it | unconditional `text_mem.search` per cube in `chat()` (`core.py:292-301`) |
| cognee (MCP) | judgment-pulled | search-type taxonomy in tool descriptions (`server.py:496-548`) — FEELING_LUCKY picks the TYPE, never WHETHER |
| basic-memory (MCP) | judgment-pulled | tool descriptions + an `ai_assistant_guide` MCP resource |
| sift-kg | judgment-pulled CLI (build-time KB) | `sift query/search --json` "for agents" |
| iwe (MCP/LSP) | judgment-pulled | BM25+fuzzy RRF, token caps (`iwec/src/lib.rs:200-294`) |
| **claude-mem** | **hybrid, 4 surfaces** | SessionStart inject; a 3-layer `__IMPORTANT` meta-tool ladder ("search → timeline → get_observations… NEVER fetch full details without filtering — 10x token savings", `mcp-server.ts:439-471`); **per-prompt semantic inject built but DEFAULT-OFF, "experimental"** (`SettingsDefaultsManager.ts:142`); a PreToolUse:Read file-context trigger with an mtime staleness gate (`file-context.ts:246-256`) |
| captain-claw | always-leaning hybrid | per-turn semantic note pipelined (`agent_context_mixin.py:3508`), deep tools pulled |
| pro-workflow | hybrid: cheap always-search emitting POINTERS + pull for bodies | FTS5 over every ≥3-word prompt, 3 slug+title pointers + "use /wiki ask" (`prompt-submit.js:90-98`) — caveat: emitted via stderr, may reach the human not the model |
| pulse8 cortex | judgment-pulled (MCP) | `vault_context` ranked subgraph; no hooks in repo |
| **Memora** | **always-search entry, LLM-policy DEPTH** | "Initial retrieval has ALREADY been performed" (`prompted_policy_retriever.py:31`); mandatory step 0 (:366); LLM post-filter keep≥2 (`memory_filter.py:155`) — **nuance for the kit's earlier note: Memora validates the LADDER, not the trigger** (it never decides whether to recall) |
| memsearch | the kit's model, verbatim source | ≥10-char gate + static systemMessage hint + fork skill ladder (raw hook fetched) |
| MemPalace | judgment-pulled (instructed wake-up call) | CLAUDE.md instructs `mempalace_status` first (docs-level) |
| claude-remember | **inject-everything, no recall trigger at all** | SessionStart injects the entire tier stack; no search capability (docs-level) |
| Cursor/Kiro/ChatGPT/Antigravity | see the closed-products section below | docs-level track |
| **Letta** (same-day deep-read) | judgment-pulled with engineered scaffolding | doctrine + tool-strategy + **existence advertisement** (`prompt_generator.py:26-89`); archival tools DEPRECATED — the lineage is growing the pushed surface ([letta note](2026-07-19-letta-deep-read.md)) |

**Closed products** (docs-level track, delivered 2026-07-19): none of the four does
per-query semantic retrieval as its primary path. Cursor's Memories were auto-generated
RULES (feature since REMOVED 2.1.x — rules remain, incl. agent-requested = judgment);
Kiro steering = pure rules-engine injection (`inclusion: always`/`fileMatch`/`manual`),
no retrieval; ChatGPT = saved memories injected wholesale into `Model Set Context` + an
OFFLINE-synthesized chat-history dossier (the "dreaming" background process — NOT live
retrieval, per Rehberger/Willison RE); Antigravity = KI-summary injection at session start
+ agent-decided deep pulls (feature reliability disputed in Google's own forum).

## The tally — and the pattern that explains it

Judgment-pulled 7 · always-search 5 · inject-everything 1 · position-hybrid 3 (+ the kit).
**The recall model follows who OWNS the conversation loop:** systems owning their chat loop
pipeline retrieval (one line of code; benchmarks reward it); MCP-server systems are
structurally judgment-pulled (a tool description is their only trigger surface); and every
system in the kit's exact position — a Claude Code plugin with hooks AND tools (memsearch,
claude-mem, pro-workflow) — **converges on the kit's hybrid**, with the one true per-prompt
semantic-inject implementation (claude-mem) shipped default-off as "experimental".

## The arguments (3 + 3), condensed

**Keep judgment-pulled:** (1) position-peers converge on it and the defector ships its
always-search default-off; (2) Memora's ablations show the multi-step LADDER beats one-shot
retrieval (0.863 > 0.825 at ~98% fewer tokens) — the skill IS a prompted policy retriever;
(3) always-search pays a filtering tax (Memora's per-turn LLM filter; 0.1 floors everywhere)
and latency (4.6s vs 0.23s) the judgment gate never pays on "ok"/"go" turns.

**Move to always-search:** (1) "the model decides" is a documented failure mode in the kit's
own history (D-40; the D-153 under-fire; native-memory nondeterminism) — a pipeline never
forgets; (2) every measured-recall leader pipelines, and NOBODY benchmarks the trigger — the
kit's weakest link is the thing the field never measures; (3) cheap-index always-search is
nearly free in the hook the kit already pays for (pro-workflow: FTS5 pointers per prompt;
claude-mem's gates ≥20 chars / top-5).

## The recommended HYBRID (no surveyed system has fully composed it)

1. KEEP the bounded snapshot + authority preamble (the field's convergent floor).
2. **Upgrade `buildMemoryHint` static hint → gated evidence-bearing cheap search:** on
   UserPromptSubmit ≥ ~20 chars, run the EXISTING FTS5 index over the prompt terms; if the
   top hit clears a bm25 gate, inject ≤3 INDEX LINES (id · title · date — never bodies) +
   "run the memory-search skill for the full ladder"; else the current static hint. Zero
   LLM/embedding on the hot path; composition-check the hook latency budget + the D-122
   fire-rate trend.
3. KEEP the skill as the deep ladder (the Memora-validated policy retriever), enriched with
   the in-skill borrowables below.
4. OPTIONAL third trigger: claude-mem's PreToolUse:Read file-context (facts whose
   `source_file` is being read, mtime-gated) — event-triggered, no model judgment.
5. Letta's **existence advertisement** joins the snapshot: live counts + scope inventory
   ("N facts; scopes: decisions/transcripts; last write …") — the model can't decide to
   search what it doesn't know exists.

## Borrowables (top set, file:line in the transcript + letta note)

Memora in-skill relevance scoring (score survivors 1-3, fetch bodies ≥2 only) · Memora
episodic grouping → "hits sharing a source_file: one `cmk expand`, not N bodies" · Memora
RE_QUERY relative-answer rule ("same college as Sarah" → re-query the referent) · claude-mem
file-context mtime gate · claude-mem `__IMPORTANT` meta-tool (ship the ladder MCP-natively
for skill-less hosts) · graphiti `reranker_min_score` floor for the hint gate · mem0
last-6-messages query shaping for terse follow-ups · Letta `<memory_metadata>` + `read_only`
flag + sleep-time division-of-labor (→ Task 95).

## Honest gaps

Docs-level only: claude-remember, MemPalace wake-up, mem0's OpenMemory MCP; memsearch skill
body verified from docs not raw-fetched; pro-workflow's stderr-vs-context injection intent
unverified; cognee/MemOS/captain-claw inner thresholds not traced; **MemoryOS (BAI-LAB) ≠
memory-os (ClaudioDrews)** — cite distinctly. All dropped sub-agent tracks were re-done by
direct reads; nothing rests on unreturned output.

**Verdict → [ADR-0024](../adr/0024-recall-architecture-judgment-pulled-hybrid.md):** keep
judgment-pulled as the deep spine; close the under-fire risk with the gated cheap-index
pointer upgrade + existence advertisement; adopt the in-skill refinements. D-362.
