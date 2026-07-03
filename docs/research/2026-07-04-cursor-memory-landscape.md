---
date: 2026-07-04
topic: Cursor memory landscape — native Memories removed, dynamic context discovery, mimir + memex (MCP-only competitors)
source: Manual survey (WebFetch/WebSearch on cursor.com + forum.cursor.com + GitHub; the user's wiki captures of 4 Medium articles)
tags: [cursor, cross-agent, competitive-landscape, task-196, mcp-only, native-memory-coexistence]
---

# Cursor memory landscape (Task 196 companion survey)

Surveyed 2026-07-04, mid-Task-196 (the Cursor adapter), triggered by the user's
question *"did you do research on cursor before you started?"* — this note files
what that question surfaced. It complements (does not replace) the two research
inputs the Task-196 build already stood on:

- [2026-06-20-cross-agent-adapter-seam-task50.md](2026-06-20-cross-agent-adapter-seam-task50.md)
  — claude-mem's Cursor installer (the whole-file `hooks.json` clobber bug the
  kit's over-mutation tests exist to prevent) + the config-write-primitive seam.
- [2026-06-15-claude-task-master-cross-ide-profiles.md](2026-06-15-claude-task-master-cross-ide-profiles.md)
  — Taskmaster's `cursor.js` profile (`.cursor/rules`, `.mdc`, `alwaysApply`
  frontmatter) that shaped the `defineAgentProfile` data fields.
- Plus the per-surface primary-source verification against cursor.com docs
  (hooks / MCP / rules schemas + per-event payloads) done at Task-196 start,
  recorded in the profile comments in `packages/cli/src/agent-profiles.mjs`.

## Finding 1 — Cursor's native Memories feature was REMOVED (rules are the only native persistence)

Cursor shipped "Memories" (auto-generated facts from chats, project-scoped) in
mid-2025 and **removed it in Cursor 2.1.x (late 2025)**, telling users to export
memories and convert them into Rules. The docs page
(`cursor.com/docs/context/memories`) now 404s; the community threads record the
removal and the migration guidance:

- <https://forum.cursor.com/t/are-my-memories-gone/144057>
- <https://forum.cursor.com/t/rules-vs-memories-and-global-vs-project/137149>
- <https://forum.cursor.com/t/unable-to-view-or-manage-memories-and-no-notifications/124572>

This is why "how does Cursor's memory work" has no findable answer — as of 2026
**Cursor has no native conversational memory**; static Rules
(<https://cursor.com/docs/rules>) are the only built-in persistence.

**Implications for the kit:**

1. **No native-memory coexistence problem on Cursor.** Unlike Claude Code
   (native Auto Memory → ADR-0011 + the doctor's coexistence check), there is
   nothing on Cursor for kit memory to collide or double-write with. No HC
   analog needed; the Kiro precedent (no native memory either) holds.
2. **A real, currently-open gap.** Cursor users who relied on Memories lost the
   auto-capture path and were pointed at hand-maintained rules. The kit's
   Cursor adapter restores exactly that loop (auto-capture at turn end,
   auto-inject at session start) — stronger positioning than "one more agent."
3. **Watch item:** if Cursor RE-introduces native memory in a future release,
   the coexistence question re-opens. Trigger (D-248 style): re-check on the
   first Cursor changelog entry mentioning memory, or when a Cursor user
   reports duplicate capture.

## Finding 2 — "Dynamic context discovery" (Cursor blog, 2026-01-06) validates files-first

<https://cursor.com/blog/dynamic-context-discovery> (read via the user's wiki
capture of Divy Yadav's explainer, 2026-01-11): Cursor moved to fetch-on-demand
context built on **plain files** — full command output to file (agent tails
it), full transcript to a searchable file (summaries can be re-expanded), skills
browsed as a catalogue, MCP tool descriptions synced to files (−46.9% tokens on
tool-heavy tasks), terminal history synced to files.

**Implications:** (a) independent validation of the kit's files-first thesis
(markdown in-repo, no proprietary store); (b) the transcript-to-searchable-file
behavior is a potential future capture substrate for Cursor (richer than the
`afterAgentResponse` text payload the Task-196 adapter uses) — the hook
payload's `transcript_path` field points at it; format is undocumented, so the
adapter deliberately does NOT depend on it (noted in the profile comments).

## Finding 3 — mimir + memex: the MCP-only competitor class (Cursor-compatible, judgment-gated)

Both surfaced by the user 2026-07-04; repos read via WebFetch the same day.

**mimir** (<https://github.com/MakerViking/mimir>, MIT/Apache-2.0 dual, Rust,
4★ at read time; author's writeup: "Your AI Coding Agent Has Amnesia. So I
Built It a Memory.", Medium 2026-06-13). Local-first single-binary memory
engine: one SQLite file (WAL + FTS5), hybrid BM25 + local ONNX embeddings
(bge-small) fused via RRF, optional cross-encoder rerank. One **user-scope MCP
registration** serves every repo (auto-detects project from cwd, builds a code
graph + indexes markdown in the background). Typed memories + docs + code
symbols in ONE graph (decisions link to the functions they shaped). Recall
usage strengthens ranking; typed half-life decay fades unused items; weekly
LLM-free consolidation (dedup, contradiction-flag, archive).

**memex** (<https://github.com/STiFLeR7/memex>, MIT, Python; writeup: "Building
a Memory Layer for Claude Code, Cursor, and Gemini CLI", Medium 2026-06-17).
Bitemporal knowledge graph (Neo4j + Graphiti; edges carry
`created_at`/`expired_at`), tree-sitter symbol extraction, Gemini Flash
synthesizes commits into Decision nodes. 14 MCP tools (8 read / 4 write / 2
analytic). Two-regime confidence decay (validated ~139d half-life; unvalidated
stale at 30d), Leiden clustering to keep context ≤1500 tokens, per-node-type
write ACLs, an Anthropic `memory_20250818` adapter.

**The structural difference from the kit** — both are **MCP-only** on every
agent including Cursor: the agent must *decide* to call `recall`/`remember`.
That is precisely the judgment-gated recall failure mode documented in
[2026-06-14-recall-triggering-models-cross-system.md](2026-06-14-recall-triggering-models-cross-system.md)
(even Cursor's `alwaysApply` rule variant "doesn't escape the judgment
decision"). The kit's Cursor adapter wires **deterministic lifecycle hooks**
(`sessionStart` inject / `beforeSubmitPrompt` + `afterAgentResponse` capture /
`beforeShellExecution` delete-guard) — no judgment in the loop — plus in-repo
committed memory that travels with `git clone` (both competitors store outside
the repo: `~/.local/share/mimir`, a Neo4j instance).

**Worth stealing (candidate fold-ins, NOT filed as tasks yet):**

- mimir's *recall-usage reinforcement* + typed half-life decay rhyme with the
  kit's trust-score / heat lanes (Tasks 151-shipped, 176, 190) — but note the
  kit's D-253 line: recurrence reinforces importance/validity, never as a
  "memory worked" signal. mimir's "recall strengthens ranking" is exactly the
  signal-quality question ADR-0017's two-axis judge exists to handle.
- memex's *bitemporal edges* (`created_at`/`expired_at`) are a graph-shaped
  cousin of Task 66's temporal validity (shipped v0.4.4) — convergent design,
  no action.
- memex's two-regime decay (validated vs unvalidated) is a candidate refinement
  for the trust-score aging discussion if/when Task 190 opens (v0.5.0) — noted
  there rather than a new task (the D-248 rule: no trigger, no task).

## Verdict

The Task-196 build order was right: adapter-seam research + fresh primary-source
surface verification covered what the CODE needed. What it missed — and this
survey adds — is the *market/coexistence* layer: Cursor's native memory is gone
(gap + no-collision), and the visible competitor class on Cursor is MCP-only
(the kit's hook-wired determinism is the differentiator). No design change to
Task 196 results; one watch-item trigger recorded (Finding 1.3).
