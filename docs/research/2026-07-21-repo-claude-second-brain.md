# Repo read: jason-c-dev/claude-second-brain

**Date:** 2026-07-21
**Source:** https://github.com/jason-c-dev/claude-second-brain (cloned to `C:/Projects/research-clones/claude-second-brain`, HEAD `86a3840`, 2026-04-12)

## What it claims

README: "A complete autonomous Claude Code agent that maintains a personal knowledge
base, runs overnight **dream cycles**, and stays reachable via Telegram." Built on the
Karpathy LLM Wiki gist pattern + "inspired by Anthropic's Auto Dream memory system."
Features table advertises: LLM Wiki, Dream Cycles ("overnight memory consolidation"),
Obsidian-compatible **graph view "for free,"** a "Compiled Manifest" that gives "O(1)
inventory, not O(n) log scanning," and a "Subagent Architecture" that "avoids the
self-evaluation trap." Companion blog series: "Dreaming AI" Parts 1-2 (Medium, by the
same public byline — not followed/verified in this pass).

## What the evidence actually shows

This is a **prompt/skill scaffold around markdown files, not a memory engine.** Total
custom code: 637 lines (2 tiny Bun/MCP TypeScript servers + 1 Python hook + 2 shell
scripts) plus 447 lines of skill-prompt markdown. Zero tests, zero CI (`.github/`
absent), zero database, zero embeddings, zero graph library. Repo is 4 days old
(created 2026-04-08, last push 2026-04-12), 29 commits, 2 stars, 0 forks — a
blog-companion side project, not a maintained system. MIT license, public author
`jason-c-dev` (named here only because they're the repo's public GitHub byline, per
project norms for public article/repo authors).

Every "cognitive" behavior — dedup, staleness pruning, contradiction resolution, wiki
compilation, quality scoring — is **delegated entirely to LLM judgment inside a
SKILL.md prompt.** There is no deterministic floor, no similarity threshold, no
code-adjudicated decision anywhere in the consolidation path. The only genuinely
deterministic code is: an MCP webhook relay (Bun/TS, ~93 lines), a whisper.cpp
transcription MCP tool (~81 lines), and a PreToolUse/UserPromptSubmit hook that gates
tool calls until a Telegram ack fires (~134 lines, plain Python stdlib, file-based
state at `/tmp/claude_telegram_gate.json`).

## Mechanism detail (the HOW)

**Entry points / data flow** (verified in `README.md` §Architecture + `CLAUDE.md` +
the two `.ts` servers):
- `.channels/webhook-channel/src/index.ts` — Bun HTTP server (`Bun.serve`) on port
  8790 wraps an MCP `Server` (stdio transport) that does nothing but forward any POST
  body as an MCP `notifications/claude/channel` push into the live Claude Code
  session. No tools exposed (`ListToolsRequestSchema` returns `[]`).
- `.config/crontab` (not present in the clone — only referenced in docs) fires
  `curl -X POST http://127.0.0.1:8790/dream-memory` at 2:03 AM and
  `/dream-wiki` at 3:33 AM.
- The **live, already-running** Claude Code session (`./start.sh` must be active;
  README's own troubleshooting section: "Is Claude running? `./start.sh` must be
  active") receives the MCP notification and routes by path per `CLAUDE.md`'s
  "## Webhook Events" instructions to the matching skill command
  (`/dream-memory` or `/dream-wiki`).

**Memory model — what is stored, where, what format:**
- **"Memory"** = Claude Code's own **native/harness auto-memory** directory
  (`~/.claude/projects/<slug>/memory/`) — the repo does not build its own memory
  store. `dream-memory`'s subagent prompt literally says "check
  `~/.claude/projects/` for the `memory/` subfolder matching this project path."
  Files use YAML frontmatter (`name`/`description`/`type` ∈
  `{user, feedback, project, reference}`) — structurally similar to
  core-memory-kit's `context/memory/*.md` frontmatter, but this is the harness's
  own facility, not a custom in-repo tier.
- **"Wiki"** = plain markdown files under `wiki/<topic>/*.md` with YAML frontmatter
  (`created`/`updated`/`source`), `[[wikilinks]]`, and a hand-maintained
  `wiki/_master-index.md` + per-topic `_index.md`. `raw/` is an append-only,
  never-modified inbox for source material.

**Retrieval path — confirmed NOT a database:**
There is no FTS engine, no vector store, no embeddings anywhere in the repo (`grep`
for `sqlite`/`vector`/`embed`/`faiss`/`chroma` across all source: zero hits). Search
is one of: (a) `Grep`/`Read` over the wiki tree by the live agent, or (b) an
**external** CLI, `obsidian-cli` (`npm install -g obsidian-cli`, not vendored,
"requires Obsidian to be running" — README's own words), invoked as
`obsidian vault="Vault" search query="..."` / `obsidian vault="Vault" backlinks
file="..."`. CLAUDE.md tells the agent to prefer this over Grep, but it is an
optional third-party tool, and its "search index" and "backlink graph" are
Obsidian-desktop-app internals this repo has zero code access to — it is a shell-out,
not a library call.

**"Graph" usage — the load-bearing check for this pass:**
**No graph store exists in code.** `grep -rn "graph\|node\|edge" .channels .tools
.hooks` returns nothing structural. The word "graph" in this repo means exactly one
thing: Obsidian desktop's own built-in graph-view panel, which renders whatever
`[[wikilinks]]` happen to exist in the vault's markdown — a feature of the external
Obsidian app, not code this project ships or can traverse. The repo's own agent has
no programmatic way to walk that graph; it can only ask the optional `obsidian-cli`
for `backlinks file="X"` (one hop, string-shelled to the desktop app, not a query the
agent's own process can inspect or cache). Verified via: `_channels`/`.tools` source
files (no graph library import), `CLAUDE.md` line "Wiki `[[links]]` render as
clickable graph connections" (rendering, not code), and README's "Obsidian
Integration" section which frames the whole feature as "you get graph view of your
knowledge for free" — i.e., free because it's not built here.

**Consolidation/curation path — what triggers it, what it rewrites/deletes:**
Two "dream" skills, both **100% prose instructions to an LLM subagent**, no code:
- `.claude/skills/dream-memory/SKILL.md` (85 lines) — 5-phase prompt (Orient / Gather
  / Consolidate / Prune and Index / Return Summary). Phase 3 literally instructs:
  "Deleting contradicted facts at the source" and "Removing stale memories" — **no
  archive step, no tombstone, no review queue** for what is explicitly a destructive
  operation. Phase 2's "gather" step is "grep the JSONL transcripts for narrow terms
  only" — no similarity search, no embeddings, pure keyword grep chosen ad hoc by the
  subagent.
- `.claude/skills/dream-wiki/SKILL.md` (75 lines) — 5-phase prompt (Inventory /
  Triage / Compile / Cross-Link Audit / Return Summary). "Inventory" uses a flat-text
  manifest, `.config/compiled-raw.txt` (one filename per line), read+appended by the
  subagent itself — not a database, not hashed, not indexed; a compiled-or-not check
  is a linear substring scan over this file. Despite the README calling this "O(1)
  inventory, not O(n) log scanning," it is still an O(n) scan — just over a shorter
  n (compiled-file count) than the full session-log alternative it's contrasted
  against. Directionally true, technically mislabeled.
- Both spawn via the `Agent` tool as a **fresh-context subagent** that "inherits
  CLAUDE.md conventions but has no session history" — the stated rationale (README
  "Why subagents?") is avoiding a "self-evaluation trap": an agent reviewing its own
  session's memories in the same context that created them will rationalize keeping
  bad entries. This is a real, named design principle (not just marketing filler) —
  it's argued at length in README's Dream Cycles section and mirrored in both
  SKILL.md files' final instruction: "Do NOT send Telegram messages or update
  wiki/log.md — the orchestrator handles reporting" (subagent returns text only; the
  parent session does all side-effecting I/O).
- `.claude/skills/wiki-audit/SKILL.md` (49 lines) adds a numeric "structural quality
  score /100" with a 6-category weighted rubric (Index integrity, Cross-links,
  Consistency, Coverage, Staleness, Formatting), logged to `wiki/log.md` over time —
  the one place this repo has a quantified, trend-trackable health metric, though
  the scoring itself is still LLM-judgment-assigned, not computed.

**The one deterministic enforcement mechanism** — `.hooks/telegram_gate.py`
(PreToolUse + UserPromptSubmit hooks): closes a gate (file-based state) when a
Telegram-sourced prompt arrives, blocks (exit code 2) every non-Telegram tool call
until the agent sends a react+reply, with a 3-strikes circuit breaker that force-opens
the gate. This is the repo's only "prose isn't enough, make it code" instance —
structurally the same move as core-memory-kit's validator philosophy
("Prose rules vs enforcement"), applied to exactly one behavior (ack-before-work).

## Claims-vs-code contradictions

1. **"Autonomous... dream cycles"** — requires a Claude Code session to already be
   running interactively (`./start.sh` up) at 2:03/3:33 AM; if the session isn't
   open, the cron→webhook push has nothing to land in and the dream silently never
   fires (confirmed by README's own troubleshooting checklist, item 1: "Is Claude
   running?"). Not a detached/headless job — it needs a live, resident process.
2. **"Graph view of your knowledge for free"** framed under "Features" as something
   the system provides — it is Obsidian's own desktop feature, not code in this
   repo, and the agent itself cannot query or traverse it (no backlink API in
   source; only an optional external CLI shell-out).
3. **"O(1) inventory, not O(n) log scanning"** — `.config/compiled-raw.txt` lookups
   are still a linear scan; the claim is really "O(manifest-size) not
   O(full-session-log-size)," which is a real and reasonable win but not O(1).
4. **"Memory consolidation"** (dream-memory) never touches anything this repo
   built — it operates on Claude Code's own harness-native memory directory. The
   repo supplies zero storage/retrieval code for it; the "system" is the prompt
   alone, riding entirely on the host harness's existing feature.

## Relevance to core-memory-kit

**Task 95 dream re-curation (design.md §21):** relevance = **weak-corroborating,
mostly as a negative precedent.** core-memory-kit's §21.2 already specifies a
three-stage pass — deterministic hash/ID dedup floor, then ONE batched LLM call
whose output ids are validated and whose contradiction-resolution is **code-decided
by event-time** (never LLM-decided), then an AUTO/QUEUE op-class split with audit
logging and archive-not-delete. `claude-second-brain`'s `dream-memory` skill is the
system §21 was explicitly designed to NOT be: **pure LLM judgment end to end**, with
"delete contradicted facts at the source" carrying no archive/tombstone/review-queue
step at all, and no deterministic floor before the LLM touches anything. It's a
useful **negative data point** confirming §21's stricter design is not
over-engineering relative to a real "dream" implementation someone shipped and
narrated in a two-part blog series — the naive version is exactly this repo, and it
predictably has no data-loss guardrail. The subagent-fresh-context /
self-evaluation-trap rationale is a legitimate, independently-argued point (echoes
why Task 95 runs as an offline batch pass rather than inline in the live session) but
isn't a new mechanism — it's corroboration of an already-settled design choice, not a
technique to import.

**ADR-0023 graph edges (activate/defer/reject):** relevance = **weak, but adds a
10th confirming data point to the sweep's core finding.** ADR-0023's research base
(9 systems + Letta) already established that "graph memory" flagships routinely ship
no real graph in code. `claude-second-brain` is a different flavor of the same
pattern: it doesn't even claim to build a graph — it explicitly delegates the word
"graph" to Obsidian's desktop UI and frames that delegation as a feature ("for
free"). This actually reinforces ADR-0023's Decision #1 (activate the edges already
written, keep it markdown-derived, zero third index) more than it argues for
anything new: a graph that's just an external app's link-rendering of
`[[wikilinks]]`, with no query surface back into the agent's own process, is strictly
weaker than ADR-0023's adopted `edges(src,dst,type)` SQLite table + recursive-CTE
supersession walk + `mk_links`/`cmk links` verb — which at least the AGENT can query
itself, headlessly, without a GUI app running.

**Tasks 233/161/203 context-compaction:** no direct code to borrow — no compaction
algorithm exists here; "compaction" is entirely prompt-instructed pruning inside
dream-memory Phase 3/4 with a soft 200-line target for `MEMORY.md`-equivalent
("Update MEMORY.md so it stays under 200 lines... It's an index, not a dump") and no
enforcement if the LLM ignores it.

## Borrow candidates

- **Fresh-context subagent for offline consolidation, explicitly justified by the
  "self-evaluation trap."** Not a new mechanism for core-memory-kit (Task 95 is
  already planned as an offline pass, not inline), but the explicit naming of *why*
  — same-context self-review rationalizes keeping bad entries — is a clean one-line
  justification worth citing in design.md §21 commentary if it isn't already framed
  that way.
- **Numeric weighted quality score with a category breakdown, tracked over time in a
  log** (`wiki-audit`'s /100 rubric: Index/Cross-links/Consistency/Coverage/
  Staleness/Formatting). Could inform a richer composite metric for the existing
  Task-212 stats probe (§21.5) beyond raw counts — a weighted score trended per run
  is a legible single number for `cmk doctor`/health-check surfaces. Minor idea, not
  a mechanism (their score is LLM-assigned, not computed).
- **Task-vs-memory disambiguation-by-asking pattern** (`task-tracker` SKILL.md): when
  a capture phrase is ambiguous between "actionable later" and "durable fact," ask a
  short clarifying question rather than silently routing. Reasonable UX precedent if
  core-memory-kit ever needs to disambiguate capture intent (e.g., `mk_remember` vs a
  future task/reminder surface) — currently N/A since the kit has no task-tracking
  surface.

## Reject candidates

- **LLM-only consolidation with no deterministic floor and no archive-before-delete**
  (`dream-memory` Phase 3: "Deleting contradicted facts at the source"). Directly
  the anti-pattern core-memory-kit's §21.6 anti-scope already forecloses ("No DELETE
  op exists... no LLM-decided which-wins"). Reject as confirmed-bad, not
  reconsidered.
- **Requiring a live, resident interactive session for scheduled/"overnight" work**
  (dream cycles depend on `./start.sh` staying up; no headless/detached execution
  path). core-memory-kit's cron-registered CLI bins (`register-crons.mjs`) already
  run headless without a foreground session — this repo's coupling is strictly worse
  for reliability (confirmed by its own troubleshooting doc naming "is Claude
  running?" as failure mode #1) and should not be imitated.
- **"Graph" delegated entirely to an optional external desktop app with no
  agent-queryable API.** Already superseded by ADR-0023's adopted design (an
  in-repo, agent-queryable `edges` table). Not worth even a partial borrow.
- **`.config/compiled-raw.txt` flat-file "already processed" manifest** as a
  resumability primitive — same *shape* as core-memory-kit's ADR-0020
  artifact-derived resume point, but strictly weaker (append-only text list, no
  states beyond "present/absent," no per-line status like the sessions-import
  ledger's `imported`/`screened`/`skipped-empty`). Not a regression to adopt from;
  core-memory-kit's existing ledger design (§22.2) is already the more rigorous
  version of the same idea.

## Honest gaps

- **Images not viewed.** 8 PNGs in `_resources/` (`claude-dream-process.png`,
  `claude-dreaming.png`, `claude-librarian.png`, `claude-second-brain.png`,
  `graph-view.png`, `local-images-plus*.png`, `obsidian-web-clipper-settings.png`)
  were not opened/rendered in this pass — README references them as illustrative
  diagrams (e.g. a 4-phase dream-process graphic), but their content wasn't
  independently verified beyond the surrounding prose and mermaid diagrams (which
  were read as text).
- **Two external Medium articles** ("Dreaming AI" Parts 1-2, linked from README's
  Background section) were not fetched/read — any deeper design rationale living
  only in the blog posts (vs. what's reproduced in README/CLAUDE.md/SKILL.md) is
  unverified.
- **Never executed.** The clone is a fresh template (`wiki/` has only
  `_master-index.md` + `log.md`, `raw/` has one placeholder file, `.config/` has no
  crontab or compiled-raw.txt in the tree) — no dream cycle has ever actually run in
  this checkout, so all consolidation/compilation behavior described above is
  read from the prompt specification, not observed output. Whether the LLM subagent
  in practice honors the "delete contradicted facts" instruction safely or produces
  garbage is unverified either way.
- **`bun.lock` dependency trees** were not audited beyond top-level `package.json`
  (single dependency each: `@modelcontextprotocol/sdk`).
- **Full commit history read via `--depth 50`,** but the actual repo only has 29
  commits total (all it has, not a truncation) — confirmed by the shallow clone
  returning the full log with no indication of cutoff.
