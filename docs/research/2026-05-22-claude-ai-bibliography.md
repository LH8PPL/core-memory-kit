---
date: 2026-05-22
topic: Bibliography flattening of Option-B (Claude.ai) research report
source: Claude.ai (follow-up bibliography prompt)
related_research: [2026-05-21-claude-ai-deep-research-option-b]
status: verified by Claude (Opus 4.7) on 2026-05-22 — all 11 cited repos and ProMem arxiv ID confirmed via gh api + WebFetch
tags:
  - bibliography
  - claude-ai
  - sources
  - personal-wiki-ingest-ready
---

# Bibliography — claude-memory-kit research report

> Editorial preface added by Claude Opus 4.7 on 2026-05-22 when the file was moved into `research/`.
>
> **Verification status**: every repo listed below was independently verified via `gh api` and exists at the URL given with the metadata reported. The arxiv ID for ProMem (2601.04463), which Claude.ai flagged as questionable, **is valid** — it's a real paper from January 8, 2026 by Chengyuan Yang, Zequn Sun, Wei Wei, Wei Hu, titled *"Beyond Static Summarization: Proactive Memory Extraction for LLM Agents."* The 2601 prefix is January 2026 in arxiv's YYMM.NNNNN scheme, not a typo.
>
> ✓ marks in `SOURCES.md` were updated to reflect this independent verification.

## Original Claude.ai bibliography

(Below this line is the verbatim Claude.ai output, including its own editorial preface.)

---

This is a bibliography compilation task on the previous research output — no new research needed. The user just wants the citations from the prior report flattened into a verifiable list. I'll produce it directly from the citations already in that report rather than launching another research job.

## Bibliography — Option-B research output (original Claude.ai title)

All sources public unless flagged otherwise. Dates are best-effort; where the source doesn't expose a clear publish date I mark it "n/d" (not dated).

---

**claude-mem (repository root)**: https://github.com/thedotmack/claude-mem
- Type: repo
- Date: actively updated through 2026-05
- Note: Primary reference architecture (6 hooks, MCP server, SQLite+FTS5). Cited for hook layout, compressor design, and the v13 corpus tools.

**claude-mem CLAUDE.md**: https://github.com/thedotmack/claude-mem/blob/main/CLAUDE.md
- Type: repo (file)
- Date: n/d (latest main)
- Note: Hook configuration snippets (SessionStart 60 s, etc.) and the "hooks never block" design principle.

**claude-mem CHANGELOG.md**: https://github.com/thedotmack/claude-mem/blob/main/CHANGELOG.md
- Type: repo (file)
- Date: n/d (latest main)
- Note: v13 corpus-tools addition; documents "Graceful hook failures — hooks exit 0 with empty responses."

**claude-mem commits (main branch)**: https://github.com/thedotmack/claude-mem/commits/main/
- Type: repo (commit log)
- Date: n/d (live)
- Note: Used to confirm recency / active maintenance.

**claude-mem issue #810 (Windows zombie uvx.exe)**: https://github.com/thedotmack/claude-mem/issues/810
- Type: repo (issue)
- Date: 2026 (open as of report writing)
- Note: Source for the verbatim SessionStart/UserPromptSubmit hook JSON shown in Q1.1.

**claude-mem DeepWiki — Hook and Context Issues**: https://deepwiki.com/thedotmack/claude-mem/8.3-hook-and-context-issues
- Type: docs (third-party wiki)
- Date: n/d (auto-generated)
- Note: Background on hook failure modes; supplementary, not authoritative.

**claude-mem docs — Installation**: https://docs.claude-mem.ai/installation
- Type: docs
- Date: n/d
- Note: Sub-100 ms `.install-version` marker check pattern.

**claude-mem docs — Hooks architecture**: https://docs.claude-mem.ai/hooks-architecture
- Type: docs
- Date: n/d
- Note: Hook dispatch through a single Bun worker.

**claude-mem docs (Mintlify mirror) — Database Architecture**: https://www.mintlify.com/thedotmack/claude-mem/architecture/database
- Type: docs
- Date: n/d
- Note: SQLite schema (observations + observations_fts contentless FTS5, AI-extracted hierarchical fields).

**Digital-Process-Tools/claude-remember**: https://github.com/Digital-Process-Tools/claude-remember
- Type: repo
- Date: actively updated 2026
- Note: Bash-only hooks with `</dev/null …& disown` detach trick; Haiku cost estimate "< $0.01 per session."

**disler/claude-code-hooks-mastery**: https://github.com/disler/claude-code-hooks-mastery
- Type: repo
- Date: 2025–2026
- Note: Reference logger covering all 13 (later 29) hook events; UV single-file Python pattern.

**luongnv89/claude-howto (hooks section)**: https://github.com/luongnv89/claude-howto/blob/main/06-hooks/README.md
- Type: repo (docs)
- Date: 2026
- Note: 29-event matrix incl. post-March-2026 events (InstructionsLoaded, UserPromptExpansion, etc.).

**coleam00/claude-memory-compiler**: https://github.com/coleam00/claude-memory-compiler
- Type: repo
- Date: 2026
- Note: SessionEnd + PreCompact background compilation pattern (Karpathy-inspired).

**memvid/claude-brain**: https://github.com/memvid/claude-brain
- Type: repo
- Date: 2026
- Note: Single-file `.mv2` Rust memory store; zero-DB alternative.

**codenamev/claude_memory**: https://github.com/codenamev/claude_memory
- Type: repo
- Date: 2026
- Note: Ruby implementation using only 3 hooks + MCP for everything else; predicate/entity facts (no exposed numeric ID).

**ClaudeMemory Setup (MCP Market listing)**: https://mcpmarket.com/tools/skills/claudememory-setup-manager
- Type: other (directory listing)
- Date: n/d
- Note: Supplementary reference for skill-based memory setup; not authoritative.

**Anthropic Claude Code — Hooks reference**: https://code.claude.com/docs/en/hooks
- Type: docs
- Date: n/d (live)
- Note: Authoritative hook payload schemas, parallel-execution semantics, async hook behavior.

**ShakaCode hooks guide**: https://github.com/shakacode/claude-code-commands-skills-agents/blob/main/docs/hooks-guide.md
- Type: repo (docs)
- Date: 2026
- Note: Community reference for hook chaining and parallel execution.

**ClaudeLog — Hooks mechanics**: https://claudelog.com/mechanics/hooks/
- Type: blog
- Date: n/d (live)
- Note: Hook ordering and `updatedInput` field usage.

**anthropics/claude-code issue #24115 (plugin hooks fire twice)**: https://github.com/anthropics/claude-code/issues/24115
- Type: repo (issue)
- Date: 2026, open as of report writing
- Note: Confirmed bug — hooks loaded from marketplace + cache. Cited in Q1.

**anthropics/claude-code issue #29724 (command-template dedup drops hooks)**: https://github.com/anthropics/claude-code/issues/29724
- Type: repo (issue)
- Date: 2026, open as of report writing
- Note: Pre-`${CLAUDE_PLUGIN_ROOT}` dedup collision. Drives the "kit-unique command path" recommendation.

**Anthropic — Claude Haiku 4.5 product page**: https://www.anthropic.com/claude/haiku
- Type: docs (product)
- Date: n/d (live)
- Note: Source for the verbatim $1/$5 input/output pricing and 90% caching / 50% batch claims.

**CloudZero — Anthropic Claude API Pricing 2026**: https://www.cloudzero.com/blog/claude-api-pricing/
- Type: blog
- Date: 2026
- Note: Secondary price corroboration for Haiku/Sonnet/Opus.

**PE Collective — Claude API Pricing 2026**: https://pecollective.com/tools/anthropic-api-pricing/
- Type: blog
- Date: 2026
- Note: Third price corroboration; numbers consistent with Anthropic's page.

**DevTk — Anthropic Claude API Pricing 2026**: https://devtk.ai/en/blog/claude-api-pricing-guide-2026/
- Type: blog
- Date: 2026
- Note: Additional pricing corroboration.

**Mem0 docs — Multimodal Support**: https://docs.mem0.ai/open-source/multimodal-support
- Type: docs (vendor)
- Date: n/d
- Note: Source of Mem0's self-reported "26% accuracy / 91% latency / 90% token" numbers. Flagged as vendor self-report.

**Maximem comparison page**: https://www.maximem.ai/compare/maximem-synap-vs-mem0-vs-zep-vs-letta-vs-supermemory-vs-cognee-vs-evermind
- Type: blog (vendor)
- Date: n/d
- Note: Vendor comparison of memory systems. Flagged as biased; used only for orientation.

**n1n.ai — AI Agent Memory Comparison 2026**: https://explore.n1n.ai/blog/ai-agent-memory-comparison-2026-mem0-zep-letta-cognee-2026-04-23
- Type: blog
- Date: 2026-04-23
- Note: Third-party orientation of mem0 / Zep / Letta / Cognee. Reportorial, not benchmarked.

**LightMem (arXiv:2510.18866)**: https://arxiv.org/abs/2510.18866
- Type: paper
- Date: 2025-10 (preprint); ICLR 2026 accepted
- Note: Three-stage architecture; verbatim 38×/20.9× token-reduction and 30×/55.5× API-call-reduction claims. Authors' own benchmark.

**SGMem (arXiv:2509.21212)**: https://arxiv.org/abs/2509.21212
- Type: paper
- Date: 2025-09
- Note: Sentence-graph cross-session memory; outperforms session-level baselines.

**"A Simple Yet Strong Baseline" (arXiv:2511.17208)**: https://arxiv.org/abs/2511.17208
- Type: paper
- Date: 2025-11
- Note: Argues for enriched EDUs (elementary discourse units) over aggressive summarization.

**KVzip (arXiv:2505.23416)**: https://arxiv.org/abs/2505.23416
- Type: paper
- Date: 2025-05
- Note: 3–4× KV-cache reduction; relevant for local/air-gapped compression. Verbatim claim quoted in Q2.1.

**ProMem / "Beyond Static Summarization" (arXiv:2601.04463)**: https://arxiv.org/abs/2601.04463
- Type: paper
- Date: 2026-01 (preprint)
- Note: Self-questioning extraction to fix HaluMem's missing-information accumulation. ⚠️ Verify the arXiv ID before citation — the "2601" prefix is unusual and may indicate a transcription error in the upstream research. I recommend confirming on arxiv.org before ingesting.

**"A Comparative Analysis of Identifier Schemes: UUIDv4, UUIDv7, and ULID" (arXiv:2509.08969)**: https://arxiv.org/abs/2509.08969
- Type: paper
- Date: 2025-09-10
- Note: Verbatim 98.42% lower ULID collision risk vs UUIDv7. Author: Nima Karimian Kakolaki.

**arXiv PDF mirror of the above**: https://arxiv.org/pdf/2509.08969
- Type: paper (PDF mirror)
- Date: 2025-09-10
- Note: Same paper, PDF endpoint.

**Fail-Safe/Noema**: https://github.com/Fail-Safe/Noema
- Type: repo
- Date: 2026
- Note: Explicit "plain markdown is source of truth, SQLite+FTS5 is the index" design. Closest architectural sibling.

**sqliteai/sqlite-memory**: https://github.com/sqliteai/sqlite-memory
- Type: repo
- Date: 2026
- Note: SQLite extension for agent memory; markdown source + hybrid FTS5/vector search via llama.cpp.

**pmmvr/obsidian-index-service**: https://github.com/pmmvr/obsidian-index-service
- Type: repo
- Date: 2026
- Note: File-watcher → SQLite (WAL mode) for concurrent reader/writer; cleanest air-gap data-plane pattern.

**FOSS Engineer — Self-Hostable F/OSS Note-Taking Tools**: https://fossengineer.com/selfhostable-note-taking-tools/
- Type: blog
- Date: n/d
- Note: Orientation for SilverBullet / Dendron / Anytype / SiYuan landscape.

**modelcontextprotocol/servers — src/memory**: https://github.com/modelcontextprotocol/servers/tree/main/src/memory
- Type: repo (subdirectory)
- Date: latest release `2025.11.25`
- Note: Anthropic-managed knowledge-graph memory MCP. Cited for the 9-tool API and JSONL storage.

**Knowledge Graph Memory Server (Glama mirror)**: https://glama.ai/mcp/servers/@modelcontextprotocol/knowledge-graph-memory-server
- Type: docs (third-party index)
- Date: n/d
- Note: Alternative view of the Anthropic memory server; used for tool-list confirmation.

**Anthropic memory MCP schema bug — issue #3074**: https://github.com/modelcontextprotocol/servers/issues/3074
- Type: repo (issue)
- Date: open as of report
- Note: Unfixed `read_graph`/`search_nodes`/`open_nodes` schema validation bug.

**doobidoo/mcp-memory-service**: https://github.com/doobidoo/mcp-memory-service
- Type: repo
- Date: v10.60.0, May 2026
- Note: Multi-backend memory MCP; self-reported 86.0% R@5 with `memory_store_session`.

**doobidoo/mcp-memory-service (Glama mirror)**: https://glama.ai/mcp/servers/doobidoo/mcp-memory-service
- Type: docs (third-party index)
- Date: n/d
- Note: Mirror used to surface the 86.0% R@5 self-report.

**abordage/awesome-mcp**: https://github.com/abordage/awesome-mcp
- Type: repo (list)
- Date: auto-updated daily
- Note: Source for novel-find candidates (jean-memory, extended-memory-mcp, knowall-ai/mcp-neo4j-agent-memory, JamesANZ/memory-mcp).

**Kubernetes docs — Organizing Cluster Access Using kubeconfig**: https://kubernetes.io/docs/concepts/configuration/organize-cluster-access-kubeconfig/
- Type: docs
- Date: n/d (live)
- Note: Verbatim "first file to set a particular value or map key wins" rule.

**OneUptime — Merge Multiple Kubeconfig Files**: https://oneuptime.com/blog/post/2026-02-09-merge-multiple-kubeconfig-files/view
- Type: blog
- Date: 2026-02-09
- Note: Practical pitfall: name collisions silently drop contexts.

---

## Sources mentioned in the report but NOT directly URL-cited

These were named for context but no specific URL was attached in the research output:

- **Mem0 repo** (`github.com/mem0ai/mem0`), **Letta** (`github.com/letta-ai/letta`), **Cognee** (`github.com/topoteretes/cognee`), **Zep / Graphiti** (`github.com/getzep/zep`) — referenced as named starting points; the report's quantitative claims about them trace to the Mem0 docs page and the comparison blogs above, not the repos themselves.
- **mem0-mcp `save_memory` PR #662** — referenced in Q5.2 but no direct URL captured.
- **danielrosehill/Claude-User-Memory-Plugin v2** — referenced in Q5.2 tradeoff matrix; no URL captured.
- **willynikes2/knowledge-base-server** — referenced in Q4.1; no URL captured.
- **Logseq forum quote about UUID portability**, **VS Code issue #292016**, **direnv issues #111/#360/#652/#757/#807/#1432**, **Foam discussion #1369** — all referenced as evidence but the specific issue URLs were not captured in the upstream research output.
- **claudefa.st guide** — referenced for parallel-execution semantics; no URL captured.
- **coddy.tech FTS5 guide** — referenced for trigger-based mirroring; no URL captured.

If you want any of these resolved to specific URLs, I can run a follow-up search for just the missing ones — that's faster than another full research pass. Otherwise, the verified list above covers every citation that was actually URL-anchored in the report.