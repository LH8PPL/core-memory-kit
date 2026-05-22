# Master sources index

Every URL, paper, repo, video, and blog post cited anywhere in `claude-memory-kit`. The authoritative reference list. When you need a citation, link here.

For deep-dive notes on individual sources, see [sources/](sources/). For source-by-research-output mapping, see [research/INDEX.md](research/INDEX.md).

## Conceptual / inspiration

- **Simon Scrapes — "Master Claude Memory to Get Ahead of 99% of People"** ([YouTube](https://www.youtube.com/watch?v=rFWxRZ5D-lM), [companion Notion](https://scrapeshq.notion.site/claude-memory-systems)) — the source pattern for layered, per-project memory; the four-component Layer 4 design (PreToolUse + Stop + skill + auto-extract); the frozen-snapshot concept. Deep-dive: [sources/simon-scrapes-master-claude-memory.md](sources/simon-scrapes-master-claude-memory.md).
- **Hermes** (Anthropic example agent) — the frozen-snapshot pattern that inspired SOUL.md as a separate "how Claude shows up" file from USER.md ("who the user is").
- **AWS Kiro — "From Chat to Specs Deep Dive"** (<https://kiro.dev/blog/from-chat-to-specs-deep-dive/>) — the spec-driven workflow we adopted. Three-document structure: requirements → design → tasks. Deep-dive: [sources/kiro-spec-driven-deep-dive.md](sources/kiro-spec-driven-deep-dive.md).

## Competitive landscape (memory systems for AI agents)

- **thedotmack/claude-mem** (<https://github.com/thedotmack/claude-mem>) — 77,244 ⭐ as of 2026-05-21. Global opaque SQLite + Chroma. Cross-agent (Claude/Codex/Gemini/Hermes/Copilot). 30 releases, latest `v13.3.0` (2026-05-21). Research note: [research/2026-05-21-claude-mem-architecture.md](research/2026-05-21-claude-mem-architecture.md).
- **Digital-Process-Tools/claude-remember** (<https://github.com/Digital-Process-Tools/claude-remember>) — Per-project markdown, Haiku-compressed daily summaries. Closest design sibling to our kit. Research note: [research/2026-05-21-claude-remember-architecture.md](research/2026-05-21-claude-remember-architecture.md).
- **Anthropic official Memory tool** (<https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool>) — API-level (`type: memory_20250818` beta). Client-side `/memories/*.md` files. Validates the markdown-as-storage choice. Research note: [research/2026-05-21-anthropic-memory-tool.md](research/2026-05-21-anthropic-memory-tool.md).
- **mem0ai/mem0** (<https://github.com/mem0ai/mem0>) — Extraction-as-a-service, GPT-4o-mini by default. Self-hostable.
- **letta-ai/letta** (formerly MemGPT) (<https://github.com/letta-ai/letta>) — Tiered memory; the agent decides when to spill from core to archival via tool calls.
- **topoteretes/cognee** (<https://github.com/topoteretes/cognee>) — Knowledge-graph-first with 14 retrieval modes.
- **getzep/zep** (<https://github.com/getzep/zep>) — Temporal knowledge graph, async background extraction. Apache-2.0.
- **LangMem** (LangChain's memory module) — referenced; specific URL captured per-research-run.
- **Fail-Safe/Noema** — Markdown source-of-truth + SQLite FTS5 index. Closest architectural sibling. P2P federation with vector clocks. Cited in Option-B research.
- **codenamev/claude_memory** (Ruby) — 3 hooks + MCP-for-everything inversion. Novel pattern worth borrowing in v0.2+.
- **coleam00/claude-memory-compiler** — SessionEnd + PreCompact safety net. Daily log → knowledge articles via Claude Agent SDK in background.
- **disler/claude-code-hooks-mastery** (<https://github.com/disler/claude-code-hooks-mastery>) — Reference logger covering all 13 hook events using UV-managed Python.
- **luongnv89/claude-howto** — 29-event hook matrix including newer events (InstructionsLoaded, UserPromptExpansion, etc.).
- **memvid/claude-brain** — Single `.mv2` binary (Rust). Zero-dependency endpoint.
- **doobidoo/mcp-memory-service** (<https://github.com/doobidoo/mcp-memory-service>) — Multi-backend MCP. Self-reported 86.0% R@5 at v10.35.0+.

## Anthropic / Claude Code references

- **Claude Code plugins reference**: <https://code.claude.com/docs/en/plugins> — manifest format (`.claude-plugin/plugin.json`), skills/hooks/agents directory conventions, `--plugin-dir` for testing, `/plugin install` for marketplace.
- **Claude Code hooks documentation**: <https://docs.claude.com/en/docs/claude-code/hooks> — payload schemas, additionalContext output protocol.
- **Claude Code skills documentation**: <https://docs.claude.com/en/docs/claude-code/skills> — SKILL.md frontmatter.
- **Anthropic Memory tool docs**: <https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool>.
- **Effective context engineering**: <https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents>.
- **Effective harnesses for long-running agents**: <https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents>.
- **Anthropic SDK examples** (Python memory): <https://github.com/anthropics/anthropic-sdk-python/blob/main/examples/memory/basic.py>.
- **Anthropic SDK examples** (TypeScript memory): <https://github.com/anthropics/anthropic-sdk-typescript/blob/main/examples/tools-helpers-memory.ts>.
- **Bug: hook double-fire from marketplace + cache**: <https://github.com/anthropics/claude-code/issues/24115>.
- **Bug: command-template dedup collision**: <https://github.com/anthropics/claude-code/issues/29724>.

## Anthropic models (cost data, May 2026)

| Model | Input $/MTok | Output $/MTok | Notes |
| --- | --- | --- | --- |
| **claude-haiku-4-5** (`claude-haiku-4-5-20251001`) | $1 | $5 | Batch $0.50/$2.50; primary compressor for v0.1 |
| **claude-sonnet-4-6** | $3 | $15 | Batch $1.50/$7.50; option for high-stakes compression |
| **claude-opus-4-7** | $5 | $25 | Overkill for compression; used for design / planning conversations |

Source: Anthropic Haiku page (<https://anthropic.com/claude/haiku>); referenced in Option-B research TL;DR.

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

- **LightMem** (zjunlp et al., ICLR 2026, arXiv:2510.18866) — 3-stage architecture (sensory → topic-aware short-term → sleep-time long-term). Reports 38× token reduction. Repo: <https://github.com/zjunlp/LightMem>. ArXiv: <https://arxiv.org/abs/2510.18866>.
- **SGMem** (arXiv:2509.21212) — Sentence-graph memory with cross-session aggregation.
- **A Simple Yet Strong Baseline** (Zhou et al., Nov 2025, arXiv:2511.17208) — Argues for non-compressive enriched EDUs rather than aggressive summarization.
- **KVzip** (Kim et al., arXiv:2505.23416) — KV cache compression with 3-4× size reduction; runs locally. Relevant for air-gapped deployments. <https://arxiv.org/abs/2505.23416>.
- **ProMem** ("Beyond Static Summarization", arXiv:2601.04463) — Adds a self-questioning extraction phase.
- **A Comparative Analysis of Identifier Schemes** (Karimian Kakolaki, Sep 2025, arXiv:2509.08969) — UUIDv4 vs UUIDv7 vs ULID for distributed systems. Informed ADR-0007. <https://arxiv.org/abs/2509.08969>.

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

## Wiki and personal knowledge bases (where this output is ingested)

- **liorwiki**: `C:/Projects/liorwiki/` (private, local). Raw ingest path: `raw/claude-memory-kit/`. Wiki pages: `wiki/`.

## How to maintain this index

- When a new URL/paper/repo is cited in any doc, add it here with a one-line description.
- Group by topic. Don't pile everything into a flat list — section headers help future readers.
- When a source becomes obsolete (project archived, paper retracted), mark it with `~~strikethrough~~` and add a one-line note about why.
- Re-verify dates / versions / metrics annually. Stars and release counts change; capture the date when you record them.
