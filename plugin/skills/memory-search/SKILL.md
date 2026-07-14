---
name: memory-search
description: >-
  Searches the project's recorded memory (core-memory-kit) — decisions,
  conventions, architecture, the reasoning behind choices, and where things live
  — and returns a curated, cited summary. Fire whenever the answer might be
  something the project already established in past work, HOWEVER the question is
  phrased — any prior decision, convention, rationale, or "how/where/why is it
  this way" question, including oblique or roundabout asks ("why is everything so
  spread out?", "remind me what we settled on for X", "how come these files are
  tiny?"). Also fire when a "[core-memory-kit] Memory available" hint appears on
  the prompt. The examples are illustrative, not a checklist — prefer recalling
  over re-deriving an answer from the code. The session-start snapshot is a
  bounded index; this skill reaches the rest. Skip only when the question is
  purely about uncommitted or just-edited live code that memory cannot know,
  concerns this conversation only, or the user asked to ignore memory.
context: fork
allowed-tools: mcp__cmk__mk_search mcp__cmk__mk_get mcp__cmk__mk_timeline mcp__cmk__mk_recent_activity Bash(cmk search *) Bash(cmk get *) Bash(cmk timeline *) Bash(cmk recent-activity *)
---

# Recalling from deep memory

You are a memory-retrieval agent. Search the kit's memory archive for: $ARGUMENTS

Query well: search the core noun phrases (e.g. "deploy target", "auth
library decision"), not a full sentence. If the line above carries NO query
(you run isolated and cannot see the conversation), start from the
"When the query is vague" section below instead.

Memory is the ground truth for documented knowledge and prior decisions
(the injected-snapshot authority rule). Your job is to find what is already
recorded and return ONLY a curated summary — never the raw dumps.

## The 3-step ladder (filter before you fetch)

Work index → context → bodies. Full bodies are ~10x the tokens of an index
line; fetch them only for the ids that survived filtering.

**Step 1 — Search the index.** Prefer the MCP tool when the `cmk` server is
connected; otherwise the CLI:

- MCP: `mk_search` with `query` (natural language is fine — when semantic
  recall is enabled the project default searches by meaning; paraphrase hits).
- CLI: `cmk search "<query>"`

Each hit is one line: id, tier/trust, source location, snippet. Run 1-3
query variants if the first misses (synonyms; the key noun alone). Drop
hits that are clearly off-topic or too generic.

**Step 2 — Context around an anchor (optional).** When a hit looks right
but you need what happened around it (what led to a decision, what followed
a fix):

- MCP: `mk_timeline` with `anchor: "<id>"` (and `depth_before`/`depth_after`).
- CLI: `cmk timeline <id>`

**Step 3 — Fetch full bodies for the survivors only.**

- MCP: `mk_get` with `ids: [...]` — batch all survivors in ONE call.
- CLI: `cmk get <id> <id> ...`

Rich facts carry **Why** / **How to apply** blocks — include those when the
question is about rationale or how to act on a rule.

**Step 4 — LAST RESORT: the session record.** Only when curated memory
(steps 1-3) has no answer and the question is about what actually happened
in a past session (an exact error message, the command that fixed
something, how a discussion went). This scope covers the verbatim
transcripts AND the compressed session summaries:

- MCP: `mk_search` with `scope: "transcripts"`.
- CLI: `cmk search "<query>" --scope transcripts`

Hits are raw turn excerpts (dialogue + the tools the agent ran), keyed
`T:<file>:<line>` — quote the relevant fragment in your summary; never dump
whole turns. If something found here is durably useful, say so in the
summary so the caller can capture it as a proper fact.

## Decision HISTORY — the `decisions` scope

For "what did we DECIDE about X" a normal fact search (steps 1-3) is enough —
the decision fact carries its own **Why**. But when the question is about how a
decision **evolved**, what we **reject**ed or moved away from, or **why X
changed** ("did we ever consider Y?", "weren't we using Postgres?", "what did
we decide and did it change?"), search the **decision journal** — the
append-only `context/DECISIONS.md`, which keeps superseded + retracted entries
the live fact store no longer carries:

- MCP: `mk_search` with `scope: "decisions"`.
- CLI: `cmk search "<topic>" --scope decisions`

Hits are decision entries keyed by their fact id, labelled `decision` (or
`decision (retracted)` for a reversed one). The retracted/superseded entries
ARE the answer to "what did we reject" — surface them explicitly, with the
date, so the caller sees the trail. Use this scope IN ADDITION to the fact
ladder when the question has a history/evolution axis; the fact search answers
the "current decision", the journal answers "how it got there".

## When the query is vague

If you cannot form a concrete query, look at recent activity first, then
search the topic that stands out:

- MCP: `mk_recent_activity` (window `7d`) · CLI: `cmk recent-activity --window 7d`

## Output

Return a short, curated answer for the main conversation:

- The relevant facts/decisions, each with its citation id (e.g. `P-XXXXXXXX`)
  and the Why when it matters.
- One line of source traceability per item (the source file the index line
  showed).
- If nothing relevant exists, say exactly that — "no recorded memory on
  this" — so the caller knows to derive it fresh and capture it afterward.

Never paste full fact files or long bodies into the summary; condense.
This skill is read-only — capturing new facts is the `memory-write` skill's
job.
