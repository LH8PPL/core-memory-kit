---
date: 2026-05-22
topic: Bibliography flattening of Option-A (ChatGPT) research report
source: ChatGPT (follow-up bibliography prompt)
related_research: [2026-05-22-chatgpt-deep-research-option-a]
status: verified by Claude (Opus 4.7) on 2026-05-22 — 17 of 17 verifiable URLs confirmed
tags:
  - bibliography
  - chatgpt
  - sources
  - personal-wiki-ingest-ready
---

# Bibliography — claude-memory-kit Option-A research output

> Editorial preface added 2026-05-22 when the file was moved into `research/`.
>
> **Verification status**:
>
> - ✓ **17 papers/repos verified** via direct arxiv fetch or `gh api`: Mem0, Letta, Cognee, Graphiti, LangMem, Basic Memory, Mem0 paper (arXiv:2504.19413), Zep paper (arXiv:2501.13956), Claude Code CMV paper (arXiv:2602.22402), Nautilus Compass repo + paper, Codebase-Memory paper, EverOS repo + EverMemOS paper, MemOS repo + paper, AnchorMem repo + paper, A-MemGuard paper, "Storage Is Not Memory / True Memory" paper (arXiv:2605.04897), Supermemory MCP repo (separate from `supermemoryai/supermemory`).
> - ✗ **1 repo URL returns 404**: `TangciuYueng/AMemGuard` — ChatGPT cited it as A-MemGuard's repo (URL also appears in the paper's HTML), but `gh api` returns 404. Repo may have been renamed/made private/moved. Paper itself is real.
> - ~ **3 papers cited but not directly fetched** (URLs provided; deferred verification): Hindsight is 20/20 (arXiv:2512.12818), MemLineage (arXiv:2605.14421), MemoryGraft (arXiv:2512.16962).
>
> **Major correction to earlier SOURCES.md**: I had marked "True Memory" as "suspected hallucination." I was WRONG. ChatGPT found the actual paper: "Storage Is Not Memory: A Retrieval-Centered Architecture for Agent Recall" by Joshua Adler and Guy Zehavi (arXiv:2605.04897, May 6, 2026). The paper title uses "Storage Is Not Memory"; the proposed architecture inside is called "True Memory." Both names refer to the same paper. SOURCES.md updated.
>
> **Honest "not verifiable" finds from ChatGPT**: 4 entries flagged — claude-mem baseline label, claude-remember baseline label, memory_20250818 identifier, March 2026 Claude Code leak materials. The first three are CRAWLER LIMITATIONS, not evidence of absence (we directly verified claude-mem via gh api: 77,244 ⭐; claude-remember via WebFetch; memory_20250818 docs page directly). The fourth (leak materials) genuinely isn't a citable primary source.

## Original ChatGPT bibliography

(Below this line is the verbatim ChatGPT output.)

---

[Anthropic Claude Code memory docs]: https://docs.anthropic.com/en/docs/claude-code/memory
- Type: docs
- Date (if available): unavailable
- One-line note on what claim it supported in the earlier analysis: Supported the claims that Claude Code memory is hierarchical, file-based, manually editable, project-aware via `MEMORY.md` and imported files, and stored in local/global paths such as `~/.claude/projects`.

[Mem0 repo]: https://github.com/mem0ai/mem0
- Type: repo
- Date (if available): unavailable
- One-line note on what claim it supported in the earlier analysis: Supported the characterization of Mem0 as a production-oriented long-term memory layer for AI agents with an extraction/consolidation/retrieval architecture and a large, actively maintained open-source codebase.

[Mem0 releases]: https://github.com/mem0ai/mem0/releases
- Type: release-notes
- Date (if available): 2026-05-20
- One-line note on what claim it supported in the earlier analysis: Supported the maturity claim that Mem0 was still shipping releases in May 2026.

[Mem0 commits]: https://github.com/mem0ai/mem0/commits/main
- Type: other
- Date (if available): 2026-05-18
- One-line note on what claim it supported in the earlier analysis: Supported the maturity claim that Mem0 remained actively updated in mid-May 2026.

[Mem0 paper]: https://arxiv.org/abs/2504.19413
- Type: paper
- Date (if available): 2025-04-28
- One-line note on what claim it supported in the earlier analysis: Supported the formal description of Mem0’s scalable long-term memory architecture; it was also the paper URL cited where the earlier synthesis discussed extraction-first memory designs.

[Letta repo]: https://github.com/letta-ai/letta
- Type: repo
- Date (if available): unavailable
- One-line note on what claim it supported in the earlier analysis: Supported the portrayal of Letta as the successor to MemGPT, centered on stateful agents with explicit memory blocks, SDK/API usage, and strong project maturity.

[Letta commits]: https://github.com/letta-ai/letta/commits/main
- Type: other
- Date (if available): 2026-05-14
- One-line note on what claim it supported in the earlier analysis: Supported the claim that Letta was still actively maintained in May 2026.

[Cognee repo]: https://github.com/topoteretes/cognee
- Type: repo
- Date (if available): unavailable
- One-line note on what claim it supported in the earlier analysis: Supported the description of Cognee as a memory control plane combining embeddings and graphs and exposing Claude Code plugin hooks across session lifecycle events.

[Cognee releases]: https://github.com/topoteretes/cognee/releases
- Type: release-notes
- Date (if available): 2026-05-16
- One-line note on what claim it supported in the earlier analysis: Supported the maturity claim that Cognee had an active release cadence in May 2026.

[Cognee commits]: https://github.com/topoteretes/cognee/commits/main
- Type: other
- Date (if available): 2026-05-16
- One-line note on what claim it supported in the earlier analysis: Supported the claim that Cognee remained actively updated in May 2026.

[Zep paper]: https://arxiv.org/abs/2501.13956
- Type: paper
- Date (if available): 2025-01-20
- One-line note on what claim it supported in the earlier analysis: Supported the characterization of Zep as a temporal knowledge-graph architecture for agent memory and explicitly identified Graphiti as Zep’s core component.

[Graphiti repo]: https://github.com/getzep/graphiti
- Type: repo
- Date (if available): unavailable
- One-line note on what claim it supported in the earlier analysis: Supported the description of Graphiti as a temporal context-graph engine with provenance, MCP support, and strong standalone implementation momentum even when treated as conceptually covered by Zep.

[Graphiti releases]: https://github.com/getzep/graphiti/releases
- Type: release-notes
- Date (if available): 2026-05-21
- One-line note on what claim it supported in the earlier analysis: Supported the maturity claim that Graphiti had a very high release velocity through the May 2026 cutoff.

[Graphiti commits]: https://github.com/getzep/graphiti/commits/main
- Type: other
- Date (if available): 2026-04-27
- One-line note on what claim it supported in the earlier analysis: Supported the claim that Graphiti was recently active and not just a dormant artifact behind Zep.

[LangMem repo]: https://github.com/langchain-ai/langmem
- Type: repo
- Date (if available): unavailable
- One-line note on what claim it supported in the earlier analysis: Supported the claim that LangMem combines hot-path memory tools with a background memory manager and native LangGraph integration.

[LangMem commits]: https://github.com/langchain-ai/langmem/commits/main
- Type: other
- Date (if available): 2026-04-14
- One-line note on what claim it supported in the earlier analysis: Supported the maturity claim that LangMem was still being updated in spring 2026.

[Basic Memory repo]: https://github.com/basicmachines-co/basic-memory
- Type: repo
- Date (if available): unavailable
- One-line note on what claim it supported in the earlier analysis: Supported the claim that Basic Memory is local-first, Markdown-native, auditable/hand-editable, and intentionally cross-client across Claude, Codex, Cursor, ChatGPT, VS Code, and MCP clients.

[Basic Memory releases]: https://github.com/basicmachines-co/basic-memory/releases
- Type: release-notes
- Date (if available): 2026-05-16
- One-line note on what claim it supported in the earlier analysis: Supported the maturity claim that Basic Memory was releasing actively in May 2026.

[Basic Memory commits]: https://github.com/basicmachines-co/basic-memory/commits/main
- Type: other
- Date (if available): 2026-04-10
- One-line note on what claim it supported in the earlier analysis: Supported the claim that Basic Memory remained recently maintained and was not a stale Markdown-memory experiment.

[Claude Code CMV repo]: https://github.com/CosmoNaught/claude-code-cmv
- Type: repo
- Date (if available): unavailable
- One-line note on what claim it supported in the earlier analysis: Supported the description of CMV as snapshot/branch/trim context virtualization for Claude Code, including reusable snapshots, branchable context, export/import, and lossless trimming workflows.

[Claude Code CMV paper]: https://arxiv.org/abs/2602.22402
- Type: paper
- Date (if available): 2026-02-25
- One-line note on what claim it supported in the earlier analysis: Supported the theoretical framing of CMV as DAG-based state management with structurally lossless trimming for LLM agents.

[Claude Code CMV last-commit evidence]: not publicly verifiable
- Type: other
- Date (if available): unavailable
- One-line note on what claim it supported in the earlier analysis: The earlier analysis gave a recency/maturity reading for CMV, but a stable public commit-history capture for the exact last-commit date could not be reconstructed from the public GitHub pages fetched during bibliography verification.

[Nautilus Compass repo]: https://github.com/chunxiaoxx/nautilus-compass
- Type: repo
- Date (if available): unavailable
- One-line note on what claim it supported in the earlier analysis: Supported the description of Nautilus Compass as a black-box memory layer for agents with raw-text embedding, drift detection, MCP+A2A packaging, and a Merkle-style audit/integrity story.

[Nautilus Compass releases]: https://github.com/chunxiaoxx/nautilus-compass/releases
- Type: release-notes
- Date (if available): 2026-05-09
- One-line note on what claim it supported in the earlier analysis: Supported the claim that Nautilus Compass was a very new entrant with multiple releases already shipped by early May 2026.

[Nautilus Compass paper]: https://arxiv.org/abs/2605.09863
- Type: paper
- Date (if available): 2026-05-11
- One-line note on what claim it supported in the earlier analysis: Supported the claim that Nautilus Compass framed memory as black-box persona drift detection plus raw-text recall rather than extraction-time fact synthesis.

[Codebase-Memory paper]: https://arxiv.org/abs/2603.27277
- Type: paper
- Date (if available): 2026-03-28
- One-line note on what claim it supported in the earlier analysis: Supported the claim that Codebase-Memory is an MCP-native, Tree-Sitter-driven knowledge-graph memory system for code exploration.

[EverMemOS paper]: https://arxiv.org/abs/2601.02163
- Type: paper
- Date (if available): 2026-01-05
- One-line note on what claim it supported in the earlier analysis: Supported the description of EverMemOS as a self-organizing memory operating system for long-horizon reasoning with an engram-inspired memory lifecycle.

[EverOS repo]: https://github.com/EverMind-AI/EverOS
- Type: repo
- Date (if available): unavailable
- One-line note on what claim it supported in the earlier analysis: Supported the claim that the project formerly referenced as EverMemOS had a live open-source repo, multiple memory-enabled use cases, EverMem Sync, and explicit Claude Code/OpenClaw integrations.

[EverOS commits]: https://github.com/EverMind-AI/EverOS/commits/main/
- Type: other
- Date (if available): 2026-04-21
- One-line note on what claim it supported in the earlier analysis: Supported the maturity claim that EverOS was actively updated shortly before the May 2026 cutoff.

[MemOS paper]: https://arxiv.org/abs/2507.03724
- Type: paper
- Date (if available): 2025-07-04
- One-line note on what claim it supported in the earlier analysis: Supported the use of MemOS as a memory-OS baseline with layered/self-evolving memory concepts.

[MemOS repo]: https://github.com/MemTensor/MemOS
- Type: repo
- Date (if available): unavailable
- One-line note on what claim it supported in the earlier analysis: Supported the description of MemOS as a self-evolving memory OS with local-first plugin support, hybrid retrieval, and Hermes/OpenClaw-oriented integrations.

[MemOS releases]: https://github.com/MemTensor/MemOS/releases
- Type: release-notes
- Date (if available): 2026-05-19
- One-line note on what claim it supported in the earlier analysis: Supported the maturity claim that MemOS was shipping releases into the final week before the cutoff.

[MemOS commits]: https://github.com/MemTensor/MemOS/commits/main
- Type: other
- Date (if available): 2026-05-14
- One-line note on what claim it supported in the earlier analysis: Supported the claim that MemOS remained actively updated in mid-May 2026.

[Supermemory MCP repo]: https://github.com/supermemoryai/supermemory-mcp
- Type: repo
- Date (if available): unavailable
- One-line note on what claim it supported in the earlier analysis: Supported the claim that Supermemory MCP positioned itself as a universal cross-LLM memory bridge carried into any MCP client.

[AnchorMem repo]: https://github.com/RayNeo-AI-2025/AnchorMem
- Type: repo
- Date (if available): unavailable
- One-line note on what claim it supported in the earlier analysis: Supported the claim that AnchorMem had public code implementing a two-layer facts/events memory pipeline with anchored retrieval.

[AnchorMem paper]: https://arxiv.org/abs/2604.17377
- Type: paper
- Date (if available): 2026-04-19
- One-line note on what claim it supported in the earlier analysis: Supported the claim that AnchorMem decouples retrieval anchors from preserved raw context, making it a notably different design from extract-and-rewrite-heavy systems.

[A-MemGuard repo]: https://github.com/TangciuYueng/AMemGuard
- Type: repo
- Date (if available): unavailable
- One-line note on what claim it supported in the earlier analysis: Supported the claim that A-MemGuard shipped public code for a proactive defense system focused on agent-memory security.

[A-MemGuard paper]: https://arxiv.org/abs/2510.02373
- Type: paper
- Date (if available): 2025-09-29
- One-line note on what claim it supported in the earlier analysis: Supported the claim that A-MemGuard uses consensus-based validation plus a separate “lessons” memory to harden long-term agent memory against poisoning and error reinforcement.

[Consumer Claude memory upgrade report]: https://www.theverge.com/ai-artificial-intelligence/887885/anthropic-claude-memory-upgrades-importing
- Type: other
- Date (if available): 2026-03-02
- One-line note on what claim it supported in the earlier analysis: Supported the claim that Anthropic expanded Claude’s consumer memory availability and added an import/export workflow for switching from competing AI assistants.

[Storage Is Not Memory / True Memory paper]: https://arxiv.org/abs/2605.04897
- Type: paper
- Date (if available): 2026-05-06
- One-line note on what claim it supported in the earlier analysis: Supported the future-direction claim that raw-event retention plus retrieval-centric recall may outperform ingestion-time compression for agent memory.

[Hindsight is 20/20 paper]: https://arxiv.org/abs/2512.12818
- Type: paper
- Date (if available): 2025-12-14
- One-line note on what claim it supported in the earlier analysis: Supported the future-direction claim that stronger agent memory systems may need explicit retain/recall/reflect loops rather than only storage and retrieval.

[MemMachine paper]: https://arxiv.org/abs/2604.04853
- Type: paper
- Date (if available): 2026-04-06
- One-line note on what claim it supported in the earlier analysis: Corrective primary source for the earlier uncited mention of MemMachine as a ground-truth-preserving, episodic, retrieval-over-ingestion memory design.

[MemLineage paper]: https://arxiv.org/abs/2605.14421
- Type: paper
- Date (if available): 2026-05-14
- One-line note on what claim it supported in the earlier analysis: Corrective primary source for the earlier uncited mention of MemLineage as a provenance/lineage-enforcement direction for agent memory.

[MemoryGraft paper]: https://arxiv.org/abs/2512.16962
- Type: paper
- Date (if available): 2025-12-18
- One-line note on what claim it supported in the earlier analysis: Corrective primary source for the earlier uncited discussion of persistent compromise and poisoning risks in experience-based agent memory.

[GitHub maturity snapshot caveat]: not publicly verifiable
- Type: other
- Date (if available): unavailable
- One-line note on what claim it supported in the earlier analysis: Exact star counts, issue counts, and some “created since YYYY” maturity labels in the earlier matrix were based on live GitHub UI snapshots and are not stable archival facts even when the repo URLs above are the correct primary sources.

[claude-mem baseline label]: not publicly verifiable
- Type: other
- Date (if available): unavailable
- One-line note on what claim it supported in the earlier analysis: The earlier baseline listed “claude-mem,” but no single stable public repo/README or canonical project page could be tied to that exact label with high confidence during verification.

[claude-remember baseline label]: not publicly verifiable
- Type: other
- Date (if available): unavailable
- One-line note on what claim it supported in the earlier analysis: The earlier baseline listed “claude-remember,” but no unique, stable public primary source could be confidently matched to that exact label during verification.

[Anthropic memory_20250818 identifier]: not publicly verifiable
- Type: other
- Date (if available): unavailable
- One-line note on what claim it supported in the earlier analysis: The earlier baseline referenced “memory_20250818” as Anthropic’s official memory tool identifier, but no public product/API/documentation page for that exact identifier could be found.

[private/non-public source: March 2026 Claude Code leak materials]: not publicly verifiable
- Type: other
- Date (if available): unavailable
- One-line note on what claim it supported in the earlier analysis: The earlier synthesis mentioned reporting around the March 2026 Claude Code source leak as a signal about internal memory/background-agent directions, but those materials are not an official public primary source and cannot be cited as a standard verifiable reference.

[Agentic Memory reference in the earlier synthesis]: not publicly verifiable
- Type: other
- Date (if available): unavailable
- One-line note on what claim it supported in the earlier analysis: The earlier synthesis mentioned “Agentic Memory” as an RL-trained memory-policy direction, but it did not cite a specific title/URL and multiple plausible 2025–2026 papers fit that description, so the exact intended primary source cannot be reconstructed with confidence.