# MCP tools (`mcp__cmk__*`)

The kit ships an **MCP server** so Claude can run every memory operation **in conversation** — you never type `cmk`. `cmk install` registers it (writes `.mcp.json` and allow-lists `mcp__cmk__*` in `.claude/settings.json`), so the tools are available **prompt-free** the moment you open Claude Code. The server is **stdio-only and local** — no network listener, no auth surface.

**You don't call these — Claude does.** This page is for understanding the surface (and for power users / integrators). Every tool maps 1:1 to a `cmk` CLI verb (a build-time parity guard, [`scripts/validate-cli-mcp-parity.mjs`](../scripts/validate-cli-mcp-parity.mjs), fails the build on drift), so for per-operation semantics see the matching entry in [`CLI.md`](CLI.md); this page covers the MCP-specific bits.

## The tools

| Tool | CLI equivalent | What it does |
| --- | --- | --- |
| `mk_remember` | `cmk remember` | Capture a fact. With `why` / `how` / `title` / `type` it writes a structured **Why/How fact file**; otherwise a terse bullet. Runs the same Poison_Guard + dedup + audit path as the CLI. |
| `mk_search` | `cmk search` | Search by keyword or meaning (`mode`: keyword/semantic/hybrid — hybrid is the project default after `cmk install --with-semantic`). `scope: "transcripts"` searches the raw session record as a last resort; `scope: "decisions"` searches the decision journal for decision-history / "what did we reject" queries. |
| `mk_get` | `cmk get` | Full fact body + provenance for one or more ids. |
| `mk_timeline` | `cmk timeline` | Sequential context around an observation. |
| `mk_cite` | `cmk cite` | A canonical citation link for an id. |
| `mk_recent_activity` | `cmk recent-activity` | Recent changes in a time window. |
| `mk_trust` | `cmk trust` | Change a fact's trust level (low / medium / high). |
| `mk_lessons_promote` | `cmk lessons promote` | Carry a project fact into the cross-project user tier. |
| `mk_forget` | `cmk forget` | Tombstone a fact (audit trail preserved). **Two-step** — see below. |
| `mk_queue_list` | `cmk queue …` | List what's pending in the review / conflict queues. |
| `mk_queue_resolve` | `cmk queue …` | Resolve a queued item — `promote` / `discard` a review item, `keep-old` / `keep-new` a conflict. |

## Tool parameters (the full option surface)

Verified against the server's schemas (`packages/cli/src/mcp-server.mjs`); names are snake_case where the CLI flag is kebab-case (`min_trust` ↔ `--min-trust`).

| Tool | Parameters |
| --- | --- |
| `mk_remember` | `text` (required, ≤5000) · `tier` U/P/L (U/L are captured to P with a promotion note — `mk_lessons_promote` is the cross-project path) · rich capture: `why` + `how` (≤5000 each), `title` (≤200), `type` feedback/project/reference/user, `links` (related fact names), `shape` State/Event/Plan/Relationship/Preference/Absence/Timeless (what KIND of truth the fact asserts — default State; Task 66.1), `expires` ISO date/datetime (declared validity end — after it the fact hides from search and the weekly sweep tombstones it; Task 66.3) · `cites` is not recorded yet — omit |
| `mk_search` | `query` (required) · `mode` keyword/semantic/hybrid (omit = the project default) · `scope` facts/transcripts/decisions (transcripts = the session record, last resort; decisions = the decision journal, for history/"what did we reject") · `tier` U/P/L · `since` ISO date · `limit` ≤1000 · `min_trust` low/medium/high · `include_expired` (include facts past their declared `expires_at`; hidden by default, never deleted) (the fact-only filters + semantic/hybrid don't apply under `scope: "transcripts"` or `"decisions"`) |
| `mk_get` | `ids` (required, 1–100 per call — batch, don't loop) |
| `mk_timeline` | `anchor` (required id) · `depth_before` / `depth_after` (≤50, default 5 each) |
| `mk_cite` | `id` (required) |
| `mk_recent_activity` | `window` 1h/24h/7d (default 24h) · `limit` ≤1000 (default 20) |
| `mk_trust` | `id` (required) · `level` low/medium/high (required) |
| `mk_lessons_promote` | `id` (required, a P- fact) · `to` USER.md/HABITS.md/LESSONS.md (default LESSONS.md) · `section` (override the landing section; default: the topic-router picks one) |
| `mk_forget` | `id` (required) · `reason` (≤500, audited) · `deleted_by` (≤200, audit provenance; default user-explicit) · `confirm` — the token from the preview call; required to actually delete |
| `mk_queue_list` | `queue` review/conflicts (default review) |
| `mk_queue_resolve` | `queue` (required) · `id` (required) · `action` — review: promote/discard; conflicts: keep-old/keep-new (`merge-both` routes to the interactive `cmk queue conflicts`) |

## Destructive ops are two-step (confirm token)

`mk_forget` never deletes on the first call. It returns a **preview** of exactly what would be tombstoned, plus a short **confirm token**; Claude must call `mk_forget` again echoing that token to actually delete. So an auto-invoking model can't silently destroy memory — nothing vanishes without the preview landing in front of you first. (`mk_trust` and `mk_lessons_promote` are mutations but non-destructive, so they apply directly.)

A forgotten fact disappears from `mk_search` immediately (forget reindexes in-band) and stays recoverable via `mk_get` (the tombstone archive).

## Registration + permissions

- `cmk install` writes `.mcp.json` at the project root:
  ```json
  { "mcpServers": { "cmk": { "type": "stdio", "command": "cmk", "args": ["mcp", "serve"] } } }
  ```
- It allow-lists `mcp__cmk__*` in `.claude/settings.json`, so the tools run without a per-call approval prompt.
- `cmk install --no-hooks` skips this wiring (scaffold-only).
- To run the server by hand (rare — Claude Code launches it for you): `cmk mcp serve` (stdio).

## Why MCP, not the CLI?

The regular user lives in free speech — they never run commands. Every voiced intent ("forget the API key", "what did we decide about X", "always use uv") reaches the kit either **automatically** (hooks) or **Claude-mediated** via these tools. So the MCP surface *is* the real user-facing surface; the `cmk` CLI is the substrate Claude (and power users) drive. Running an op as an allow-listed MCP tool also sidesteps a Claude Code permission edge where a `cd … && cmk …` compound command re-prompts.

See [`specs/design.md`](../specs/design.md) §10 + §12 for the full MCP design and [ADR-0014](adr/0014-unify-cli-mcp-shared-core.md) for the shared-core / parity decision.
