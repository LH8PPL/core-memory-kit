# Design — claude-memory-kit v0.1.0

**Status**: Draft, section 1-3 of N · **Author**: Claude (Opus 4.7) + Lior Hollander · **Date started**: 2026-05-22

This document specifies **HOW** v0.1.0 is built.
The companion [`requirements.md`](requirements.md) specifies **WHAT** v0.1.0 must do.
Every section here cites the FRs it implements.

The design assumes [`requirements-revisions-proposed.md`](requirements-revisions-proposed.md) is approved (it is, per user 2026-05-22 — locked in tenets T7/T8, US-14/15, FR-28/29/30, NFR-9, OS-9..13, OQ-8).

---

## 1. Architecture overview

### 1.1 The three tiers (where memory lives)

```text
┌─────────────────────────────────────────────────────────────────────┐
│  USER TIER  ~/.claude-memory-kit/                                    │
│  • USER.md         identity (1,375 char cap)                         │
│  • HABITS.md       cross-project working style (1,800 char cap)      │
│  • LESSONS.md      cross-project lessons (1,800 char cap) [NEW v0.1] │
│  • fragments/      typed per-fact archive + INDEX.md                 │
│  Loaded with LOWEST priority. Machine-local. NOT in any git repo.   │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────────┐
│  PROJECT TIER  <repo>/context/                                       │
│  • SOUL.md         project persona (1,800 char cap)                  │
│  • MEMORY.md       working state (2,500 char cap)                    │
│  • memory/         typed per-fact archive + INDEX.md                 │
│  • sessions/                                                         │
│      ├─ now.md     current session buffer (no cap, replaced each session) │
│      ├─ today-{YYYY-MM-DD}.md   Haiku-compressed daily summary       │
│      ├─ recent.md  rolling 7-day consolidation                       │
│      └─ archive.md older history (append-only)                       │
│  • transcripts/{YYYY-MM-DD}.md  verbatim capture (preserved forever) │
│  • .index/memory.db             SQLite+FTS5 read cache (gitignored)  │
│  Loaded with MIDDLE priority. Committed to git. Travels with clone.  │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────────┐
│  LOCAL TIER  <repo>/.claude/local/                                   │
│  • machine-paths.md  absolute paths for this machine (1,000 cap)     │
│  • overrides.md      machine-specific overrides (1,000 cap)          │
│  Loaded with HIGHEST priority (most-specific wins).                  │
│  Automatically added to .gitignore at install time.                  │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
                      Frozen snapshot injected
                      into Claude's context window
                      at session start (≤10KB total)
```

**Precedence model** (Git config semantics): first-match-wins at observation level, deep-merge at settings level. When two tiers have the same observation ID, the most-specific tier (highest priority) wins and the others are logged as `shadowed_by` in the debug output. See §6.

**Implements**: FR-1, FR-4, FR-5, FR-6, FR-7 (T1, T2, T3, T8).

### 1.2 Coexistence with Anthropic's Auto Memory (Option D)

```text
~/.claude/projects/<slug>/memory/         ← Anthropic's auto-memory
    MEMORY.md                                (machine-local, automatic)
    <topic>.md
        │
        │   Anthropic writes here automatically (its built-in writer)
        │   Loaded by Claude Code natively at session start
        │
        ▼
        Claude Code session context

<repo>/context/                            ← OUR memory
    SOUL.md / USER.md / MEMORY.md / etc.
        │
        │   Our hooks write here
        │   Our PreToolUse hook injects this FIRST as additionalContext
        │
        ▼
        Claude Code session context (placed before Anthropic's by hook timing)
```

**Both writers run. Both memories load.** Ours is injected first via our PreToolUse hook, so it appears earlier in the prompt and gets more attention.

**Semantic precedence**: ours is the **committed canonical version** (humans review it; it travels with git). Anthropic's is **machine-local supplementary capture**.

**Bridge command**: `cmk import-anthropic-memory` merges useful bullets from `~/.claude/projects/<slug>/memory/MEMORY.md` into `<repo>/context/MEMORY.md` on demand (with dedup via citation IDs).

**Implements**: ADR-0011 Option D.

### 1.3 The six layers (what gets built)

| Layer | What | Required? | Maps to FR(s) |
| --- | --- | --- | --- |
| **1** | Directory tree + `.gitignore` injection | Yes | FR-1, FR-4, FR-5 |
| **2** | Granular per-fact archive + INDEX | Yes | FR-1, FR-29 |
| **3** | Bounded scratchpads (SOUL/USER/MEMORY/HABITS/LESSONS) | Yes | FR-3 |
| **4** | Six lifecycle hooks + auto-extract subagent + `memory-write` skill | Recommended | FR-9, FR-10, FR-11 |
| **5** | Search: SQLite+FTS5 cache + optional memsearch+Milvus | Optional | FR-16, FR-17, FR-18 |
| **6** | Auto-curation: cron jobs for rolling-window compression | Optional | FR-19, FR-20, FR-21 |

Each layer is replaceable. Layer 1-3 is pure file ops. Layer 4 is what makes memory automatic. Layer 5-6 are optional power features.

### 1.4 Data flow

**At session start** (one-time per session):

```text
SessionStart hook fires
    │
    ├─ Resolve 3-tier file paths
    │       local: <repo>/.claude/local/
    │       project: <repo>/context/
    │       user: ~/.claude-memory-kit/
    │
    ├─ Read in priority order (local → project → user)
    │       SOUL.md, USER.md, HABITS.md
    │       MEMORY.md, LESSONS.md
    │       memory/INDEX.md + fragments/INDEX.md
    │       latest sessions/today-*.md
    │
    ├─ Concatenate into frozen snapshot block (≤ 10 KB total)
    │
    └─ Emit as `additionalContext` via hook output JSON
            │
            ▼
        Claude's context window (snapshot injected at top)

  ─── (Anthropic's auto-memory MEMORY.md also loads naturally) ───

  Session begins with both memories visible. Ours sits earlier.
```

**During each turn**:

```text
User prompt
    │
    ├─ UserPromptSubmit hook fires
    │       Captures prompt to context/transcripts/{date}.md
    │       Strips <private>…</private> content (replaced with [redacted])
    │       Optionally tags intent (question/decision/correction)
    │
    ├─ Claude responds (one or more turns with tool calls)
    │       PostToolUse hook fires on Write|Edit|MultiEdit only
    │           If tool output > 50 lines: append summary to sessions/now.md
    │           Async fire-and-forget
    │
    └─ Stop hook fires (end of assistant turn)
            │
            ├─ Append turn to context/transcripts/{date}.md
            │       Strip <private>, force-keep <retain>
            │
            └─ Spawn detached background process:
                    scripts/auto-extract-memory.sh <turn_temp_file>
                            │
                            ├─ Reads transcripts/{date}.md, MEMORY.md, INDEX.md
                            ├─ Invokes `claude --print` with extraction prompt
                            ├─ Sub-Claude judges: durable? Skip or save?
                            │     If save: writes via memory-write skill
                            │     If skip: log "skip: nothing durable"
                            └─ Logs structured JSON to sessions/{date}.extract.log
                                  {ts, success, error_category, observation_count, skipped_reason}
```

**At session end**:

```text
SessionEnd hook fires
    │
    ├─ Read sessions/now.md (live session buffer)
    │
    ├─ Invoke compressor (Haiku 4.5 default, pluggable interface)
    │       Compresses now.md → today-{date}.md
    │       Preserves citation IDs and headings (FR-20)
    │       Truncates now.md after successful compression
    │
    └─ Flush any pending memory writes to disk
```

**Asynchronous (cron)**:

```text
Daily   23:00  scripts/run-daily-distill.sh
                Extract durable facts from sessions/today-*.md into MEMORY.md/granular archive

Nightly 02:00  scripts/memsearch-index-with-flush.sh
                Rebuild SQLite+FTS5 index + Milvus vector store (if installed)

Weekly  Sun 09:00  scripts/run-weekly-curate.sh
                Prune resolved Active Threads, merge duplicates, drop stale entries
                Roll oldest today-*.md (>7 days) into archive.md
                Generate recent.md from last 7 days
```

**Implements**: FR-7, FR-8, FR-9, FR-10, FR-12, FR-13, FR-19.

---

## 2. Storage schemas

### 2.1 Bounded scratchpad format

All scratchpad files (`SOUL.md`, `USER.md`, `HABITS.md`, `LESSONS.md`, `MEMORY.md`) share the same shape:

```markdown
<!--
Cap: 2500 chars.
Last distilled: 2026-05-22.
Last health check: 2026-05-22.
-->

# Working Memory

## Active Threads

- (P-A8FN3MQ2) we standardized on Python 3.13
  <!-- source: transcripts/2026-05-22.md:142, sha1:abc123ef..., write: user-explicit, trust: high, at: 2026-05-22T14:30:00Z -->

- (P-3L8N1P9R) milvus pinned at v2.6.16 in milvus-deploy/docker-compose.yml
  <!-- source: transcripts/2026-05-21.md:88, sha1:def456gh..., write: auto-extract, trust: medium, at: 2026-05-21T19:45:12Z -->

## Environment Notes

- ...

## Pending Decisions

- ...
```

**Key conventions**:

- **HTML comment frontmatter at top** for size cap, last-distilled, last-health-check. These comments are stripped from Claude's context per Anthropic's docs (saves tokens; humans still see them when viewing).
- **Three fixed sections** per file (Active Threads / Environment Notes / Pending Decisions for `MEMORY.md`; About / Preferences / Working Style for `USER.md`; etc.).
- **One bullet per fact**, ≤ 200 chars per bullet (the bullet text itself, not counting metadata).
- **Provenance frontmatter** in HTML comment immediately below the bullet. Required fields: `source`, `sha1`, `write`, `trust`, `at`. (Per T8, FR-29.)
- **Citation ID in parentheses at start of bullet**: `(P-A8FN3MQ2)`. (Per FR-14.)
- **Section sign delimiter `§`** is NOT used in our format (Hermes uses it; we use markdown bullets — simpler and git-diffable).

**Char cap enforcement**: counted via `wc -c` on the file. Includes everything (frontmatter, comments, bullets). When a write would push the file over cap, the `memory-write` skill **consolidates first** (merge similar bullets, drop stale entries older than 14 days with no current reference), then writes the new content. (Per FR-3.)

**Implements**: FR-1, FR-3, FR-29 (T8).

### 2.2 Granular per-fact archive

`memory/<type>_<slug>.md` files. One fact per file. Frontmatter is YAML, not HTML comment:

```markdown
---
id: P-7K2X9Q4F
type: feedback
title: Webcam ROI is wider than expected
created_at: 2026-05-22T14:30:00Z
write_source: user-explicit
trust: high
source_file: context/transcripts/2026-05-21.md
source_line: 142
source_sha1: abc123ef...
merged_from: null
related: [P-A8FN3MQ2]
tags: [video-pipeline, roi, calibration]
---

# Webcam ROI is wider than expected

## Fact

`--roi 0,0,80,100` is not enough exclusion for Krish-Naik-style overlays where the webcam circle reaches ~70% of screen width. Use `--roi 0,0,72,100` minimum.

## Why

Krish Naik's setup has a wide circular webcam overlay (not the typical narrow rectangle). The 80% cutoff still leaves the right edge of the circle visible in the ROI, causing motion artifacts to confuse the stability detector.

## How to apply

- Default to `--roi 0,0,72,100` for any Krish-Naik-style video.
- For other talking-head videos, calibrate by running `--probe` first and checking `motion-heatmap.jpg`.

## Related observations

- See [[P-A8FN3MQ2]] for the broader auto-ROI design notes.
```

**Type taxonomy** (from claude-mem + Anthropic auto-memory pattern):

| Type | What it stores | Example slug |
| --- | --- | --- |
| `user_*` | Facts about the user | `user_role.md`, `user_hardware.md` |
| `feedback_*` | Corrections / preferences | `feedback_no_sre_framing.md` |
| `project_*` | Project decisions with rationale | `project_milvus_version.md` |
| `reference_*` | Pointers to external systems | `reference_grafana_dashboard.md` |

**Implements**: FR-1, FR-29.

### 2.3 INDEX.md (the pointer index)

`memory/INDEX.md` (and `fragments/INDEX.md` for the user tier) is the **pointer file**, not content-direct. Per the Claude Code leak: Anthropic's `MEMORY.md` is also a pointer index. Two reasons:

1. **Token budget**: first 200 lines / ~25 KB load at session start (per Anthropic's pattern). The pointer index uses ~150 chars per line × 200 lines = ~30 KB max if everything is pointed at. Content-direct would blow this immediately.
2. **Discoverability**: Claude scans the index to know what's available, then reads specific topic files on demand.

```markdown
# Granular memory index — project tier

## Files

- (P-A8FN3MQ2) [feedback] [Webcam ROI is wider than expected](feedback_webcam_roi.md) — `--roi 0,0,80,100` not enough
- (P-3L8N1P9R) [project] [Milvus version pinned at v2.6.16](project_milvus_version.md) — v2.6+ Woodpecker WAL needs manual flush
- (P-9F2D7T1S) [user] [Wiki for research and study](user_use_case_wiki_research.md) — informs density/quality tradeoffs
```

**Format per line**: `- ({id}) [type] [title](filename.md) — short hook`. Pointer + one-line summary. Stable IDs survive INDEX rebuilds.

**Implements**: FR-1, FR-7.

---

## 3. Citation IDs (content-addressed)

### 3.1 Format

```text
<tier_prefix>-<base32(SHA-256(canonical_text))[:8]>
```

Where:

- `<tier_prefix>` is `U` (user), `P` (project), or `L` (local).
- `canonical_text` is the bullet's text after canonicalization (§3.2).
- `SHA-256(...)` produces a 32-byte hash.
- `base32(...)` uses RFC 4648 alphabet **excluding ambiguous chars** (no `0/O`, `1/l`, `I/8`). Length: 8 chars = 40 bits = ~10⁻⁶ collision probability per pair at 10⁶ entries.

**Examples**:

| Bullet text | Canonical text | Hash → base32 → ID |
| --- | --- | --- |
| `We standardized on Python 3.13` | `we standardized on python 3.13` | `7K2X9Q4F` → `P-7K2X9Q4F` |
| `Milvus is pinned at v2.6.16` | `milvus is pinned at v2.6.16` | `3L8N1P9R` → `P-3L8N1P9R` |
| `User runs macOS 14 Sonoma` | `user runs macos 14 sonoma` | `9F2D7T1S` → `U-9F2D7T1S` |

**Session anchors are different** — they use BibTeX-style human-mnemonic IDs:

```text
S-2026Q2-001   ← session 1 of Q2 2026
S-2026Q2-002
S-2026Q2-003
```

Sessions are temporal markers, not content; mnemonic IDs are more useful for humans browsing the archive.

### 3.2 Canonical text rules

Input to SHA-256 is `canonicalize(bullet_text)`:

1. **Trim** leading/trailing whitespace.
2. **Collapse whitespace**: any run of `\s+` (including newlines) → single space.
3. **Lowercase**: ASCII lowercase. (Non-ASCII characters pass through unchanged.)
4. **Strip citation backrefs**: remove `(P-XXXXXXXX)`, `(U-XXXXXXXX)`, `(L-XXXXXXXX)` patterns if present.
5. **Strip leading bullet marker**: remove `^[-*+]\s+` if present.
6. **Strip trailing punctuation**: `.`, `,`, `;` at end.
7. **Strip frontmatter HTML comments**: `<!--.*?-->` removed before hashing.

The function MUST be deterministic and identical across all writers (auto-extract sub-Claude, memory-write skill, manual edits). The kit ships a single shared `canonicalize()` implementation in `cmk` Node binary AND in Python (for cron scripts).

### 3.3 Generation algorithm

```typescript
function generateId(tier: 'U' | 'P' | 'L', bullet_text: string): string {
  const canonical = canonicalize(bullet_text);
  const hash = sha256(canonical);                    // 32 bytes
  const base32 = encodeBase32NoAmbiguous(hash);      // ~52 chars
  const id_chars = base32.substring(0, 8);
  return `${tier}-${id_chars}`;
}
```

Implementation lives in `cmk` CLI's shared library (`@cmk/canonicalize` package, MIT) so external tools (e.g. liorwiki ingest) can compute the same IDs deterministically.

### 3.4 Consolidation / merge semantics

When the weekly curator merges bullets `A` (`#P-AAAAAAAA`) and `B` (`#P-BBBBBBBB`) into `C` (new merged text):

1. Compute `C`'s canonical text.
2. Compute `C`'s ID: `P-<hash(C)>`.
3. In `C`'s frontmatter, record `merged_from: [P-AAAAAAAA, P-BBBBBBBB]`.
4. In the granular archive, the original files `A.md` and `B.md` are **moved** (not deleted) to `memory/archive/superseded/`, with frontmatter `superseded_by: P-CCCCCCCC` added.
5. Search results favor `C` (live version) but `mk_get(P-AAAAAAAA)` still resolves — it returns A's content plus a "merged into C: P-CCCCCCCC" annotation.

This mirrors DOI deprecation: old IDs never die; they point to the new one.

### 3.5 Why this scheme

- **Natural dedup**: identical text → identical ID. Re-capturing the same fact produces no duplicate.
- **Consolidation-stable**: merged bullets get new IDs deterministically; original IDs are preserved via `merged_from`.
- **Cross-machine portable**: no clock, no counter, no central authority. Two machines mint the same ID for the same canonical text.
- **Tier-namespaced**: `P-X` and `U-X` cannot collide even if hashes coincide.
- **Readable**: base32 (no ambiguous chars) survives copy-paste, voice dictation, URL embedding.

**Implements**: FR-14, ADR-0007.

---

## 4. Provenance frontmatter

Every bullet in a scratchpad file and every fact in the granular archive carries provenance metadata. Required fields:

| Field | Type | What it means |
| --- | --- | --- |
| `id` | string | Citation ID from §3 (e.g. `P-A8FN3MQ2`) |
| `source_file` | string | Path to the source transcript/session |
| `source_line` | int | Line in source (1-indexed) |
| `source_sha1` | string | SHA-1 of source at capture time (detects drift) |
| `write_source` | enum | `user-explicit` / `auto-extract` / `compressor` / `manual-edit` / `imported` |
| `trust` | enum | `high` / `medium` / `low` |
| `created_at` | ISO 8601 UTC | timestamp at write time |

Optional fields: `merged_from` (for consolidation), `superseded_by` (when replaced), `deleted_at` (for tombstoned facts — see §6.5), `expires_at`.

**Trust default** by `write_source`: `user-explicit` and `manual-edit` → `high`; `auto-extract` and `imported` → `medium`; `compressor` → `low`. Manual override via `cmk trust <id> <high|medium|low>`.

**Placement**: HTML comment immediately below each bullet (comments are stripped from Claude's context per verified Anthropic docs, so metadata is invisible to model, visible to humans/tools).

**Implements**: FR-29, T8.

---

## 5. Hooks — 5 active + 1 setup

### 5.1 Verbatim hooks.json

Pattern: `${CLAUDE_PLUGIN_ROOT}/bin/cmk-<verb>` (kit-unique prefix dodges Anthropic bug [#29724](https://github.com/anthropics/claude-code/issues/29724)). Convention verified against claude-mem (`thedotmack/claude-mem/plugin/hooks/hooks.json`) and claude-remember (`Digital-Process-Tools/claude-remember/hooks/hooks.json`).

```json
{
  "hooks": {
    "Setup": [{ "hooks": [{ "type": "command", "command": "bash \"${CLAUDE_PLUGIN_ROOT}/bin/cmk-version-check\"", "timeout": 30 }] }],
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "bash \"${CLAUDE_PLUGIN_ROOT}/bin/cmk-inject-context\"", "timeout": 30 }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "bash \"${CLAUDE_PLUGIN_ROOT}/bin/cmk-capture-prompt\"", "timeout": 10 }] }],
    "PostToolUse": [{ "matcher": "Write|Edit|MultiEdit", "hooks": [{ "type": "command", "command": "bash \"${CLAUDE_PLUGIN_ROOT}/bin/cmk-observe-edit\"", "async": true, "timeout": 120 }] }],
    "Stop": [{ "hooks": [{ "type": "command", "command": "bash \"${CLAUDE_PLUGIN_ROOT}/bin/cmk-capture-turn\"", "timeout": 30 }] }],
    "SessionEnd": [{ "hooks": [{ "type": "command", "command": "bash \"${CLAUDE_PLUGIN_ROOT}/bin/cmk-compress-session\"", "timeout": 60 }] }]
  }
}
```

### 5.2 Hook responsibilities

| Hook | Timeout | Async | Purpose | Source informing the choice |
| --- | --- | --- | --- | --- |
| Setup | 30s | no | Version-check on plugin install; print repair command if mismatch | claude-mem `Setup` |
| SessionStart | 30s | no | Read 3-tier snapshot, emit as `additionalContext` | claude-remember `session-start-hook.sh` |
| UserPromptSubmit | 10s | no | Strip `<private>`, force-keep `<retain>`, append to transcripts | Our design |
| PostToolUse (Write/Edit/MultiEdit) | 120s | yes | If tool output > 50 lines, append summary to `sessions/now.md` | claude-remember `post-tool-hook.sh` |
| Stop | 30s | no | Append turn to transcripts; spawn detached auto-extract | Our v0.0.1 carried forward |
| SessionEnd | 60s | no | Haiku-compress `now.md` → `today-{date}.md`, truncate `now.md` | claude-remember NDC pattern |

### 5.2.1 `stop_hook_active` recursion guard (verified Anthropic hook payload)

The Stop hook MUST short-circuit when invoked via a previous hook's auto-continuation (the `stop_hook_active` flag in the hook input JSON). Pattern:

```bash
# In bin/cmk-capture-turn (Stop hook handler):
hook_input=$(cat)
if [[ "$(echo "$hook_input" | jq -r '.stop_hook_active // false')" == "true" ]]; then
  echo '{"continue": true}' >&2     # No-op; let session end normally
  exit 0
fi
```

**Why**: without this guard, a Stop hook that calls back into Claude (or whose detached subprocess triggers another Stop indirectly) can loop. Verified pattern from Anthropic Claude Code hook spec — `stop_hook_active: true` indicates the Stop hook is firing as a result of a previous Stop hook's `decision: "block"` response.

This guard is a **bullet point in the implementation**, not a separate hook entry — same `cmk-capture-turn` handler, just an early-return check at the top.

### 5.3 Coexistence injection order (Option D)

Our SessionStart hook fires before Anthropic's auto-memory loads naturally. Both end up in Claude's context window; ours sits earlier (gets more attention). The output is `additionalContext` JSON per Anthropic's hook protocol — placed in the system prompt before user-message processing.

**Implements**: FR-9, ADR-0006, ADR-0011 Option D.

---

## 6. Auto-extract subagent + `memory-write` skill

### 6.1 Auto-extract invocation (tightened per claude-remember pattern)

Spawned detached by the Stop hook. Reads the just-captured turn from a temp file, invokes `claude --print` headlessly with a fact-extraction prompt.

**Tool allowlist (tightened from v0.0.1)**: only `Read`. Drop `Edit` and `Bash(wc *)`. Per claude-remember's verified `--allowedTools ""` pattern (zero tools), the sub-Claude only needs to read existing state; writes happen via the `memory-write` skill invocation.

```bash
claude --print \
  --model claude-haiku-4-5-20251001 \
  --add-dir "$REPO_ROOT" \
  --allowed-tools "Read" \
  --mcp-config '{"mcpServers":{}}' \
  --strict-mcp-config \
  --max-turns 1 \
  --output-format text \
  2>&1
```

**Strict isolation** matches claude-remember exactly: no MCP, single response, no tool sprawl.

**Concurrency-safe**: lock file at `context/.locks/auto-extract.lock` via `set -o noclobber` (claude-remember verified pattern).

**Structured logging — NDJSON across five log files** (per Hightower CCA-F harness pattern, refined per ChatGPT/Kiro convergence):

| Log file | What gets written | One-line schema (NDJSON) |
| --- | --- | --- |
| `context/sessions/{date}.extract.log` | Auto-extract invocations | `{ts, success, error_category, observation_count, skipped_reason, duration_ms}` |
| `context/sessions/{date}.audit.log` | Memory writes (add/replace/remove/tombstone) by skill or CLI | `{ts, actor, action, id, tier, write_source, trust}` |
| `context/sessions/{date}.compress.log` | Compression runs (session-end + lazy + daily/weekly) | `{ts, scope, input_bytes, output_bytes, model_id, cost_usd, duration_ms}` |
| `context/.locks/network-blocks.log` | Any sandbox/network denial during compressor or MCP runs | `{ts, host, port, reason, hook_or_tool}` |
| `context/.locks/shadowed_by.log` | 3-tier merge shadowing events (§7.1) | `{ts, id, winner_tier, shadowed_tiers[], source_file}` |

One JSON object per line, append-only. Parseable for analytics (`jq`, DuckDB, `cmk view`). Files rotate daily; old logs roll into `context/sessions/archive/` on the weekly curate run.

Example auto-extract line:

```json
{"ts":"2026-05-23T14:30:00Z","success":true,"error_category":null,"observation_count":1,"skipped_reason":null,"duration_ms":1842}
```

### 6.2 Auto-extract decision: where does the write go?

**[CHANGE absorbed from comparison]** Per ChatGPT's spec and Kiro's confidence-scoring pattern, the auto-extract sub-Claude routes writes by trust:

```text
For each candidate fact:
  determine trust based on:
    - <retain> tag present?           → high (force-keep)
    - explicit user signal ("remember this", etc.)? → high
    - clear pattern match (Hermes 6 triggers)?     → medium
    - implicit/weak signal?           → low (discard, log skip)

  IF trust = high:
    write directly to context/MEMORY.md via memory-write skill (or context/memory/<type>_<slug>.md if typed)

  IF trust = medium:
    write to context/queues/review.md (NOT MEMORY.md)
    User reviews periodically via `cmk queue review`; promotes or discards

  IF trust = low:
    discard. Log "skip: nothing durable" to extract.log
```

This adds a **review queue file** (`context/queues/review.md`) as an explicit staging area for medium-confidence auto-extracts. User has a chance to bless/discard before items become canonical memory.

### 6.3 The `memory-write` skill

Auto-triggers on phrases per FR-11. Three actions:

| Action | When triggered | Behavior |
| --- | --- | --- |
| `add` | New fact, user-explicit or auto-extract | Compute canonical text → derive ID → dedup check → cap check → write bullet + provenance |
| `replace` | "update memory: X is now Y" | Substring match → swap → recompute ID → record `superseded_by` on old |
| `remove` | "forget about X" | Substring match → confirm with user → **move to tombstones (per §6.5), NOT silent delete** |

Cap enforcement workflow at >95%: consolidate similar bullets / drop stale entries > 14 days old with no recent reference, THEN add new. Per FR-3.

### 6.4 Six writing triggers (Hermes-verified pattern)

The auto-extract prompt instructs the sub-Claude to save when:

1. **User corrections** — "Don't do that again." "Use this instead."
2. **Discovered preferences** — pattern recognition across turns
3. **Environment facts** — tool versions, paths, configurations
4. **Project conventions** — discovered through code inspection
5. **Completed complex workflows** — 5+ tool calls; consider saving the approach
6. **Tool quirks and workarounds** — non-obvious findings

And to skip: conversational chatter, trivial info, raw data dumps, session-specific ephemera, info already in MEMORY.md (check INDEX).

These are verbatim from Hermes Agent's writing-triggers pattern (Glukhov 2026-05-01, verified).

### 6.5 Tombstone discipline for deletions

**[CHANGE absorbed from comparison]** Per ChatGPT's explicit `tombstones/` directory and Kiro's `deleted_at` field — when a user says "forget about X" and we delete a bullet, we DON'T silently delete the file or strip the bullet without trace. Instead:

```text
1. User invokes `forget about X` (or `cmk forget P-A8FN3MQ2`)
2. memory-write skill (with `remove` action) finds the matching bullet/fact
3. Confirms with user (the only action that confirms)
4. Moves the original to context/memory/archive/tombstones/<id>.md
   With added frontmatter:
     deleted_at: 2026-05-23T14:30:00Z
     deleted_reason: "user said: forget about X"
     deleted_by: user-explicit
5. Removes the bullet from MEMORY.md (or wherever it lived)
6. Updates SQLite cache: marks observation as deleted (not actually purged)
```

Future `mk_get(P-A8FN3MQ2)` still resolves — returns the tombstoned content with a clear "deleted on YYYY-MM-DD" annotation. Audit trail preserved. Truly destructive operations (`cmk purge --hard`) require explicit user invocation outside the normal "forget" flow.

This mirrors the design of git revert (don't rewrite history) more than git rebase (rewrite). For memory, we want the audit trail more than the cleanliness.

### 6.6 Privacy tag handling

`<private>...</private>` content is **stripped at hook level** (UserPromptSubmit, Stop) before any disk write. The content NEVER touches disk in any form. Placeholder `[private content redacted]` appears in transcripts/captures.

`<retain>...</retain>` content is **force-saved** by the auto-extract sub-Claude even if it wouldn't otherwise pass the durable-fact filter. The `<retain>` tags themselves are stripped from saved content.

(v0.1.x candidate: add `<ephemeral>` tag for session-only content auto-extract should always skip. Per ChatGPT/Google A spec convergence.)

### 6.7 Poison_Guard — secret + injection filter (before any commit-eligible write)

Auto-extract runs against captured turns that may contain secrets pasted by the user (API keys, tokens, passwords) or prompt-injection phrases scraped from web content the user shared. Because the project tier (`<repo>/context/`) is **committed to git**, a single leaked secret in `MEMORY.md` is a real exposure event.

**Poison_Guard** is a pre-write regex filter applied inside the `memory-write` skill — before any write to a project-tier or user-tier file:

```text
Patterns rejected (write fails with category='poison_guard'):

  Secrets (case-insensitive):
    /(?i)(aws_secret|aws_access_key_id)[\s:=]+[A-Z0-9/+=]{16,}/
    /(?i)(api[_-]?key|secret|password|passwd|token|bearer)[\s:=]+["']?[A-Za-z0-9_\-/+=]{20,}/
    /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/
    /ghp_[A-Za-z0-9]{36}/                       (GitHub personal access token)
    /sk-(ant-|proj-)?[A-Za-z0-9_\-]{40,}/       (OpenAI / Anthropic style keys)
    /xox[bps]-[A-Za-z0-9-]{10,}/                (Slack tokens)

  Prompt-injection / role-override (case-insensitive):
    /(?i)ignore (all |any |previous |prior )?(instructions?|prompts?|rules?)/
    /(?i)you are now (a |an |the )?[A-Za-z]/
    /(?i)<\/?system>|<\/?assistant>/            (fake role tags)
    /(?i)disregard the above/
```

**Behavior on match**:

1. The write is **rejected** (no bullet added, no fact file written).
2. Logged to `context/.locks/poison-guard.log` (NDJSON): `{ts, pattern_id, source_file, source_line, action: "rejected", redacted_excerpt: "...***..."}`. The matched text itself is **redacted** in the log — only a pattern ID + truncated/masked excerpt is recorded.
3. The auto-extract sub-Claude logs `error_category: "poison_guard"` in `extract.log` so analytics can track frequency.
4. **No notification to the user** by default (avoid notification fatigue). `cmk doctor` surfaces a count via "N writes blocked by Poison_Guard this week".

**Tunable via** `context/settings.json`: users can extend the pattern list (additive, never replacement) or set `poison_guard.strict: true` to also reject `low`-trust writes that score >50% on a softer heuristic. Default is the conservative regex list above.

**Why discoverability-only, not perfect prevention**: per user-locked decision on the discoverability defense model — the threat model is "accidental commit", not "active adversary in your repo". Regex catches the high-frequency mistakes; secret-scanners (gitleaks, trufflehog) are the second line of defense, not us.

### 6.8 Conflict queue (companion to the review queue)

The review queue (§6.2) handles medium-trust *new* writes awaiting blessing. A separate concern: what happens when an auto-extract or user statement **contradicts an existing high-trust fact**?

Example: `MEMORY.md` has `(P-A8FN3MQ2) we standardized on Python 3.13` (trust: high, user-explicit). Later, auto-extract captures "we're moving to Python 3.14 for the websockets fix" from a turn — same canonical topic, different content.

**Conflict detection**: the `memory-write` skill, before writing, runs a semantic similarity check (FTS5 + optional vector) against existing observations on the same heading_path. If similarity > 0.85 AND content differs → **conflict**.

**Routing**:

```text
IF new_write.trust < existing_obs.trust:
  Write to context/queues/conflicts.md (NOT MEMORY.md, NOT review.md)
  Append entry:
    - (proposed: P-NEW) "<new bullet text>"
      conflicts_with: P-A8FN3MQ2
      detected_at: <ISO>
      resolution: pending

IF new_write.trust >= existing_obs.trust:
  Mark existing as superseded_by: P-NEW
  Write new as canonical
  Both stay in archive (per §3.4 consolidation rules)
```

User resolves via `cmk queue conflicts`: review each conflict; choose `keep-old`, `keep-new`, or `merge-both` (writes a third combined bullet that supersedes both originals).

**Why separate from the review queue**: conflicts are higher-stakes than fresh medium-trust facts — they imply existing memory is wrong. Different queue, different UX, different urgency. Per ChatGPT spec convergence + user-locked decision on the every-observation provenance principle (conflicts must surface explicitly, not silently overwrite).

**Implements**: FR-10, FR-11, FR-12, FR-13, FR-15, NFR-9.

---

## 7. 3-tier scope merging

### 7.1 Resolution algorithm at session start

The SessionStart hook (`cmk-inject-context`) resolves and merges the three tiers:

```text
1. Discover tier paths
   local_dir   = <repo>/.claude/local/         (if exists)
   project_dir = <repo>/context/               (walks up from cwd)
   user_dir    = ~/.claude-memory-kit/         (if exists)

2. Read settings.json from each tier (deep-merge: local > project > user)
   Scalars override; arrays concatenate-and-dedup by ID.

3. Read observation files
   For each canonical file (MEMORY.md, USER.md, SOUL.md, HABITS.md, LESSONS.md):
     Read bullets from any tier where present.
     Resolve duplicate IDs: most-specific tier wins.
     Log shadowed copies to context/.locks/shadowed_by.log:
       "P-A8FN3MQ2 in project shadows same ID in user (line 12)"

4. Concatenate into frozen snapshot (≤10 KB total)
   Order: local → project → user (highest priority first in prompt)

5. Emit as additionalContext JSON via hook output protocol
```

### 7.2 `cmk config --show-origin` debug command

Mirrors `git config --show-origin`. Resolves the source of any setting or observation:

```text
$ cmk config --show-origin USER.preferred_editor
local    <repo>/.claude/local/overrides.md:5    "neovim"
project  <repo>/context/SOUL.md:18              "vscode"     (shadowed by local)
user     ~/.claude-memory-kit/USER.md:7         "vim"        (shadowed by project)
```

Direnv lesson: without `--show-origin`, users rage-quit when settings appear from nowhere.

**Implements**: FR-7, FR-13, ADR-0003.

---

## 8. Rolling-window compression

### 8.1 The four-layer pipeline

```text
sessions/now.md
  │  Live appends from PostToolUse + Stop hooks
  │
  │  At SessionEnd: Haiku compresses now.md → today-{date}.md (one-shot per session)
  │  Truncate now.md after success.
  ▼
sessions/today-{YYYY-MM-DD}.md
  │
  │  Daily cron at 23:00:
  │    Re-compress today-*.md (last 7 days) into fresh sessions/recent.md
  ▼
sessions/recent.md
  │
  │  Weekly cron at Sun 09:00:
  │    Move today-*.md files older than 7 days into archive.md
  │    Rebuild recent.md from current week's files
  ▼
sessions/archive.md     (append-only)
```

### 8.2 Cooldowns (verified from claude-remember `save-session.sh`)

| Operation | Cooldown | Source |
| --- | --- | --- |
| PostToolUse → `now.md` append | none (file I/O is cheap) | Our design |
| Haiku compression (any `claude --print` call) | **120 seconds minimum** between calls | claude-remember `save-session.sh` |
| Daily distill (today-*.md → recent.md) | 24h (cron-scheduled) | Our design |
| Weekly curate (today-*.md > 7d → archive.md) | 7d (cron-scheduled) | Our design |

Tracked via `context/.locks/last-haiku-call.ts` timestamp file.

### 8.2.1 Lazy compression fallback (no-cron environments)

Cron is the default scheduler for daily/weekly compression, but in environments where cron isn't available (corporate Windows without Task Scheduler access, restricted CI runners, ephemeral dev containers) we fall back to **lazy-on-read** compression triggered by the SessionStart hook:

```text
At SessionStart, after snapshot assembly:
  IF today-{date}.md older than 24h AND no recent.md OR recent.md > 7d stale:
    Spawn detached `cmk compress --lazy` subprocess (non-blocking)
    Subprocess does the daily/weekly rollup work cron would have done
    Logs to context/.locks/lazy-compress.log
  Snapshot for THIS session uses whatever state existed at hook fire time
  (next session gets the freshly compressed state)
```

**Trigger condition**: missing scheduled output, not "user invoked compress". Cheap (one mtime + one stat check) so safe to run every session start.

**Why "lazy" not "synchronous"**: blocking SessionStart on Haiku compression would violate NFR-1's 500ms budget. Detached fire-and-forget keeps session start fast; the user pays the compression cost ambiently between sessions.

**Per HC-6**: `cmk doctor` detects no-cron mode and reports "running lazy compression — install cron for tighter schedules". Non-fatal.

### 8.3 CompressorBackend interface (pluggable for v0.2)

v0.1 ships one implementation. Interface defined now for v0.2 forward-compatibility (ADR-0008):

```typescript
interface CompressorBackend {
  compress(opts: {
    input: string;
    maxOutputBytes: number;
    preserveCitationIds: boolean;
    instructions?: string;
  }): Promise<CompressorResult>;

  modelId(): string;
  estimatedCostPerCall(inputBytes: number): number;
}

interface CompressorResult {
  outputText: string;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
  preservedIds: string[];
}

// v0.1 implementation:
class HaikuViaAnthropicApi implements CompressorBackend {
  modelId() { return "claude-haiku-4-5-20251001"; }
  // ... invokes `claude --print --model haiku` via subprocess
}
```

v0.2 candidates per ADR-0008: `BedrockHaiku` (AWS), `LocalLlama` (air-gapped, KVzip-style). Backend selection via `cmk config set compressor.backend <id>`.

### 8.4 Compression prompt (preserves IDs and headings)

```text
You are a memory compressor for claude-memory-kit. Output exactly the
following Markdown structure:

## Decisions
- <≤80 chars>. cites: [#P-XXXXXXXX, ...]

## Open Questions
- <≤80 chars>

## Files Touched
- path: <relative> — <verb> (cites: [#P-XXXXXXXX])

## Active Threads
- <≤80 chars>

Hard rules:
1. Preserve any citation ID matching /#[ULP]-[A-Z0-9]{6,8}/ verbatim.
2. Total output ≤ <maxOutputBytes> bytes.
3. If a section has no entries, omit the heading.
4. Never invent new IDs.

INPUT:
<the rolling-window transcript>
```

Section structure adapted from Anthropic Claude Code's verified 9-section auto-compact pattern (per leaked source). Trimmed to 4 sections since we're compressing memory, not full sessions.

**Implements**: FR-19, FR-20, FR-21, ADR-0008.

---

## 9. Search layer (Layer 5 — optional)

### 9.1 SQLite + FTS5 schema

Read-cache at `<repo>/context/.index/memory.db`. Regenerable; never source of truth (T1). Schema borrowed from claude-mem's module-segmented pattern (verified via their `src/services/sqlite/` listing — `Sessions.ts`, `Observations.ts`, `Timeline.ts`, `SessionStore.ts`, `PendingMessageStore.ts` as separate concerns).

```sql
CREATE TABLE observations (
  id TEXT PRIMARY KEY,               -- e.g. 'P-A8FN3MQ2'
  tier TEXT NOT NULL CHECK(tier IN ('U','P','L')),
  source_file TEXT NOT NULL,
  source_line INTEGER NOT NULL,
  source_sha1 TEXT NOT NULL,
  heading_path TEXT,                 -- 'MEMORY.md > Active Threads'
  body TEXT NOT NULL,
  write_source TEXT NOT NULL,
  trust TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  superseded_by TEXT REFERENCES observations(id),
  deleted_at INTEGER                 -- nullable; set when tombstoned (§6.5)
);

CREATE INDEX idx_observations_tier ON observations(tier);
CREATE INDEX idx_observations_trust ON observations(trust);
CREATE INDEX idx_observations_created_at ON observations(created_at);
CREATE INDEX idx_observations_deleted ON observations(deleted_at) WHERE deleted_at IS NOT NULL;

CREATE VIRTUAL TABLE observations_fts USING fts5(
  body, heading_path, write_source,
  content='observations',
  content_rowid='rowid',
  tokenize='porter unicode61'
);

-- Sync triggers keep FTS5 mirror current
CREATE TRIGGER obs_after_insert AFTER INSERT ON observations BEGIN
  INSERT INTO observations_fts(rowid, body, heading_path, write_source)
  VALUES (new.rowid, new.body, new.heading_path, new.write_source);
END;
CREATE TRIGGER obs_after_update AFTER UPDATE ON observations BEGIN
  UPDATE observations_fts SET body=new.body, heading_path=new.heading_path, write_source=new.write_source
  WHERE rowid=new.rowid;
END;
CREATE TRIGGER obs_after_delete AFTER DELETE ON observations BEGIN
  DELETE FROM observations_fts WHERE rowid=old.rowid;
END;

-- File-watcher checkpoint
CREATE TABLE files (
  path TEXT PRIMARY KEY,
  mtime INTEGER NOT NULL,
  sha1 TEXT NOT NULL,
  indexed_at INTEGER NOT NULL
);

PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
```

WAL mode allows many readers + one writer concurrently.

### 9.2 Reindex strategy (hybrid)

| Trigger | Strategy |
| --- | --- |
| Boot (`cmk reindex --boot`) | Walk markdown, compare mtime+sha1, re-index only changed files |
| Runtime (file-watcher) | `inotify`/`fswatch`/`chokidar` watches `context/`, debounce 500ms, re-index on FS event |
| Recovery (`cmk reindex --full`) | Drop DB, rebuild from markdown |

### 9.3 Hybrid search (`cmk search`)

```text
cmk search "<query>" [--mode keyword|semantic|hybrid] [--min-trust low|medium|high]
                     [--tier U|P|L] [--since YYYY-MM-DD] [--limit N]
                     [--include-tombstoned]    # default: exclude deleted
```

Two backends:

- **Keyword (always available)**: FTS5 BM25. ~100ms for 10k bullets.
- **Semantic (optional, Layer 5 install)**: memsearch + Milvus or milvus-lite. ~1s for same corpus.
- **Hybrid (default when both available)**: reciprocal-rank fusion (0.5 keyword, 0.5 semantic).

Returns: `[{id, snippet, source_file:source_line, trust, score}]`. Trust visible so users can filter via `--min-trust`.

**Implements**: FR-16, FR-17, FR-18, FR-30, NFR-9.

---

## 10. MCP server (Layer 4b — optional)

Six tools (per FR-26 + the `recent_activity` borrowed from Basic Memory verified surface):

| Tool | Purpose | Response size |
| --- | --- | --- |
| `mk_search(query, mode?, tier?, since?, limit?, min_trust?)` | BM25 + optional vector hybrid | ~50-100 tokens/result |
| `mk_get(ids[])` | Full body + provenance + relations | ~500-1000 tokens/result |
| `mk_timeline(anchor, depth_before?, depth_after?)` | Sequential context around an ID or timestamp | varies |
| `mk_cite(id)` | Canonical Markdown citation link `[#P-A8FN3MQ2](memkit://obs/P-A8FN3MQ2)` | trivial |
| `mk_remember(text, tier?, cites?)` | Explicit user-driven save with audit trail | `{id, written_to, accepted}` |
| `mk_recent_activity(window?: "1h"\|"24h"\|"7d", limit?)` | Recent memory mutations — common query | List of recent observation changes |

### 10.1 Security

Per NFR-6 + Anthropic API memory tool guidance (verified):

- MCP server binds to `127.0.0.1` only (never 0.0.0.0)
- Path traversal validation on every read/write
- Canonicalize paths via `pathlib.Path.resolve()`; reject any path outside `<repo>/context/` or `~/.claude-memory-kit/`
- Per Kiro's stricter pattern: validate that paths start with the expected prefix; reject URL-encoded traversal (`%2e%2e%2f`)

### 10.2 When to use each mechanism

| Mechanism | When | Visibility to Claude |
| --- | --- | --- |
| Hooks | Involuntary lifecycle (capture on Stop, inject on SessionStart) | Hidden |
| `memory-write` skill | User-explicit triggers ("remember this") — auto-triggered by phrase | Visible, auto-invokes |
| MCP tools | Explicit retrieval Claude calls during reasoning | Visible, Claude chooses |

**Implements**: FR-26.

---

## 11. Anthropic Auto Memory coexistence (Option D)

### 11.1 What we do

- **Do NOT disable** Anthropic's auto-memory. It writes to `~/.claude/projects/<slug>/memory/` per its own schedule.
- **Our SessionStart hook (primary) and PreToolUse hook (fallback) inject our `context/` snapshot first** as `additionalContext`. Ours sits earlier in the prompt → gets more attention.
- **Both memories load**. Session-start token cost: ~10 KB ours + ~10-25 KB Anthropic = ~20-35 KB. Within budget.
- **Ours is canonical** — committed to git, reviewed by humans, citation IDs stable, full provenance.
- **Theirs is supplementary** — machine-local capture with no audit trail.

### 11.2 `cmk import-anthropic-memory` command

Manual bridge for users who want to fold useful bullets from Anthropic's local capture into ours:

```bash
cmk import-anthropic-memory [--dry-run]
```

1. Read `~/.claude/projects/<current-slug>/memory/MEMORY.md`.
2. For each bullet: compute our canonical ID via `canonicalize()`. If ID already exists in our `context/MEMORY.md` → skip (dedup).
3. Else propose to add to our MEMORY.md as `write_source: imported`, `trust: medium`.
4. Print proposed additions; ask user to confirm (or `--dry-run` skips this).
5. Apply confirmed additions.

Explicit user action only. Never automatic.

### 11.3 Alternative: read Anthropic's session JSONL directly

claude-remember's verified pattern (per primary-source examination): they read Anthropic's session JSONL at `~/.claude/projects/<slug>/<session-id>.jsonl` directly. They never write their own transcript.

We don't adopt this in v0.1 (we want our own canonical transcripts/), but as a v0.2 optimization: if Anthropic's JSONL is reliable enough, we could drop our `transcripts/` and read theirs. Single source of truth, less storage.

**Implements**: ADR-0011 Option D.

---

## 12. `cmk` CLI

Single Node binary, ships with the kit. Subcommands:

| Subcommand | What it does |
| --- | --- |
| `cmk install` | Cross-OS one-shot install (equivalent to install.sh / install.ps1) |
| `cmk init-user-tier` | Scaffold `~/.claude-memory-kit/` once per machine |
| `cmk search "<query>" [flags]` | Per §9.3 — hybrid keyword + semantic |
| `cmk reindex [--boot \| --full]` | Rebuild SQLite cache from markdown |
| `cmk doctor` | Run HC-1..HC-8 health checks; route to self-repair |
| `cmk config <get\|set\|--show-origin> <key>` | Settings access (§7.2) |
| `cmk view [--port N]` | Local markdown viewer at `127.0.0.1:37778` |
| `cmk import-anthropic-memory [--dry-run]` | Per §11.2 |
| `cmk trust <id> <high\|medium\|low>` | Manual trust override |
| `cmk lessons promote <id>` | Move a project-tier observation to `~/.claude-memory-kit/LESSONS.md` |
| `cmk queue review` | **[CHANGE]** Interactive review of `context/queues/review.md` (medium-trust auto-extracts). Promote / discard each |
| `cmk forget <id-or-query>` | Tombstone a fact per §6.5 |
| `cmk purge --hard <id>` | Permanent deletion (requires confirmation; rare) |
| `cmk repair` | Idempotent self-repair (re-install hooks, reset stale locks) |
| `cmk version` | Print kit version + check for updates |

CLI implemented in Node; ships as `@claude-memory-kit/cli` npm package + standalone binary via `pkg`.

**Implements**: FR-22, FR-23.

---

## 13. Installation paths

Per OQ-2 + verified plugin format from claude-mem (`plugin/.claude-plugin/plugin.json`):

| Path | Audience | Mechanism |
| --- | --- | --- |
| `bash install.sh` | macOS / Linux / Git Bash | Reads `template/`, scaffolds into target, never overwrites |
| `pwsh install.ps1` | Windows-native | PowerShell-native equivalent |
| `npx claude-memory-kit install` | Cross-OS one-liner | Node-distributed (`@claude-memory-kit/cli`) |
| Claude Code plugin (`/plugin install claude-memory-kit` + `/claude-memory-kit:bootstrap`) | Claude Code users | Plugin manifest in `plugin/.claude-plugin/plugin.json`; `bootstrap` skill scaffolds per-project files |
| Manual copy (documented in `INSTALL-{windows,macos,linux}.md`) | Offline / air-gapped | Direct copy of `template/` contents |

All paths produce **identical scaffolded state** in the target project. Tested via CI matrix on Windows 10/11, macOS 14+, Ubuntu 22.04+ (per NFR-3).

### 13.1 CLAUDE.md loader block (idempotent install marker)

The install paths above MUST inject the kit's CLAUDE.md content inside an idempotent delimited block, never as a free-floating paste:

```markdown
<!-- claude-memory-kit:start v0.1.0 -->
## Memory routing (claude-memory-kit)

[kit-provided CLAUDE.md content here — session-start reads, health-check rules, etc.]

<!-- claude-memory-kit:end -->
```

**Behavior**:

- On `cmk install` (any path), if delimiters are absent → append the block at the bottom of the project's existing CLAUDE.md (or create CLAUDE.md if missing).
- If delimiters are present with a matching or older version → replace the block contents in place. Preserve everything outside the delimiters verbatim (the user's hand-written instructions).
- If delimiters are present with a newer version → no-op + warn. User downgrade requires `cmk install --force`.
- On `cmk uninstall` → strip the block + delimiters. Everything outside is untouched.

**Why this pattern**: matches `direnv`/`asdf`/`fzf`/`nvm` shell-init conventions. Lets users safely re-run `cmk install` to refresh the kit without losing their own CLAUDE.md edits. Per Kiro's spec convergence on installer idempotency.

**Implements**: FR-22, FR-23, FR-24.

---

## 14. Failure modes + health checks

Eight yes/no checks at session start (HC-1..HC-7 from requirements.md, plus HC-8 added below). Each has a documented self-repair path.

| ID | Check | Repair if failed |
| --- | --- | --- |
| HC-1 | memsearch installed (Layer 5) | ASK user to approve `python -m pip install "memsearch[onnx]"` |
| HC-2 | Stop + SessionStart hooks registered | `cmk repair --hooks` re-installs from template |
| HC-3 | MEMORY.md distill is fresh (≤2 days) | Manual `bash scripts/run-daily-distill.sh` |
| HC-4 | Transcripts firing (≤3 days) | Root cause: project not primary cwd in Claude Code. Fix: reopen project as primary |
| HC-5 | INDEX.md matches `context/memory/` files | `cmk reindex` rebuilds |
| HC-6 | Cron jobs registered with host scheduler | `python scripts/register-crons.py` (idempotent) |
| HC-7 | memsearch backend reachable (Layer 5) | Windows: start Docker Desktop, `docker compose up -d` in `milvus-deploy/`. macOS/Linux: check `~/.memsearch/milvus.db` |
| **HC-8** | **[CHANGE]** Native Anthropic Auto Memory status detected | **Inspect `~/.claude/projects/<slug>/memory/` existence + contents. Log result to `context/.locks/native-memory-status.log` as `{active: true \| false \| unknown, last_modified: <ISO>, file_count: N}`. Non-fatal — informational only, lets users see whether their kit is supplementing or substituting Anthropic's. Per Kiro's spec-pattern of explicit detection + audit logging.** |

**Critical rule** (per NFR-9): any repair requiring `pip install` / `npm install` / system-level changes MUST ASK the user first.

**Implements**: FR-22, all NFRs.

---

## 15. Trade-offs explicitly accepted

Decisions made knowing the cost — for the audit trail:

1. **Provenance frontmatter on every bullet (~150 bytes/bullet).** Full audit trail, uniform schema. Per T8/FR-29.
2. **180-line CLAUDE.md template** even though Bijit Ghosh's article recommends 80-120. User explicitly chose to test. Refactor in v0.1.x if adherence empirically degrades.
3. **Token budget ~20-35 KB at session start** (ours + Anthropic's under Option D). Higher than ideal but well within Claude's 200K context.
4. **Per-project isolation requires explicit promotion for cross-project facts.** `LESSONS.md` (user tier) and `cmk lessons promote` cover this. Cross-project search deferred to v0.2.
5. **6 MCP tools instead of 5.** `recent_activity` added after Basic Memory primary-source examination showed it's a common query.
6. **Markdown-as-source / SQLite-as-cache requires regeneration on schema changes.** Acceptable — simpler than DB-as-source-of-truth.
7. **PreToolUse hook kept as fallback** for snapshot injection. Slight redundancy with SessionStart; defense-in-depth.
8. **Haiku 4.5 for auto-extract**, not Sonnet/Opus. Cost: $1/$5 per MTok. Quality difference small enough that Haiku is the right call.
9. **[CHANGE] Tombstones, not silent deletes.** Bigger archive, more files. Accepted because audit trail beats cleanliness for memory (mirrors git revert philosophy).
10. **[CHANGE] Review queue introduces a second-step workflow** for medium-trust auto-extracts. Users have to explicitly bless via `cmk queue review`. Friction accepted for safer auto-capture.

---

## 16. v0.1 → v0.2 forward-compatibility

Seams designed into v0.1 to enable v0.2 features without rewrite:

### 16.1 CompressorBackend interface (defined §8.3)

v0.1 ships `HaikuViaAnthropicApi`. v0.2 adds `BedrockHaiku` + `LocalLlama`. Per ADR-0008.

### 16.2 External memory provider plugin slot (Hermes pattern verified)

Per primary-source examination of `plugins/memory/__init__.py + 8 subdirs` in NousResearch/hermes-agent:

```text
v0.2 layout:
plugins/memory/
├── __init__.{py,ts}           ← dispatcher
├── honcho/
├── mem0/
├── hindsight/
└── ...
```

Activated via `cmk config set memory.provider <name>`. Implements `prefetch_all` + `sync_all` interface mirroring Hermes. Per ADR's roadmap and the user-locked Q1 answer (keep ours v0.1; plug-ins v0.2 after testing).

### 16.3 Cross-project search seam

`~/.claude-memory-kit/registry.json` lists registered projects' `context/` paths. `cmk register-project <path>` and `cmk search --all-projects "<query>"`. The user-tier `LESSONS.md` is the interim v0.1 solution.

### 16.4 Web viewer rich UI

v0.1 ships minimal static markdown viewer at port 37778. v0.2 candidates: searchable timeline, observation-graph visualization, edit-in-place. Per OS-3.

### 16.5 Companion skills (claude-mem inspiration)

v0.1 ships `memory-write` + `bootstrap` only. v0.3+ candidates: `make-plan`, `pathfinder`, `weekly-digests`, `learn-codebase`. Per OS-2 + Hightower CCA-F harness patterns.

### 16.6 IDE / cross-agent adapters

v0.1 is Claude Code only. v0.2 candidates: `cursor-hooks/`, `.windsurf/`, `.codex-plugin/` adapter dirs. Per T6 + OS-1.

### 16.7 `<ephemeral>` tag

v0.1.x patch candidate. Third tag alongside `<private>` and `<retain>` for session-only content auto-extract should always skip. Per ChatGPT + Google Antigravity spec convergence.

---

## End of design.md v0.1.0

Sections 1-16 = full design surface. Cross-references to specific FRs and ADRs throughout. The four absorbable changes from the spec-generator comparison (tombstones §6.5, review queue §6.2, native auto-memory detection HC-8, structured logging §6.1) are baked in.

Total ~870 lines. Next per Kiro flow: write `tasks.md` after design.md is approved.
