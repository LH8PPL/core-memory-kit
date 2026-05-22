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
|---|---|---|---|
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
|---|---|---|
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
|---|---|---|
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

## End of section 1-3 (review checkpoint)

The remaining sections are:

- **4. Provenance frontmatter** — schema, writers, trust levels
- **5. Hooks (5+1)** — full hook configs, command paths, schemas
- **6. Auto-extract subagent + memory-write skill** — prompts, triggers, error handling
- **7. 3-tier scope merging** — resolution algorithm, `--show-origin` debug
- **8. Rolling-window compression** — pluggable CompressorBackend interface
- **9. Search layer** — SQLite+FTS5 schema, hybrid search, reindex strategy
- **10. MCP server** — 5 tools, schemas, security model
- **11. Anthropic coexistence (Option D)** — injection order, import command
- **12. `cmk` CLI** — subcommands and implementation
- **13. Installation paths** — install.sh / install.ps1 / Claude Code plugin
- **14. Failure modes + health checks** — HC-1..HC-7, self-repair
- **15. Trade-offs explicitly accepted** — including the 180-line CLAUDE.md experiment
- **16. v0.1 → v0.2 forward-compat** — CompressorBackend interface, LESSONS.md, cross-project search seam

Estimate: ~400 more lines if I keep the same depth.

**Review checkpoint**: does the format/depth above work for you? Specifically:

- Diagram density (right balance of ASCII art + table + prose?)
- FR cross-references at the end of each subsection (useful or noise?)
- Code samples for things like canonical text rules (helpful or premature?)
- Section length (~30-50 lines per major section — too much, too little, right?)

Confirm direction and I'll continue with sections 4-16 in the next message. Or call out specific changes you want first.
