# Master sources index

Every URL, paper, repo, video, and blog post cited anywhere in `claude-memory-kit`. The authoritative reference list. When you need a citation, link here.

For deep-dive notes on individual sources, see [sources/](sources/). For source-by-research-output mapping, see [research/INDEX.md](research/INDEX.md).

## Conceptual / inspiration

- **Simon Scrapes — "Master Claude Memory to Get Ahead of 99% of People"** ([YouTube](https://www.youtube.com/watch?v=rFWxRZ5D-lM), [companion Notion](https://scrapeshq.notion.site/claude-memory-systems)) — the source pattern for layered, per-project memory; the four-component Layer 4 design (PreToolUse + Stop + skill + auto-extract); the frozen-snapshot concept. Deep-dive: [sources/simon-scrapes-master-claude-memory.md](sources/simon-scrapes-master-claude-memory.md).
- **Hermes** (Anthropic example agent) — the frozen-snapshot pattern that inspired SOUL.md as a separate "how Claude shows up" file from USER.md ("who the user is").
- **AWS Kiro — "From Chat to Specs Deep Dive"** (<https://kiro.dev/blog/from-chat-to-specs-deep-dive/>) — the spec-driven workflow we adopted. Three-document structure: requirements → design → tasks. Deep-dive: [sources/kiro-spec-driven-deep-dive.md](sources/kiro-spec-driven-deep-dive.md).
- **Faisal Haque — "Give Claude Permanent Memory"** ([Plain English / Medium, 2026-05-04](https://ai.plainenglish.io/give-claude-permanentmemory-7b4343de2d7e)) — clean 4-layer overview of Anthropic's official memory architecture (Chat Synthesis / Project Memory Spaces / CLAUDE.md / API Memory Tool). Surfaced for us that Anthropic ships Auto Memory in Claude Code v2.1.59+ with the same `<type>_<slug>.md` granular pattern we designed independently. Triggered ADR-0011 investigation.
- **Rick Hightower — "Anthropic Harness Engineering: Bridging the Memory Gap"** ([TowardsAI, 2026-05-06](https://pub.towardsai.net/anthropic-harness-engineering-bridging-the-memory-gap-how-ai-agents-conquer-the-context-window-12dd2b20e298)) — practitioner writeup of Anthropic's official harness-engineering paper. Surfaces 4 critical patterns: (1) `init.sh` for standardized environment, (2) `claude-progress.txt` narrative log = our `sessions/{date}.md`, (3) **`feature_list.json` with `passes: false` checklist** — JSON over Markdown for "structural gravity" against the Premature Victory failure mode, (4) explicit two-agent architecture (Initializer + Coding) which maps onto our Kiro phases. Direct quotes informing our design tenets: *"compaction is a band-aid, not a cure"*, *"summary is not a specification"*. We chose Markdown over JSON for `tasks.md` (human-in-loop review makes structural gravity less load-bearing) — see [conversation-log/2026-05-22.md](conversation-log/2026-05-22.md).
- **Rick Hightower — "Foundations of CCA-F Exam Part 4: Engineering the Long-Running Agent Harness"** ([TowardsAI, 2026-05-05](https://pub.towardsai.net/foundations-of-cca-f-exam-part-4-engineering-the-long-running-agent-harness-from-amnesia-to-fc03bfbb0377)) — exam-prep version of the same Anthropic harness paper with CCA-F exam-domain mappings. Adds depth on: (a) agentic loop mechanics (Domain 1.1 — only `stop_reason == "tool_use"` continues; tool results MUST be re-injected before new assistant text), (b) structured error handling (Domain 2.2 — subagents return `isError`, `errorCategory`, `isRetryable`, partial results, not just exit codes), (c) subagents do NOT inherit parent context (validates our auto-extract sub-Claude isolation), (d) diagnostic matrix mapping failure patterns to harness fixes. **Implication for design.md**: upgrade `auto-extract-memory.sh` logging from plain exit codes to structured JSON (`{success, error_category, observation_count, skipped_reason}`) — refinement of FR-10.
- **Rost Glukhov — "Hermes Agent Memory System: How Persistent AI Memory Actually Works"** ([Level Up Coding, 2026-05-01](https://levelup.gitconnected.com/hermes-agent-memory-system-how-persistent-ai-memory-actually-works-a149bef18faa)) — **🔥 closest production reference architecture to ours.** Hermes Agent at <https://github.com/NousResearch/hermes-agent> (verified 162,547 ⭐ on 2026-05-22, MIT, Nous Research, 242+ contributors). USER.md char cap is **identical** to ours (1,375 chars); MEMORY.md is 2,200 (ours 2,500). Same `memory` tool with `add/replace/remove`. Same frozen-snapshot pattern. Same internal-vs-external memory distinction (we should adopt this terminology verbatim). Pluggable external providers (Honcho, OpenViking, Mem0, Hindsight, Holographic, RetainDB, ByteRover, Supermemory) we deferred to v0.2+. **Validates our design strongly.** Deep-dive: [sources/hermes-agent-deep-dive.md](sources/hermes-agent-deep-dive.md).
- **Anubhav — "Inside Claude Code's Leak: 8 Compaction Modes, 3 Memory Tiers, 44 Flags Anthropic Never Talked About"** ([Medium / Data Science Collective, 2026-05-08](https://medium.com/data-science-collective/inside-claude-codes-leak-8-compaction-modes-3-memory-tiers-44-flags-anthropic-never-talked-c9740c501e63)) — **🔥 reveals Claude Code's actual internal architecture.** Based on the accidentally-published v2.1.88 npm source map (59.8 MB, ~512K lines, briefly public April 2026 before Anthropic removed; April 23 postmortem published). Findings: **8 compaction mechanisms** in strict priority order (cheapest-first), `MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3` circuit breaker, **3 memory tiers** (in-context / persistent files / CLAUDE.md hierarchy), **`autoDream` self-healing subagent** at Tier 2 with triple-gate (24h + 5 sessions + file lock), **44 feature flags** including KAIROS background daemon (unreleased), `ANTI_DISTILLATION_CC`, frustration regex, silent Opus→Sonnet downgrade, employee verification gate. Internal codenames: Tengu (Claude Code), Capybara, Fennec (Opus 4.6), Numbat. **Major implications for ADR-0011 (coexistence) and FR-9 (hooks).** Research note: [research/2026-05-22-claude-code-leak-architecture.md](research/2026-05-22-claude-code-leak-architecture.md).
- **Bijit Ghosh — "The Complete Guide to CLAUDE.md: Memory, Rules, Loading, and Cross-Tool Compression"** ([Medium, 2026-05-09](https://medium.com/@bijit211987/the-complete-guide-to-claude-md-memory-rules-loading-and-cross-tool-compression-97cc12ed037b)) — authoritative best-practices guide for CLAUDE.md. Key data: models reliably follow ~150-200 instructions, Claude Code's system prompt eats ~50, so CLAUDE.md gets ~100-150 usable slots. **Practical limit: 80-120 lines for high-signal CLAUDE.md.** 5 essential sections: Critical Commands / Architecture Map / Hard Rules (under 15) / Workflow Preferences / Out of Scope. "IMPORTANT" and "YOU MUST" markers measurably improve adherence per Anthropic docs. Three-level hierarchy (global/project/local), on-demand subdirectory loading, `@syntax` imports. Cross-tool comparison: CLAUDE.md (Anthropic) vs AGENTS.md (Codex) vs copilot-instructions.md (Copilot) vs .cursor/rules/ (Cursor) vs .windsurfrules (Windsurf). **Implication for design.md**: our `template/CLAUDE.md.template` (~180 lines) is over the 80-120 limit — should refactor to the 5-section structure with IMPORTANT markers on critical rules.
- **Divy Yadav — "Why AI Agents Forget: 5 AI Agent Memory Fixes That Actually Work in 2026"** ([Medium / AI Engineering Simplified, 2026-05-09](https://medium.com/ai-engineering-simplified/why-ai-agents-forget-5-ai-agent-memory-fixes-that-actually-work-in-2026-d909b072ce4f)) — general intro to agent memory architecture. 4 memory types (Short-term, Episodic, Semantic, Procedural), 5 techniques (Sliding Window+Summarization, Hierarchical, Importance-Weighted Retention, Mem0, Memory Consolidation Pipeline). Three failure modes: irrelevant retrievals, noise accumulation, confidence scores that never decay. Validates many of our choices but no new actionable findings — useful for liorwiki reference.
- **Algo Insights — "This /goal Command Gives Claude Code Persistent Memory and Task Control"** ([Medium / Coding Nexus, 2026-05-18](https://medium.com/coding-nexus/this-goal-command-gives-claude-code-persistent-memory-and-task-control-624903b26e77)) — describes `claude-goal` skill at <https://github.com/jthack/claude-goal> (verified 91 ⭐, MIT). Stop hook blocks Claude's normal stopping while a goal is active (default 500 continuations cap, configurable via `CLAUDE_GOAL_MAX_STOP_CONTINUES`). SQLite at `~/.claude/goal/goals.sqlite`. Completion audit before goal can be marked complete. Pattern is interesting (Stop-hook-as-controller) but tangential to memory specifically — useful reference for v0.2+ "keep working until consolidated" workflows.

## Verification status legend

- ✓ **Verified** — URL fetched directly via `gh api` or `WebFetch` on 2026-05-22.
- ~ **Partial** — referenced in research but not independently verified.
- ✗ **Unverified / suspected hallucination** — could not confirm existence.

When ingesting into liorwiki, prefer ✓ entries. Use ~ entries with caution.

## Competitive landscape (memory systems for AI agents)

### Verified (direct `gh api` + URL fetch on 2026-05-22)

- ✓ **Basic Memory** (<https://github.com/basicmachines-co/basic-memory>) — 3,064 ⭐, AGPL-3.0, Python. "Local-first. Plain text on your disk. Forever." Closest open-source design analog to claude-memory-kit. Deep-dive: [sources/basic-memory-deep-dive.md](sources/basic-memory-deep-dive.md).
- ✓ **Mem0** (<https://github.com/mem0ai/mem0>) — 56,406 ⭐, Apache-2.0, Python. Universal memory layer for AI agents.
- ✓ **Letta / MemGPT** (<https://github.com/letta-ai/letta>) — 22,877 ⭐, Apache-2.0, Python. Stateful agents with explicit memory blocks.
- ✓ **Cognee** (<https://github.com/topoteretes/cognee>) — 17,440 ⭐, Apache-2.0, Python. "Memory control plane in 6 lines of code."
- ✓ **Zep / Graphiti** (<https://github.com/getzep/graphiti>) — 26,362 ⭐, Apache-2.0, Python. Temporal knowledge graph; raw episodes as provenance.
- ✓ **LangMem** (<https://github.com/langchain-ai/langmem>) — 1,465 ⭐, MIT, Python. Hot-path memory tools + background memory management for LangGraph.
- ✓ **Supermemory** (<https://github.com/supermemoryai/supermemory>) — 22,653 ⭐, MIT, TypeScript. Portable cross-LLM memory.
- ✓ **thedotmack/claude-mem** (<https://github.com/thedotmack/claude-mem>) — 77,244 ⭐ (2026-05-21), v13.3.0. Global opaque SQLite + Chroma, 6 hooks. Research note: [research/2026-05-21-claude-mem-architecture.md](research/2026-05-21-claude-mem-architecture.md).
- ✓ **Digital-Process-Tools/claude-remember** (<https://github.com/Digital-Process-Tools/claude-remember>) — Per-project markdown, Haiku-compressed daily summaries. Research note: [research/2026-05-21-claude-remember-architecture.md](research/2026-05-21-claude-remember-architecture.md).
- ✓ **chunxiaoxx/nautilus-compass** (<https://github.com/chunxiaoxx/nautilus-compass>) — Memory layer with Merkle-chained audit log for tamper-evident provenance. Paper: <https://arxiv.org/abs/2605.09863> ("Nautilus Compass: Black-box Persona Drift Detection for Production LLM Agents"). ROC AUC 0.83 for drift detection. **Use cases match our v0.2+ direction for tamper-evident memory.**
- ✓ **CosmoNaught/claude-code-cmv** (<https://github.com/CosmoNaught/claude-code-cmv>) — Contextual Memory Virtualization: snapshot/branch/trim primitives for Claude Code session state. Snapshots in `~/.cmv/snapshots/`. Auto-trim PreCompact + PostToolUse hooks. **Use case parallel to our rolling-window compression.**
- ✓ **DeusData/codebase-memory-mcp** (<https://github.com/DeusData/codebase-memory-mcp>) — Persistent Tree-Sitter knowledge graph for code exploration via MCP. 155 languages. Paper: <https://arxiv.org/abs/2603.27277> (Martin Vogel, March 2026). 14 MCP tools, sub-ms queries, 31-repo eval. **v0.2+ direction: structural code memory as separate subsystem.**
- ✓ **EverMind-AI/EverOS** (<https://github.com/EverMind-AI/EverOS>) — Self-organizing memory OS with MemCells/MemScenes. Paper: <https://arxiv.org/abs/2601.02163>. 92.73% on LoCoMo for long-dialogue. (Repo name is `EverOS`, not `EverMemOS` as Option A reported.)
- ✓ **MemTensor/MemOS** (<https://github.com/MemTensor/MemOS>) — Memory OS with MemCube abstraction across plaintext/activation/parameter memory. Paper: <https://arxiv.org/abs/2507.03724>.
- ✓ **RayNeo-AI-2025/AnchorMem** (<https://github.com/RayNeo-AI-2025/AnchorMem>) — Anchored facts + associative event graph. Paper: <https://arxiv.org/abs/2604.17377> (April 2026). LoCoMo benchmark.
- ✓ **A-MemGuard** (paper only: <https://arxiv.org/abs/2510.02373>) — Proactive defense framework for LLM agent memory. Consensus validation + lessons memory. >95% attack-success-rate reduction. Sep 2025. **Informs our NFR-9 baseline defenses.**
- ✓ **Anthropic official Memory tool** (<https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool>) — API-level (`type: memory_20250818` beta). Client-side `/memories/*.md` files. Validates markdown-as-storage. Research note: [research/2026-05-21-anthropic-memory-tool.md](research/2026-05-21-anthropic-memory-tool.md).

### Verified after Claude.ai bibliography (2026-05-22)

- ✓ **Fail-Safe/Noema** (<https://github.com/Fail-Safe/Noema>) — 8 ⭐, Go, MIT. *"The intentional memory layer for your AI agents."* Markdown-source + SQLite-FTS5-index design. Pushed 2026-05-20. **Validates our ADR-0002 architecture choice.**
- ✓ **sqliteai/sqlite-memory** (<https://github.com/sqliteai/sqlite-memory>) — 56 ⭐, C. *"Markdown based AI agent memory with semantic search, hybrid retrieval, and offline-first sync between agents."* Mentioned in Option-B; verified here.
- ✓ **pmmvr/obsidian-index-service** (<https://github.com/pmmvr/obsidian-index-service>) — 9 ⭐, Python, MIT. Obsidian-vault → SQLite (WAL mode) indexer; cleanest air-gap data-plane pattern.
- ✓ **modelcontextprotocol/servers** (<https://github.com/modelcontextprotocol/servers>) — 86,082 ⭐, TypeScript. The canonical MCP servers repo. Includes the Anthropic-managed `src/memory` knowledge-graph memory server (9 tools, JSONL storage, latest release 2025.11.25). **Important for our MCP design (FR-26).**
- ✓ **codenamev/claude_memory** (<https://github.com/codenamev/claude_memory>) — 20 ⭐, Ruby, MIT. *"Long-term, self-managed memory for Claude Code using hooks, MCP tools, and SQLite."* 3-hook + MCP-for-everything inversion.
- ✓ **coleam00/claude-memory-compiler** (<https://github.com/coleam00/claude-memory-compiler>) — 1,077 ⭐, Python. SessionEnd + PreCompact background compilation via Claude Agent SDK. Karpathy-inspired knowledge articles.
- ✓ **disler/claude-code-hooks-mastery** (<https://github.com/disler/claude-code-hooks-mastery>) — 3,699 ⭐, Python. Reference logger covering all 13 hook events. UV single-file Python pattern.
- ✓ **luongnv89/claude-howto** (<https://github.com/luongnv89/claude-howto>) — 33,799 ⭐!, Python, MIT. *"A visual, example-driven guide to Claude Code."* 29-event hook matrix (post-March-2026 events).
- ✓ **memvid/claude-brain** (<https://github.com/memvid/claude-brain>) — 496 ⭐, TypeScript, MIT. *"Give Claude Code photographic memory in ONE portable file."* Single `.mv2` Rust file; no DB.
- ✓ **doobidoo/mcp-memory-service** (<https://github.com/doobidoo/mcp-memory-service>) — 1,868 ⭐, Python, Apache-2.0. Multi-backend memory MCP. REST API + knowledge graph + autonomous consolidation. Latest release v10.60.0 (May 2026).
- ✓ **abordage/awesome-mcp** (<https://github.com/abordage/awesome-mcp>) — 6 ⭐, MIT. Curated list of MCP servers, auto-updated daily. Good source for novel-find candidates.

### CORRECTION (2026-05-22) — "True Memory" is real

Earlier I marked "True Memory" as a suspected hallucination. **I was wrong.** ChatGPT's bibliography surfaced the actual paper:

- ✓ **"Storage Is Not Memory: A Retrieval-Centered Architecture for Agent Recall"** by Joshua Adler and Guy Zehavi — <https://arxiv.org/abs/2605.04897> (May 6, 2026). The paper title uses "Storage Is Not Memory"; the proposed architecture inside is called "True Memory." Both names refer to the same paper. Verbatim abstract opener: *"Extraction at ingestion is the wrong primitive for agent memory: content discarded before the query is known cannot be recovered at retrieval time."* Validates ADR-0010 (raw transcripts preserved indefinitely).

The MemMachine and "Simple Yet Strong Baseline" papers below are also real and support the same argument; cite all three for the "retrieval-over-preserved-events" direction.

### Cited in Option A with arxiv IDs from ChatGPT bibliography (URLs verified by gh api or noted otherwise)

- ✓ **Storage Is Not Memory / True Memory** (Joshua Adler, Guy Zehavi, May 2026) — <https://arxiv.org/abs/2605.04897>. See correction above.
- ~ **Hindsight is 20/20** (Dec 14, 2025) — <https://arxiv.org/abs/2512.12818>. URL from ChatGPT bibliography; not directly fetched by me yet.
- ~ **MemLineage** (May 14, 2026) — <https://arxiv.org/abs/2605.14421>. URL from ChatGPT bibliography; not directly fetched.
- ~ **MemoryGraft** (Dec 18, 2025) — <https://arxiv.org/abs/2512.16962>. URL from ChatGPT bibliography; not directly fetched.
- ✗ **"Agentic Memory"** — ChatGPT honestly admitted it could not be tied to a specific paper. *"Multiple plausible 2025-2026 papers fit that description."* Skip as a citation unless we find a specific one later.

## Anthropic / Claude Code references

- **Claude Code plugins reference**: <https://code.claude.com/docs/en/plugins> — manifest format (`.claude-plugin/plugin.json`), skills/hooks/agents directory conventions, `--plugin-dir` for testing, `/plugin install` for marketplace.
- **Claude Code hooks reference**: <https://code.claude.com/docs/en/hooks> — authoritative hook payload schemas, parallel-execution semantics, async hook behavior.
- **Claude Code hooks documentation (mirror)**: <https://docs.claude.com/en/docs/claude-code/hooks> — payload schemas, additionalContext output protocol.
- **Claude Code skills documentation**: <https://docs.claude.com/en/docs/claude-code/skills> — SKILL.md frontmatter.
- **Anthropic Memory tool docs (API-level)**: <https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool>.
- **Anthropic Claude Code Memory docs (different from above!)**: <https://code.claude.com/docs/en/memory>. Covers CLAUDE.md hierarchy + Auto Memory (v2.1.59+). The Auto Memory feature uses `~/.claude/projects/<project>/memory/` with `MEMORY.md` entrypoint + `<type>_<slug>.md` topic files — independently the same pattern we designed. Research note: [research/2026-05-22-anthropic-claude-code-auto-memory.md](research/2026-05-22-anthropic-claude-code-auto-memory.md).
- **Effective context engineering**: <https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents>.
- **Effective harnesses for long-running agents**: <https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents>. **Canonical Anthropic engineering reference** for the long-running-agent harness pattern. Inspired our rolling-window compression, session log discipline, and 3-tier scope. The pattern Hightower writes about above.
- **Building Effective Agents** (Anthropic): <https://anthropic.com/research/building-effective-agents>.
- **Writing Effective Tools for AI Agents** (Anthropic): <https://anthropic.com/engineering/writing-tools-for-agents>.
- **Effective Context Engineering for AI Agents** (Anthropic, already cited above; included here for completeness in the harness-engineering canon).
- **Equipping Agents for the Real World with Agent Skills** (Anthropic): <https://anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills>.
- **The "Think" Tool: Enabling Claude to Stop and Think** (Anthropic): <https://anthropic.com/engineering/claude-think-tool>.
- **Building Agents with the Claude Agent SDK** (Anthropic): <https://anthropic.com/engineering/building-agents-with-the-claude-agent-sdk>.
- **How We Built Our Multi-Agent Research System** (Anthropic): <https://anthropic.com/engineering/multi-agent-research-system>.
- **Code Execution with MCP** (Anthropic): <https://anthropic.com/engineering/code-execution-with-mcp>.
- **Introducing the Model Context Protocol** (Anthropic): <https://anthropic.com/news/model-context-protocol>.
- **Anthropic SDK examples** (Python memory): <https://github.com/anthropics/anthropic-sdk-python/blob/main/examples/memory/basic.py>.
- **Anthropic SDK examples** (TypeScript memory): <https://github.com/anthropics/anthropic-sdk-typescript/blob/main/examples/tools-helpers-memory.ts>.
- **Bug: hook double-fire from marketplace + cache**: <https://github.com/anthropics/claude-code/issues/24115>.
- **Bug: command-template dedup collision**: <https://github.com/anthropics/claude-code/issues/29724>.
- **Bug: Anthropic memory MCP schema validation (read_graph/search_nodes/open_nodes)**: <https://github.com/modelcontextprotocol/servers/issues/3074>. Unfixed as of release `2025.11.25`.
- **Anthropic — Claude Haiku 4.5 product page**: <https://www.anthropic.com/claude/haiku>. Authoritative pricing ($1/MTok input, $5/MTok output).
- **ClaudeLog — Hooks mechanics**: <https://claudelog.com/mechanics/hooks/>. Hook ordering and `updatedInput` field usage.
- **ShakaCode hooks guide**: <https://github.com/shakacode/claude-code-commands-skills-agents/blob/main/docs/hooks-guide.md>. Community reference for hook chaining and parallel execution.
- **claude-mem DeepWiki — Hook and Context Issues**: <https://deepwiki.com/thedotmack/claude-mem/8.3-hook-and-context-issues>. Third-party wiki on hook failure modes; supplementary.
- **claude-mem Mintlify mirror — Database Architecture**: <https://www.mintlify.com/thedotmack/claude-mem/architecture/database>. SQLite schema reference.
- **Knowledge Graph Memory Server (Glama mirror)**: <https://glama.ai/mcp/servers/@modelcontextprotocol/knowledge-graph-memory-server>. Alternative view of Anthropic's memory MCP.

## Anthropic models (cost data, May 2026)

| Model | Input $/MTok | Output $/MTok | Notes |
| --- | --- | --- | --- |
| **claude-haiku-4-5** (`claude-haiku-4-5-20251001`) | $1 | $5 | Batch $0.50/$2.50; primary compressor for v0.1 |
| **claude-sonnet-4-6** | $3 | $15 | Batch $1.50/$7.50; option for high-stakes compression |
| **claude-opus-4-7** | $5 | $25 | Overkill for compression; used for design / planning conversations |

Source: Anthropic Haiku page (<https://www.anthropic.com/claude/haiku>); referenced in Option-B research TL;DR.

Third-party pricing corroborations (consulted 2026-05-22):

- CloudZero — Anthropic Claude API Pricing 2026: <https://www.cloudzero.com/blog/claude-api-pricing/>.
- PE Collective — Claude API Pricing 2026: <https://pecollective.com/tools/anthropic-api-pricing/>.
- DevTk — Anthropic Claude API Pricing Guide 2026: <https://devtk.ai/en/blog/claude-api-pricing-guide-2026/>.

Numbers consistent with Anthropic's own page across all four sources.

## memsearch and Milvus

- **memsearch** by Zilliz (<https://github.com/zilliztech/memsearch>) — local-first hybrid keyword + vector search, ONNX embedding provider, MilvusStore backend.
- **memsearch issue #534** (<https://github.com/zilliztech/memsearch/issues/534>) — missing `flush()` in `MilvusStore.upsert()`; the reason `scripts/memsearch-index-with-flush.sh` exists as a wrapper.
- **Milvus v2.6 release notes** — Woodpecker WAL backend change (replaces Pulsar in v2.5). Pulled from `milvus-io/web-content` repo on GitHub when the official docs site returned 403.
- **Milvus standalone Docker install** — official multi-container compose pattern (etcd + MinIO + standalone). The `latest` tag is v3.0-beta and crashes; v2.6.16 is the current stable.

## Per-OS install commands

### Windows

- [Docker Desktop on Windows install docs](https://docs.docker.com/desktop/install/windows-install/) — WSL 2 backend requirements, per-user vs all-users install.
- [winget Docker.DockerDesktop package](https://winget.run/pkg/Docker/DockerDesktop) — `winget install -e --id Docker.DockerDesktop`.
- [WSL 2 install guide (Microsoft Learn)](https://learn.microsoft.com/en-us/windows/wsl/install) — `wsl --install` from elevated PowerShell.

### macOS

- [Homebrew install](https://brew.sh/) — the `/bin/bash -c "$(curl ...)"` one-liner.
- [docker-desktop Homebrew cask](https://formulae.brew.sh/cask/docker-desktop) — `brew install --cask docker-desktop` (optional on macOS since milvus-lite works natively).

### Linux

- [Docker Engine on Ubuntu install docs](https://docs.docker.com/engine/install/ubuntu/) — apt repository setup, GPG key import, `docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin`.
- [Docker post-install steps](https://docs.docker.com/engine/install/linux-postinstall/) — `groupadd docker`, `usermod -aG docker $USER`, `newgrp docker`.
- [NodeSource Node.js distributions](https://github.com/nodesource/distributions) — `curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -`.

## Academic / research papers

### Verified (URL fetched, abstract read 2026-05-22)

- ✓ **LightMem** (zjunlp et al., ICLR 2026) — <https://arxiv.org/abs/2510.18866>. 3-stage architecture (sensory → topic-aware short-term → sleep-time long-term). Reports 38× token reduction. Repo: <https://github.com/zjunlp/LightMem> (verified 853 ⭐, MIT).
- ✓ **KVzip** (Kim et al., NeurIPS 2025 Oral) — <https://arxiv.org/abs/2505.23416>. 3-4× KV cache compression, ~2× FlashAttention decode latency reduction. Up to 170K context.
- ✓ **A Comparative Analysis of Identifier Schemes** (Karimian Kakolaki, Sep 2025) — <https://arxiv.org/abs/2509.08969>. UUIDv4 vs UUIDv7 vs ULID for distributed systems. Informed ADR-0007.
- ✓ **EverMemOS** (Chuanrui Hu et al., 2026) — <https://arxiv.org/abs/2601.02163>. Self-organizing memory OS with MemCells/MemScenes. 92.73% on LoCoMo.
- ✓ **MemOS** (2025) — <https://arxiv.org/abs/2507.03724>. Memory OS with MemCube abstraction across plaintext/activation/parameter memory.
- ✓ **Nautilus Compass** (2026) — <https://arxiv.org/abs/2605.09863>. Black-box persona drift detection. ROC AUC 0.83.
- ✓ **AnchorMem** (April 2026) — <https://arxiv.org/abs/2604.17377>. Anchored facts + associative event graph. LoCoMo benchmark.
- ✓ **A-MemGuard** (Sep 2025) — <https://arxiv.org/abs/2510.02373>. Proactive defense framework. >95% attack-success-rate reduction.
- ✓ **Codebase-Memory** (Martin Vogel, March 2026) — <https://arxiv.org/abs/2603.27277>. Tree-Sitter KG via MCP. 155 languages. 31-repo eval.

### Verified during defensive lookups (not cited in either research output, found via WebSearch 2026-05-22)

- ✓ **MemMachine** — <https://arxiv.org/abs/2604.04853>. "Ground-Truth-Preserving Memory System for Personalized AI Agents." Stores raw conversational episodes, minimizes routine LLM-based extraction. **The real paper behind Option A's "True Memory" attribution.**
- ✓ **A Simple Yet Strong Baseline for Long-Term Conversational Memory of LLM Agents** (Zhou et al., Nov 2025) — <https://arxiv.org/abs/2511.17208>. Non-compressive enriched EDUs over aggressive summarization.
- ✓ **Memory for Autonomous LLM Agents: Mechanisms, Evaluation, and Emerging Frontiers** (survey) — <https://arxiv.org/abs/2603.07670>. Useful overview of the whole memory field.
- ✓ **Memory Matters More: Event-Centric Memory** / CompassMem (2026) — <https://arxiv.org/abs/2601.04726>. Event graph for agent reasoning.
- ✓ **Survey on Long-Term Memory Security in LLM Agents (Mnemonic Sovereignty)** — <https://arxiv.org/html/2604.16548v1>. Confirms memory security as 2026 architectural concern.

### Cited but not directly fetched

- ~ **SGMem** (arXiv:2509.21212) — Sentence-graph memory. Cited in Option-B research.

### Papers verified after Claude.ai bibliography (2026-05-22)

- ✓ **ProMem** / *"Beyond Static Summarization: Proactive Memory Extraction for LLM Agents"* — <https://arxiv.org/abs/2601.04463>. Chengyuan Yang, Zequn Sun, Wei Wei, Wei Hu. Submitted January 8, 2026. Proactive memory extraction; addresses missing-information accumulation in HaluMem. (Claude.ai's bibliography flagged the arxiv ID as suspicious due to the unusual "2601" prefix — independently re-verified: the prefix is just January 2026 in arxiv's YYMM.NNNNN scheme. Paper is real.)

### Papers verified after ChatGPT bibliography (2026-05-22)

- ✓ **Mem0 paper**: *"Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory"* by Prateek Chhikara, Dev Khant, Saket Aryan, Taranjeet Singh, Deshraj Yadav. <https://arxiv.org/abs/2504.19413>. Submitted April 28, 2025. Formal architecture description for Mem0's extraction/consolidation/retrieval pipeline.
- ✓ **Zep paper**: *"Zep: A Temporal Knowledge Graph Architecture for Agent Memory"* by Preston Rasmussen, Pavlo Paliychuk, Travis Beauvais, Jack Ryan, Daniel Chalef. <https://arxiv.org/abs/2501.13956>. Submitted January 20, 2025. Outperforms MemGPT on Deep Memory Retrieval benchmark.
- ✓ **Claude Code CMV paper**: *"Contextual Memory Virtualisation: DAG-Based State Management and Structurally Lossless Trimming for LLM Agents"* by Cosmo Santoni. <https://arxiv.org/abs/2602.22402>. Submitted February 25, 2026. The theoretical framing behind the `CosmoNaught/claude-code-cmv` reference implementation we already verified.

### Repos verified after ChatGPT bibliography (2026-05-22)

- ✓ **Supermemory MCP** (separate from `supermemoryai/supermemory`): <https://github.com/supermemoryai/supermemory-mcp>. 1,691 ⭐, MIT, last push 2025-12-30. *"Your memories are in ChatGPT... But nowhere else. Universal Memory MCP makes your memories available to every single LLM."* Different scope than the main supermemory repo.

### Repo URL where ChatGPT's link returns 404 (2026-05-22)

- ✗ **A-MemGuard repo** at `https://github.com/TangciuYueng/AMemGuard` — `gh api` returns 404. This URL appears both in ChatGPT's bibliography and in the paper's own arxiv HTML. The repo may have been renamed, made private, or moved. The paper itself (<https://arxiv.org/abs/2510.02373>) is real and verified. If anyone needs the code, contact the authors directly.

### The Verge article on Anthropic Claude consumer memory upgrade

- ~ **The Verge — Anthropic Claude memory upgrades + import** (2026-03-02): <https://www.theverge.com/ai-artificial-intelligence/887885/anthropic-claude-memory-upgrades-importing>. URL from ChatGPT bibliography; not directly fetched. Supports the claim that Claude consumer products now have memory + import/export workflow from competing AI assistants.

## Standards and conventions

- **EARS** (Easy Approach to Requirements Syntax): <https://alistairmavin.com/ears/> — the "When [trigger], the system shall [behavior]" pattern we use for acceptance criteria.
- **Semantic Versioning 2.0.0**: <https://semver.org/>.
- **Keep a Changelog 1.1.0**: <https://keepachangelog.com/en/1.1.0/>.
- **Conventional Commits**: <https://www.conventionalcommits.org/> (we follow loosely, not strictly).
- **Michael Nygard ADRs**: <https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions> — the original ADR template our format adapts.
- **RFC 4648 base32**: <https://datatracker.ietf.org/doc/html/rfc4648> — alphabet used for citation IDs in ADR-0007.

## Configuration precedence references (informed ADR-0003 tier merging)

- **Git config**: <https://git-scm.com/docs/git-config> — first-match-wins per key; the model we mirror.
- **VS Code settings**: <https://code.visualstudio.com/docs/getstarted/settings> — workspace > user > default.
- **Kubernetes kubeconfig**: <https://kubernetes.io/docs/concepts/configuration/organize-cluster-access-kubeconfig/> — leftmost file wins per key.
- **Direnv issue #111** (cascading config requested): <https://github.com/direnv/direnv/issues/111> — cautionary tale; we surface `cmk config --show-origin` to avoid the surprise.
- **chezmoi**: <https://www.chezmoi.io/> — machine-specific templating; informed our `local` tier rationale.

## Personal knowledge management (PKM) tools (informed ADR-0002 markdown discipline)

- **Obsidian**: <https://obsidian.md/> — markdown source of truth, in-memory indexes.
- **Logseq**: <https://logseq.com/> — markdown source + per-graph SQLite index; UUID block IDs.
- **Foam** (VS Code extension): <https://github.com/foambubble/foam> — markdown + VS Code in-memory graph.
- **SilverBullet**: <https://silverbullet.md/> — markdown + Lua-derived objects from frontmatter.

## DOI deprecation model (informed ADR-0007 consolidation rule)

- **DOI key facts**: <https://www.doi.org/the-identifier/resources/factsheets/key-facts-on-digital-object-identifier-system/> — old DOIs never die; they reference the new one. Inspiration for `merged_from:` / `superseded_by:` in our memory schema.

## Bedrock / future air-gap references (for v0.2+, ADR-0008)

- **Anthropic on AWS Bedrock**: <https://aws.amazon.com/bedrock/anthropic/>.
- **KVzip** (paper, listed above) — for local-LLM compression option in air-gapped tier.

## Windows-specific gotchas (documented in install guides)

- **NTFS forbids `<` and `>` in filenames** — surfaces when cloning `milvus-io/web-content` (Java SDK uses `R<T>.md`). Fix: sparse-checkout. Documented in `template/context/SETUP.md` reference docs section.
- **Task Scheduler resolves `bash` to WSL launcher, not Git Bash** — fix: `scripts/register-crons.py` rewrites `bash ...` to `"C:\Program Files\Git\usr\bin\bash.exe" ...` explicitly.
- **milvus-lite has no Windows wheels on PyPI** — fix: ship a Docker Compose stack for Milvus v2.6.16 in `milvus-deploy/`.

## Embedding model

- **gpahal/bge-m3-onnx-int8** (<https://huggingface.co/gpahal/bge-m3-onnx-int8>) — int8-quantized BGE-M3 in ONNX format. ~558MB. Multilingual. Used by memsearch with the ONNX provider so no API key is required.

## Tooling docs (for the kit itself)

- **Bun** (used by claude-mem): <https://bun.sh/> — referenced for the worker-service pattern; not a v0.1 dependency.
- **chokidar** (Node file-watcher): <https://github.com/paulmillr/chokidar> — option for the SQLite reindex strategy if we go Node.
- **fswatch / inotify** — alternatives if we stay shell-only.
- ✓ **js-yaml** (<https://github.com/nodeca/js-yaml>) — 6,400+ ⭐, MIT, ~50KB minified. YAML 1.2 parser + serializer for Node. Added as `packages/cli/cli` dependency (`^4.1.0`) in PR-2 (cleanup-layer-2-cross-module-drift, 2026-05-24) for the canonical `frontmatter.mjs` serialize/parse pair. Used with `CORE_SCHEMA` to avoid implicit Date conversion (ISO timestamps stay as strings) and `flowLevel: 1` to keep array values inline (`tags: [a, b]` not multi-line block style). Fixes the Layer-2 review's I2 finding (homegrown split-on-colon parsers were not bidirectional — booleans round-tripped as strings, arrays not at all, values with `:` truncated). Verified: package downloaded + tested via `npm install` on 2026-05-24.

## Comparable memory-system projects (inform v0.2 design)

This section captures projects whose architectures inform our v0.2 design (§16.x candidates). Each has its own dated research note under `docs/research/` with a comparison matrix + extracted implementation patterns. Listed here for license + attribution discipline; cite when porting techniques.

- ✓ **GBrain** (`github.com/garrytan/gbrain`) — 18,685 ⭐, MIT, TypeScript, created 2026-04-05 by Garry Tan (YC president/CEO). Long-term memory for AI agents over markdown + Postgres/PGLite + pgvector + BM25 hybrid retrieval. The closest production analog to claude-memory-kit. Research note: [`docs/research/2026-05-24-gbrain-architecture.md`](research/2026-05-24-gbrain-architecture.md). MIT license permits direct code reuse with attribution. Patterns we plan to absorb (techniques, with our own implementations + their attribution): (1) zero-LLM typed-edge extraction via regex + dir-whitelist for v0.2 §16.19; (2) hybrid-search formula constants (`RRF_K=60`, `0.7*rrf+0.3*cosine`, backlink-boost log formula, 0.85 floor-ratio gate) for v0.2 hybrid retrieval; (3) LongMemEval harness architecture (hermetic + reset-in-place + resume-from-path + by-type aggregation) for v0.2 §16.17 benchmarks. Verified: repo cloned + read + comparison note written 2026-05-24.

- ⚠️ **claude-remember** (`github.com/Digital-Process-Tools/claude-remember`) — Digital Process Tools (DPT), TypeScript + Python pipeline + bash glue, **"Community License"** (NOT MIT — see caveats below). Rolling-window compression for Claude Code (`now.md → today-YYYY-MM-DD.md → recent.md → archive.md`). The direct conceptual predecessor for our Tasks 28 + 29 (daily distill + weekly compress). Research notes: [`docs/research/2026-05-21-claude-remember-architecture.md`](research/2026-05-21-claude-remember-architecture.md) (high-level architecture) and [`docs/research/2026-05-25-claude-remember-code-dive.md`](research/2026-05-25-claude-remember-code-dive.md) (implementation patterns from code read).

  **License caveats — read before any port.** The Community License contains TWO clauses that affect our reuse posture: (1) NO COMMERCIAL REDISTRIBUTION — we cannot include their code in a commercial product; (2) **NO COMPETING USE** — "You may not use the Software to build or offer a product or service that competes with the Software." claude-memory-kit is plausibly a competing product. Posture: **absorb ideas / patterns / numeric values; do NOT copy code or prompts verbatim**. Copyright protects expression (code, comments, prompts) but not ideas (architecture, cooldowns, algorithms). The competing-use clause is contractual and probably unenforceable in many jurisdictions on idea-level reuse, but the safest interpretation is to write everything from scratch in our own voice with attribution here. Patterns we plan to absorb (techniques, our own implementations): (1) rolling-window architecture for Tasks 28/29; (2) Haiku sandboxing flag-set for Task 23; (3) cooldown timings (120s save, 1h NDC, 14d retention) as starting values; (4) position tracking via `last-save.json`; (5) single-pass two-stage consolidation prompt structure; (6) "identity candidates" inline-surfacing pattern for Task 45 (auto-persona). Verified: repo cloned + read + code-dive note written 2026-05-25.

## Wiki and personal knowledge bases (where this output is ingested)

- **liorwiki**: `C:/Projects/liorwiki/` (private, local). Raw ingest path: `raw/claude-memory-kit/`. Wiki pages: `wiki/`.

## How to maintain this index

- When a new URL/paper/repo is cited in any doc, add it here with a one-line description.
- Group by topic. Don't pile everything into a flat list — section headers help future readers.
- When a source becomes obsolete (project archived, paper retracted), mark it with `~~strikethrough~~` and add a one-line note about why.
- Re-verify dates / versions / metrics annually. Stars and release counts change; capture the date when you record them.
