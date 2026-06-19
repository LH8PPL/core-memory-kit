# Research notes — index

Outputs from research sessions. Each file is a dated, self-contained markdown report — either a manual survey we conducted, a Deep Research run from Claude.ai or ChatGPT, or notes on a paper/article.

## Conventions

- Filename: `{YYYY-MM-DD}-{topic-slug}.md`
- Frontmatter: required (`date`, `topic`, `source`, `tags`).
- Body: structured with clear headings; raw research output retained verbatim where useful.
- Citations: full URLs inline, not bare references.

## Index

| Date | Topic | Source | Status |
| --- | --- | --- | --- |
| 2026-05-21 | [claude-mem architecture survey](2026-05-21-claude-mem-architecture.md) | Manual survey via gh CLI + WebFetch | Complete |
| 2026-05-21 | [claude-remember architecture survey](2026-05-21-claude-remember-architecture.md) | Manual survey via WebFetch | Complete |
| 2026-05-21 | [Anthropic Memory tool documentation notes](2026-05-21-anthropic-memory-tool.md) | Manual fetch of platform.claude.com docs | Complete |
| 2026-05-21 | [Claude.ai Deep Research — Option B (targeted)](2026-05-21-claude-ai-deep-research-option-b.md) | Claude.ai Deep Research mode | Complete |
| 2026-05-22 | [ChatGPT Deep Research — Option A (broad landscape)](2026-05-22-chatgpt-deep-research-option-a.md) | ChatGPT Deep Research mode | Complete |
| 2026-05-22 | [Anthropic Claude Code auto-memory](2026-05-22-anthropic-claude-code-auto-memory.md) | Manual survey | Complete |
| 2026-05-22 | [Claude Code leak — architecture](2026-05-22-claude-code-leak-architecture.md) | Manual survey | Complete |
| 2026-05-22 | [Primary-source examination](2026-05-22-primary-source-examination.md) | Verification pass | Complete |
| 2026-05-22 | [ChatGPT bibliography](2026-05-22-chatgpt-bibliography.md) · [Claude.ai bibliography](2026-05-22-claude-ai-bibliography.md) | Deep Research bibliographies | Complete |
| 2026-05-23 | [Cold-start bootstrap A/B test](2026-05-23-bootstrap-test.md) | In-session doc-transfer experiment | Complete |
| 2026-05-24 | [Beyond the log — time-aware memory](2026-05-24-beyond-the-log-time-aware-memory.md) | Paper/article notes | Complete |
| 2026-05-24 | [GBrain architecture](2026-05-24-gbrain-architecture.md) | Manual survey | Complete |
| 2026-05-24 | [OpenClaw templates](2026-05-24-openclaw-templates.md) | Manual survey | Complete |
| 2026-05-24 | [TencentDB agent memory](2026-05-24-tencentdb-agent-memory.md) | Paper notes | Complete |
| 2026-05-25 | [claude-remember code dive](2026-05-25-claude-remember-code-dive.md) | Source code read | Complete |
| 2026-05-26 | [Claude Code memory guide — verification](2026-05-26-claude-code-memory-guide-verification.md) | Verification pass | Complete |
| 2026-05-29 | [claude-mem install model](2026-05-29-claude-mem-install-model.md) | Manual survey | Complete |
| 2026-05-30 | [gstack skill layer](2026-05-30-gstack-skill-layer.md) | Manual survey | Complete |
| 2026-06-01 | [memory lifecycle + competitive position + Layer 5 deep-research brief](2026-06-01-memory-lifecycle-and-competitive-position.md) | Synthesis + brief | Complete |
| 2026-06-01 | [how researched products implement skills (survey → Task 69.0)](2026-06-01-how-products-implement-skills.md) | Survey (gstack/claude-mem/antigravity) | Complete |
| 2026-06-01 | [deep dive: product memory implementations (source-level) + things we don't do](2026-06-01-deep-dive-product-memory-implementations.md) | Source dive (cloned repos) | Complete |
| 2026-06-04 | [Anthropic Managed-Agents Memory Stores + Dreams — validates D-61, what to steal (Tasks 95/96)](2026-06-04-anthropic-managed-agents-memory-and-dreams.md) | Primary-source fetch (platform.claude.com) | Complete |
| 2026-06-04 | [memory-os (ClaudioDrews) review — authoritative-memory instruction (Task 75) + dynamic trust (Task 97)](2026-06-04-memory-os-review.md) | WebFetch (github) | Complete |
| 2026-06-05 | [MemPalace review — verbatim+vector recall; steal the hybrid pipeline (Task 65) + temporal model (Task 66) + a benchmark (Task 99)](2026-06-05-mempalace-review.md) | WebFetch (github README) | Complete |
| 2026-06-06 | [Competitive research brief — steal / research-the-how / re-visit, for recall+temporal+trust (D-71)](2026-06-06-competitive-recall-research-brief.md) | Synthesis (planning doc) | Brief / in-progress |
| 2026-06-06 | [Source dive: memsearch + MemPalace — the HOW (hybrid recipe + RRF k=60 + keyword/temporal weights + temporal-graph schema + benchmark) (D-72)](2026-06-06-recall-deep-dive-memsearch-mempalace.md) | Cloned + read the code | Complete |
| 2026-06-06 | [Source dive: Graphiti + mem0 + memory-os — bi-temporal, ADD/UPDATE/DELETE memory-manager, the authoritative-memory Ground-Truth wording + trust decay (D-73)](2026-06-06-recall-deep-dive-graphiti-mem0-memoryos.md) | Cloned + read the code | Complete |
| 2026-06-06 | [Native Auto Memory coexistence investigation — variance not regression; the whole field captures via the Stop hook (immune); the fix is enrich auto-extract (D-74, Task 103)](2026-06-06-native-auto-memory-coexistence-investigation.md) | Live cut-gate A/B + 10 competitor READMEs + Anthropic primary source | Complete |
| 2026-06-03 | [Hermes dedicated memory/persona review pass + its trigger cadence — primary-source re-verification answering the Task 86 wedge bug (multi-rule turns don't promote)](2026-06-03-hermes-dedicated-review-primary-source.md) | Primary-source re-verification | Complete |
| 2026-06-07 | [Dual-surface CLI+MCP architecture — how products share ONE core + handle input + keep parity (source research for Task 108 / ADR-0014)](2026-06-07-dual-surface-cli-mcp-architecture.md) | Source-level research | Complete |
| 2026-06-08 | [Claude Code MCP install-config — verified findings for Task 108b.6 / R2 / D-80](2026-06-08-claude-code-mcp-install-config.md) | Primary-source verification | Complete |
| 2026-06-12 | [Stellman's ERR pattern — detect + recover from context collapse](2026-06-12-stellman-err-pattern-context-collapse.md) | Article/pattern notes | Complete |
| 2026-06-10 | [Simon Scrapes v2 — "Best Claude Memory System (Beats Hermes)"; same creator who set the video-parity bar; reviewed same day as the v0.3.0 recall build](2026-06-10-simon-scrapes-v2-best-memory-system.md) | YouTube transcript + slide captures | Complete |
| 2026-06-12 | [ruflo (ruvnet) — counter-positioning reference + one transferable idea (post-v0.3.0 review sweep; Task 55 trajectory-memory input)](2026-06-12-ruflo-counter-positioning.md) | README-level review (github) | Complete |
| 2026-06-12 | [caura-memclaw — governed fleet memory; the strongest Task-127 prior art yet (PostgreSQL+pgvector, multi-tenant, trust tiers)](2026-06-12-memclaw-fleet-memory.md) | README-level review (github) | Complete |
| 2026-06-12 | [Personal AI Infrastructure (Miessler) — the paradigm's highest-profile ally + two Task-55 inputs (RELATIONSHIP memory + LEARN-phase retrospectives; Pulse dashboard → v0.4 viewer)](2026-06-12-pai-miessler-paradigm-ally.md) | README-level review (github) | Complete |
| 2026-06-14 | [Recall TRIGGERING across systems — always-search vs judgment-pulled vs inject-everything; we shipped only the hard half of memsearch's model (missing the hint→skill link); skill triggering is semantic-intent not keyword (D-153, Task 149)](2026-06-14-recall-triggering-models-cross-system.md) | Cloned + read 9 repos + Anthropic Agent-Skills docs + skill-creator | Complete |
| 2026-06-15 | [project-memory (SpillwaveSolutions) — the Claude skill the user USED BEFORE building this kit (the origin artifact); 4 hand-maintained flat files (bugs/decisions/key_facts/issues). Every kit feature reads as a deliberate fix for a limitation here. Yields: the error→fix Issue/Root-Cause/Solution/Prevention schema (Task 55, 2nd source), Poison_Guard validates their manual "never store secrets" warning, AGENTS.md cross-tool interop (Task 50)](2026-06-15-project-memory-skill-predecessor.md) | Cloned + read the skill | Complete |
| 2026-06-15 | [AWS Bedrock AgentCore Memory + 4 AWS-build-event slides — the MANAGED-CLOUD version of the kit's exact thesis (auto-extract "strategies" = our auto-extract; fact/summary/preference records; semantic namespace retrieval; typed markdown folders). Strong validation + a positioning line ("AgentCore, but local + git-native"). One signal: error→fix as a first-class memory category → Task 55 design input](2026-06-15-aws-agentcore-memory-and-build-slides.md) | AWS primary docs + the user's build-event photos | Complete |
| 2026-06-15 | [OKF (Open Knowledge Format, Google Cloud) — STRONGEST convergence of the batch: markdown+frontmatter, git-shippable, concept-per-file, index.md + newest-first log.md, untyped prose-links — independently arrived at the kit's ADR-0002 design. Actionable as an INTEROP/export target for the team (Task 127) + cross-agent (Task 50) lanes; NOT a format to adopt-instead-of-ours](2026-06-15-okf-open-knowledge-format-interop.md) | Read the OKF v0.1 SPEC directly | Complete |
| 2026-06-15 | [agent-infra/sandbox — ORTHOGONAL: ephemeral agent EXECUTION container (browser/shell/file/MCP/VSCode), no memory/recall; nothing to borrow. One positioning insight ("the sandbox is ephemeral; the kit is the state") + a multi-harness data point](2026-06-15-agent-infra-sandbox-orthogonal.md) | Metadata + MCP-surface check (not cloned — execution sandbox, not memory) | Complete |
| 2026-06-15 | [Node.js worker_threads (freeCodeCamp) — applicability NEGATIVE result: wrong tool for the kit's short-lived-CLI + stdio-MCP + already-async/out-of-process model; the real concurrency surface (Task 146) is multi-PROCESS SQLite, not in-process threads](2026-06-15-nodejs-worker-threads-applicability.md) | Article assessed vs our execution model | Complete |
| 2026-06-15 | [Qdrant (vector DB) — assessed vs ADR-0015; RE-REJECTED as the server-vector-DB class (collides with D-23 no-server + ADR-0002 markdown-is-truth + lean-install); HNSW/quantization non-actionable at our bounded corpus scale; no new evidence to re-open](2026-06-15-qdrant-vector-db-assessment.md) | Metadata + settled-ADR assessment (not cloned — mismatch decisive) | Complete |
| 2026-06-15 | [OpenHands — context CONDENSER taxonomy as prior art for our compression layer (design §8); 4 un-adopted ideas: keep_first / minimum_progress / HARD-vs-SOFT trigger / shrink-and-retry; NOT a cross-session memory system](2026-06-15-openhands-condenser-context-management.md) | Cloned (sparse) the platform + software-agent-sdk | Complete |
| 2026-06-15 | [claude-task-master (Taskmaster) — cross-IDE PROFILE/ADAPTER pattern as Task-50 prior art (createProfile factory + rule-transformer + per-agent lifecycle hooks); incl. real Kiro paths to verify; NOT a memory system](2026-06-15-claude-task-master-cross-ide-profiles.md) | Cloned + read the JS source | Complete |
| 2026-06-15 | [TencentDB Agent Memory — CODE-LEVEL re-dive (write + search); search fully converged (hybrid RRF k=60), their batch LLM store/update/merge/skip over a unified candidate pool is the concrete blueprint for F-D / Task 95 / Task 151](2026-06-15-tencentdb-agent-memory-code-dive.md) | Cloned + read the TS source (supersedes the 05-24 README survey) | Complete |
| 2026-06-15 | [FTS5 query preparation across systems — SQLite spec §3 (primary) + basic-memory's `_prepare_search_term`; grounded Task 153's per-token quoting + flagged the node:sqlite-FTS5 gate for Task 141b](2026-06-15-fts5-query-preparation-cross-system.md) | FTS5 spec + basic-memory source | Complete |
| 2026-06-14 | [Persona PROMOTION across systems — every real system AI-judges promotion (auto), none use a human-gated review queue; our signal is backwards (form not frequency/recurrence); drop the queue, AI-judge by recurrence + post-hoc revert (D-154, Task 151)](2026-06-14-persona-promotion-models-cross-system.md) | Cloned + read 9 repos (mem0/MemoryOS/Letta/langmem/graphiti/…) + ChatGPT memory + articles | Complete |
| 2026-06-16 | [Index-uniqueness root cause for Bug 1 (`reindex --full` UNIQUE crash) — file-keyed DELETE vs id-keyed PK; 3 independent markdown-first analogs converge (TencentDB id-keyed upsert / basic-memory partial-unique-index + resolve_permalink disambiguation / memweave content-hash dedup) + SQLite UPSERT canon; fix = id-keyed upsert with archive-beats-scratchpad precedence, NOT composite PK (v0.3.3)](2026-06-16-index-uniqueness-id-vs-file-scoped-delete.md) | Cloned + read 4 repos' store/index code + memweave article + web pass | Complete |
| 2026-06-18 | [How squad keeps `decisions.md` CURRENT (auto-maintenance) — inbox drop-box + an LLM "Scribe" agent at a session-end ceremony; the kit should take squad's session-end TIMING but reject its LLM mechanism (the kit's typed-fact journal is deterministically derivable → cheap no-LLM `syncDecisionsJournal` on a hook). Source for Task 159 / D-169 auto-sync](2026-06-18-squad-decision-journal-auto-maintenance.md) | Cloned + read squad's skill files (kept at /c/tmp/squad-dive) | Complete |
| 2026-06-18 | [Session-buffer compaction under LATENCY + GROWTH — 19-system fresh-clone survey for Task 161 (the compress-session timeout spiral); 17/19 BOUND the LLM input before the call, the 2 that don't are the kit's own precedents (claude-remember unbounded@120s + pre-fix claude-mem); fix = bound the input (cap/partial-evict/mid-session-cap/shrink-retry), NOT raise the timeout. D-173 / design §8.2.5. NOTE: D-174 later INVERTED this — the kit's failure is environmental, not size-driven](2026-06-18-session-buffer-compaction-under-latency-growth.md) | Fresh clones (19 repos) + kit dogfood compress.log data | Complete |
| 2026-06-19 | [LLM-call RETRY patterns across the field — for Task 161's retry fix (after D-174 inverted the size-bound to a retry); read 9 systems' real retry code. Convergent: bounded 2–4 attempts, exponential backoff, retry ONLY transient (rate-limit/5xx/timeout/empty) keyed on error TYPE, NEVER deterministic (4xx/context-length/policy/ENOENT), reraise after exhaustion. Decisive negative: claude-remember (kit precedent) does NOT retry — the kit inherited the gap. D-175](2026-06-19-llm-call-retry-patterns-cross-system.md) | Fresh-clone code reads (9 systems' retry paths) | Complete |

### Competitor spec stacks (raw research inputs — requirements / design / tasks as written by each system)

These are external specs captured verbatim for comparison; they use their own FR/Task namespaces (not the kit's) and are excluded from the kit's reference validator.

- **ChatGPT**: [requirements](chatgpt-requirements.md) · [design](chatgpt-design.md) · [tasks](chatgpt-tasks.md)
- **Cursor**: [requirements](cursor-requirements.md) · [design](cursor-design.md) · [tasks](cursor-tasks.md)
- **Kiro**: [requirements](kiro-requirements.md) · [design](kiro-design.md) · [tasks](kiro-tasks.md)
- **Google Antigravity**: [requirements](google-antigravity-requirements.md) · [design](google-antigravity-design.md) · [tasks](google-antigravity-tasks.md)

## How research feeds into decisions

1. Research is conducted (manual or Deep Research mode).
2. Output is saved here with frontmatter.
3. Findings are summarized into either:
   - A new ADR ([adr/](../adr/)) if the research drives a decision.
   - A revision to existing requirements ([specs/requirements.md](../../specs/requirements.md)) if the research refines an existing decision.
   - A process update ([process/](../process/)) if the research changes how we work.
4. The research note's tags include the ADR numbers it informed, for traceability.

See [../process/research-prompt-design.md](../process/research-prompt-design.md) for the prompt patterns we use.
