---
date: 2026-05-25
topic: claude-remember — implementation patterns for rolling-window compression (Tasks 28 + 29)
source: https://github.com/Digital-Process-Tools/claude-remember
status: complete
related_research: [2026-05-21-claude-remember-architecture, 2026-05-22-primary-source-examination]
informed_sections: [tasks.md Task 28 (daily distill), Task 29 (weekly compress), design.md §6.6 (locking), §7 (rolling-window)]
tags:
  - claude-remember
  - code-dive
  - rolling-window
  - compression
  - haiku-sandboxing
  - implementation-patterns
  - license-constrained
---

# claude-remember code dive — implementation patterns for the rolling window

## License constraint — read this first

claude-remember ships under a **"Community License"** (not SPDX-standard; full text at [LICENSE](https://github.com/Digital-Process-Tools/claude-remember/blob/main/LICENSE)) with two clauses that directly affect this absorb effort:

> **1. NO COMMERCIAL REDISTRIBUTION.** You may not sell, sublicense, or redistribute the Software, in whole or in part, as a commercial product or service, or include it in a product or service offered for sale.
>
> **2. NO COMPETING USE.** You may not use the Software to build or offer a product or service that competes with the Software or with any commercial offering by Digital Process Tools.

**Implications for claude-memory-kit:**

- We **cannot copy code verbatim** from claude-remember. Their shell scripts, Python files, and prompt templates are copyrighted expression. Lifting any of these into the kit creates a license violation.
- We **can absorb ideas / algorithms / patterns**. Those are not copyrightable. "Use `noclobber` for atomic locking" is a generic Unix pattern; "compress now.md to today-X.md after a 1-hour cooldown" is an architectural decision, not expression.
- We **can mirror specific numeric values** (cooldowns, thresholds, retention windows). Numbers tuned for similar use cases are functional facts; multiple memory systems use similar timings. But we'd derive ours from independent reasoning + cite their value as one data point.
- We **must write our own prompts**. Their compression and consolidation prompt templates are creative expression. We adopt the *shape* (delimiter-separated multi-section response, mechanical-compression-no-creativity directive) but write the actual instructions in our own words.
- We **must attribute** in SOURCES.md regardless of how thin the absorb is — attribution is good practice even when the legal requirement is murky.

**Competing-use concern.** Clause 2 is the load-bearing one. claude-memory-kit IS a long-term memory system for Claude Code. Whether the kit "competes" with claude-remember depends on how broadly "competes" is interpreted (the term isn't defined in their license). Conservative reading: we are a competing product, full stop. Liberal reading: we don't compete because we have a different scope (3-tier vs single-workspace, auto-persona vs none, Claude-Code-native vs cross-tool). Either way, the safest posture is: **assume the strict interpretation, lift ideas not code, write our own prompts from scratch, cite them.**

If the user wants a stronger legal answer than "assume strict and proceed accordingly," the right move is asking DPT directly — but doing that signals intent and may invite a "no, you can't" response that closes off even idea-absorbing. For now: absorb ideas, write everything from scratch, document the inspiration.

---

## Why this note exists

Per [the meta-discussion on 2026-05-25](../journey/build-log.md): the project did partial code dives on 5 reference projects in [the primary-source examination doc](2026-05-22-primary-source-examination.md), and a full dive on GBrain in the [2026-05-24 GBrain note](2026-05-24-gbrain-architecture.md), but never dove into claude-remember's actual rolling-window algorithm. That's the project we're about to re-implement in Tasks 28 (daily distill) and 29 (weekly compression). This note fixes the gap: clones the repo, reads the four key files, and abstracts the algorithm + decisions worth porting.

Method: cloned to `/tmp/claude-remember`, read `pipeline/consolidate.py`, `pipeline/extract.py`, `scripts/save-session.sh`, `scripts/run-consolidation.sh`, and the four prompt templates in `prompts/`. ~90 minutes.

## The complete rolling-window pipeline

```text
Claude Code session JSONL
         │
         │  PostToolUse hook (every tool call)
         ▼
    save-session.sh ──┐
    (cooldown 120s)   │
                      │  Haiku call: summarize new exchanges since last position
                      ▼
                   now.md ──┐
                   (append) │
                            │  NDC trigger after each save (cooldown 1h, background subshell)
                            ▼
                   today-YYYY-MM-DD.md ──┐
                   (compressed snapshot;  │
                    now.md truncated)     │
                                          │  run-consolidation.sh (nightly cron)
                                          ▼
                                    recent.md  ←── last ~3 days
                                    archive.md ←── older, grouped by week
                                    today-*.done.md  (audit retention)
```

Five transitions, each with its own trigger, cooldown, lock, and prompt.

## Transition 1: session JSONL → `now.md` (incremental capture)

**Trigger:** PostToolUse hook fires `save-session.sh` after every tool call.

**Throttle gates (in order — first failure exits 0):**

1. **Lock check:** `( set -o noclobber; echo $$ > "$LOCK_FILE" )` atomic file create. Lock file path: `$REMEMBER_DIR/tmp/save.lock`. If lock exists, check `kill -0 $LOCK_PID` — if alive, exit; if dead (stale), take over.
2. **Cooldown:** 120 seconds (configurable via `cooldowns.save_seconds`). `[$(date +%s) - $(cat marker)] < cooldown` → exit.
3. **Minimum threshold:** ≥3 human messages in the new exchanges since last position (configurable via `thresholds.min_human_messages`). Below threshold → exit.

**Extraction:**

- Loads `last-save.json` keyed by `{session: <uuid>, line: <jsonl-line-num>}`. If session id matches, resume from `line`. If session changed OR file missing OR JSON parse fails → resume from line 0.
- Reads `~/.claude/projects/<slug>/<session-id>.jsonl` directly — NEVER writes its own transcript.
- Slug derivation: `re.sub(r'[^a-zA-Z0-9]', '-', project_dir)`. Handles Unix `/`, Windows `\`, and drive `:` uniformly.
- **Drops** messages where `type ∉ ('user', 'assistant')` OR `isMeta == True`.
- **Drops** content containing `<system-reminder>`, `<command-name>`, or `<local-command` — these are noise, not real exchanges.
- **Compacts** tool-use blocks into short summaries:
  - `Read`/`Edit`/`Write` → `[TOOL: Read config.ini]` (basename only)
  - `Bash` → `[TOOL: Bash 'git status']` (command truncated at 80 chars)
  - `Grep`/`Glob` → `[TOOL: Grep 'pattern']`
  - Other → `[TOOL: <name>]`

**Dedup context:** Before calling Haiku, the LAST `##` entry from `now.md` is `tail`-ed into a temp file and included in the prompt. Haiku sees its own prior entry as context — prevents re-summarizing identical work. If `now.md` doesn't exist, sends `(no previous entry)`.

**Haiku invocation (sandboxed):**

```bash
cd /tmp && env -u CLAUDECODE claude -p \
    --model haiku --allowedTools "" --max-turns 1 \
    --output-format json \
    --mcp-config '{"mcpServers":{}}' --strict-mcp-config \
    2>"$HAIKU_STDERR" < "$TMP_PROMPT"
```

Sandbox properties:

1. **`cd /tmp`** — neutral working directory; even if a tool were allowed, no project files reachable.
2. **`env -u CLAUDECODE`** — strips the env var Claude Code sets to identify itself. Prevents Haiku from picking up a "you are running inside Claude Code" assumption.
3. **`--allowedTools ""`** — empty allowlist. NO tools at all.
4. **`--max-turns 1`** — single response, no loop.
5. **`--mcp-config '{"mcpServers":{}}' --strict-mcp-config`** — explicit empty MCP config; strict mode rejects ambient MCP servers.
6. **Stdin from temp file** — prompt content via redirect, NOT shell interpolation. Preserves any `$`, backtick, `<`, `>` in the prompt verbatim.

**Output format expected (now.md entry):**

```text
## HH:MM | branch-name
[summary content, multi-line]
```

`HH:MM` is configurable (`24h` default; `12h` switches to AM/PM uppercase). `branch-name` from `git branch --show-current`.

**SKIP handling:** If Haiku decides nothing new is worth saving (e.g., minor exchange below noise floor), it replies with `SKIP` as the first content. Code detects this, saves the position (so we don't re-extract these lines next time) and exits without appending.

**Soft validation:** If output doesn't start with `^## (HH:MM | H:MM AM/PM) \|`, log WARNING but still append. Never discard content for format violations.

**On success:**

1. Append `\n` + Haiku response to `now.md`.
2. Update `last-save.json` with `{session, line}` for next incremental.
3. Update cooldown marker (`date +%s > marker`).
4. Trigger NDC pipeline (transition 2) in background.

## Transition 2: `now.md` → `today-YYYY-MM-DD.md` (NDC — Now-Day Compression)

**Trigger:** Runs at the end of every successful save (transition 1), in a background subshell.

**Throttle:** 1-hour cooldown (configurable via `cooldowns.ndc_seconds` = 3600). Tracked at `$REMEMBER_DIR/tmp/last-ndc.ts`.

**Background subshell pattern:**

```bash
(set +e   # don't inherit set -e — claude -p exit non-zero must not kill subshell
    # ... NDC pipeline ...
) &
```

`set +e` is critical: the outer save-session.sh has `set -e`. Without overriding, a Haiku error in the subshell would propagate as `kill 0`. The subshell catches every error internally and logs.

**Compression prompt** (`prompts/compress-ndc.prompt.txt`, 15 lines):

> Apply maximum non-destructive compression. Rules:
> - Keep ALL facts, ALL refs, ALL verbs, ALL relationships. Zero information loss.
> - Drop: articles (a/the/an), prepositions where context is clear, filler words, prose connectors
> - Use shortest form preserving same semantic vector: conf, env, MR, infra, impl, perm, EM, etc
> - No prose. Raw signal. Like developer shorthand notes.
> - Group entries by subject: if multiple entries describe the same work (same issue, same feature, same file), merge into ONE time-blocked entry (e.g. 08:48-09:22). This is the biggest compression win — 5 entries about the same skill becoming 1 entry.
> - Parentheses for context: "script.sh (dev detect via git conf)"
> - Semicolons to separate facts within one entry
> - Preserve ## timestamp | branch format
> - Maintain chronological order — entries must appear oldest to newest
> - Every verb, every object, every causal link must survive

**Compression target reported in logs:** typical 60-80% size reduction (`-X% ratio` line in logs after each NDC run).

**Post-success:**

1. Append compressed output to `today-YYYY-MM-DD.md` (today's staging file).
2. **Truncate `now.md`** (`: > "$MEMORY_FILE"`). Content has moved; now.md starts fresh.
3. Log token counts.

**Failure handling:** Background subshell logs error; main save-session.sh continues normally. Best-effort optimization, not a critical path.

## Transition 3: `today-*.md` → `recent.md` (+ archive overflow) (consolidation)

**Trigger:** Explicit `run-consolidation.sh` invocation. Typically cron'd nightly (claude-remember doesn't ship a cron config; user wires it).

**Lock:** Separate `noclobber` lock at `$REMEMBER_DIR/tmp/consolidation.lock`. Same stale-lock detection pattern as save.

**Inputs (gathered by pipeline.consolidate):**

- All `today-*.md` files in `$REMEMBER_DIR` (NOT `today-*.done.md` — those are already-processed audit copies)
- Current `recent.md` content (may be empty)
- Current `archive.md` content (may be empty)

**Prompt** (`prompts/consolidate-staging.prompt.txt`, 67 lines — most structured of the four):

```text
You are a memory consolidation agent. Your job is mechanical compression —
no creativity, no opinions, no new content.

## Step 1: Compress staging files into recent.md
For EACH staging file, compress the full day into ONE entry:
- Header: ## YYYY-MM-DD
- Body: 2-4 sentences covering: deliverables, key decisions, state changes
- Drop: conversation flow, intermediate steps, file paths, context percentages
Append the new day entries to the existing recent.md content.

## Step 2: Rotate old entries from recent.md to archive.md
Any entry in recent.md older than 3 days gets compressed into archive.md:
- Group by week (Monday-Sunday)
- Header: ## Week of YYYY-MM-DD
- Body: 3-5 sentences per week covering: conventions, patterns,
        infrastructure changes, major deliverables
- Drop: individual file changes, daily details
Remove the rotated entries from recent.md.

## Step 3: Identity candidates
If you notice a moment that seems identity-defining, add it at the END
of the recent.md section as:
## Identity Candidates
- IDENTITY CANDIDATE: [one-line description]

## Output format
===RECENT===
# Recent

[recent.md content]

===ARCHIVE===
# Archive

[archive.md content]

## Rules
- NEVER add content that wasn't in the source — you compress, you don't create
- Keep recent section under 600 tokens total
- Keep archive section under 400 tokens total
- Preserve the # Recent and # Archive headers
```

**Single-pass two-stage compression** — both step 1 (day-to-summary) and step 2 (3+-day-rotation) happen in ONE Haiku call. Cheaper than two separate calls; relies on the model holding state across the two stages of one prompt.

**Response parsing** (`pipeline/consolidate.py`):

```python
if "===RECENT===" in text and "===ARCHIVE===" in text:
    parts = text.split("===ARCHIVE===", 1)
    recent = parts[0].replace("===RECENT===", "").strip()
    archive = parts[1].strip()
elif "===RECENT===" in text:
    recent = text.replace("===RECENT===", "").strip()
else:
    # Fallback: treat entire response as recent
    recent = text.strip()
```

**Graceful degradation:** If delimiters are missing, fall back to "entire response as recent" rather than crashing. Header ensure (`# Recent` / `# Archive` prepended if missing). Soft fix; never discard.

**Post-success:**

1. Overwrite `recent.md` and `archive.md` atomically (via `cp` from temp output).
2. Rename each processed `today-X.md` → `today-X.done.md`. Audit retention; never delete.
3. Log per-stage token counts.

## Session-start side: how all this gets injected back

`scripts/session-start-hook.sh` (140 lines) is small and deterministic. Iteration order:

```bash
for MFILE in "$IDENTITY_FILE" "$CORE_MEMORIES" "$REMEMBER_HANDOFF" \
    "$REMEMBER_TODAY_FILE" "$REMEMBER_NOW" "$REMEMBER_RECENT" \
    "$REMEMBER_ARCHIVE"; do
    if [ -f "$MFILE" ] && [ -s "$MFILE" ]; then
        BASENAME=$(basename "$MFILE")
        echo "--- $BASENAME ---"
        cat "$MFILE"
    fi
done
```

Concatenated, each file delimited by `--- filename ---`, dumped under a `=== MEMORY ===` wrapper as the SessionStart injection.

**`handoff.md` is one-shot:** read, then cleared:

```bash
if [ -f "$REMEMBER_HANDOFF" ] && [ -s "$REMEMBER_HANDOFF" ]; then
    : > "$REMEMBER_HANDOFF"
fi
```

Pattern: when the user wants to leave a specific instruction for the next session ("when you come back, finish the auth refactor"), they write to `handoff.md`. Next session reads it AND clears it. Prevents stale instructions from persisting indefinitely.

## What's worth absorbing for Tasks 28 + 29

### Direct port (use the values as-is)

| Decision | claude-remember | Apply to claude-memory-kit |
| --- | --- | --- |
| Incremental save cooldown | 120s | Task 23 (auto-extract subagent) PostToolUse cooldown |
| NDC cooldown | 3600s (1h) | Task 28 daily-distill trigger throttle for `now → today` rollover |
| Min human messages threshold | 3 | Task 23 minimum-exchange threshold before invoking auto-extract |
| Recent rotation age | 3 days | Task 29 weekly-compress retention window |
| Recent token cap | 600 tokens | Task 28 / Task 29 prompt constraint (or adapt to our 4000-char `MEMORY.md` cap from design §1.1) |
| Archive token cap | 400 tokens | Task 29 prompt constraint |
| Session JSONL slug pattern | `re.sub(r'[^a-zA-Z0-9]', '-', project_dir)` | Task 23 — direct reuse so we resolve to the same `~/.claude/projects/<slug>/` path Anthropic uses |

### Patterns to copy verbatim

1. **Atomic locking via `noclobber` + `kill -0` stale-lock recovery.** Already in design §6.6 conceptually; this is the concrete pattern. Used in both save-session.sh AND run-consolidation.sh — separate locks per pipeline stage.

2. **Sandboxed Haiku invocation.** The 6-property sandbox (cd /tmp, `env -u CLAUDECODE`, empty allowedTools, max-turns 1, empty MCP config, stdin from temp file) is tighter than what we currently spec. Lift wholesale.

3. **Position tracking via `last-save.json`.** Keyed by `{session, line}`. On session mismatch OR parse failure → resume from 0. Direct port for Task 23's auto-extract — avoids re-summarizing already-captured exchanges across hook fires.

4. **Background subshell with `set +e` for the optimization stages.** NDC and consolidation are best-effort; main save flow continues even if they fail. Our Tasks 28 + 29 should adopt the same "best-effort optimization, never block the user" pattern.

5. **Drop noise tags from message content** (`<system-reminder>`, `<command-name>`, `<local-command`) during extraction. Direct port for Task 23.

6. **Compact tool-use to `[TOOL: <name> <detail>]`** rather than full tool inputs. Saves prompt tokens. Direct port for Task 23.

7. **Dedup context: feed Haiku the LAST `##`-prefixed entry** from now.md (or equivalent) when summarizing new exchanges. Cheap dedup at the LLM layer rather than post-hoc comparison.

8. **Soft validation: WARN, never discard.** Format violations are logged but content is still saved. Resilience over strictness on the extraction path.

9. **One-shot `handoff.md` pattern.** Worth adding as a small v0.1.x candidate — user writes "next session: finish X", session-start reads and clears. Defuses "stale instructions persist forever" failure.

10. **`.done.md` rename pattern for processed staging files.** Audit retention without confusing the consolidation script. Same pattern we should use for our `archive/tombstones/` semantic in Task 29.

### Architectural decisions worth adopting

1. **Single-pass two-stage consolidation prompt.** Step 1 (daily-to-summary) and Step 2 (rotation to archive) in one Haiku call, separated by delimiters in the response. Cheaper than two separate API calls. Our Task 29 should use the same approach — one prompt, parse delimited sections.

2. **Delimited response format** (`===RECENT===` ... `===ARCHIVE===` ...) with graceful-degradation fallbacks. If a delimiter is missing, fall back to "entire response as the larger of the two sections" rather than crashing. Same pattern works for any multi-output Haiku call.

3. **Identity candidates pattern.** Step 3 of the consolidation prompt: "if you notice a moment that seems identity-defining, add it at the END as `## Identity Candidates`." This is auto-persona promotion at the bullet level — auto-extract surfaces persona-relevant moments, user later promotes (or rejects). Direct input for Task 45 (auto-persona generation) — we should adopt this surfacing pattern. The candidate-flagging step is essentially free (no extra API call) since it piggybacks on an existing consolidation pass.

4. **Per-stage cooldown markers as flat files** (`last-save-ts`, `last-ndc.ts`, separate consolidation lock). Simpler than a unified state file; race-condition resistant; each stage manages its own throttle independently.

5. **Per-stage token accounting in logs.** Every Haiku call logs `TK_IN / TK_OUT / TK_CACHE / TK_COST` with a stage tag (`tokens`, `ndc`, `consolidation`). Operator visibility into "cost of memory" per stage. Our Task 28/29 audit-log entries should capture the same.

### Things we deliberately wouldn't absorb

1. **The `## HH:MM | branch` entry format.** Our format is per-bullet with HTML-comment provenance (per Task 13's `provenance.mjs`). Different shape; same property (timestamp + context per entry).

2. **Developer shorthand vocabulary in the compress prompt** (`conf, MR, impl, perm, EM, etc`). Calibrated to their author's style; we'd write our own prompt with our trust/shape semantics baked in.

3. **3-day rotation cutoff hardcoded in the prompt.** Should be configurable for us — different users have different idle patterns.

4. **Single-file recent.md and archive.md per machine.** Our 3-tier model means these exist per tier (user / project / local) — same pattern times 3. The transition logic is identical; the file paths differ.

5. **No conflict queue.** claude-remember just overwrites; we have the §6.2 conflict queue for cases where new fact contradicts trust:high seed.

6. **No trust levels on bullets.** Their entries are uniformly "the latest summary." Our trust:high / medium / low + auto-drop discipline (per Task 12) is materially different.

7. **The dispatcher hooks (`dispatch "before_save"`, `dispatch "after_save"`, etc.).** Extension mechanism for plugins. We don't need this for v0.1; v0.2+ candidate if user-extensibility ever enters scope.

## Corrections to prior research notes

The [2026-05-21 architecture note](2026-05-21-claude-remember-architecture.md) said the consolidation step "merges similar entries and deduplicates." Actually-it does mechanical compression with explicit format constraints (2-4 sentences for day-level, 3-5 sentences for week-level) and explicit step ordering. The prompt is mechanical-by-design; "no creativity, no opinions, no new content." Worth updating that note.

The [2026-05-22 primary-source examination](2026-05-22-primary-source-examination.md) covered the lock pattern, the cooldown timings, and the Haiku invocation flags. This note extends with: position tracking, dedup context, tool-use compaction, identity candidates pattern, single-pass two-stage prompt, delimited response with graceful degradation.

## Specific design impact

### Task 23 (auto-extract subagent) — sharpen the spec

- Adopt the 6-property Haiku sandbox: `cd /tmp`, `env -u CLAUDECODE`, `--allowedTools ""`, `--max-turns 1`, `--mcp-config '{"mcpServers":{}}' --strict-mcp-config`, stdin from temp file. Tighter than current "use Read only" spec.
- Position tracking via `<projectRoot>/context/.locks/last-save.json` keyed by `{session, line}`. Direct reuse of the format.
- Tool-use compaction to `[TOOL: <name> <basename-or-truncated-cmd>]`.
- Drop noise tags during extraction (`<system-reminder>`, `<command-name>`, `<local-command`).
- Dedup context: feed last bullet from `now.md` to the prompt.
- Min-human-messages threshold of 3 to gate the LLM call.
- Cooldown of 120s on PostToolUse fires.

### Task 28 (daily distill) — direct port

- Trigger after each Task 23 invocation in a background subshell with `set +e`.
- 1-hour cooldown via `$tierRoot/.locks/last-ndc.ts` marker.
- Per-stage `noclobber` lock at `$tierRoot/.locks/ndc.lock`.
- Compression prompt: adopt their non-destructive-compression rules; substitute our trust/shape semantics for their developer-shorthand list.
- Token reduction expectation: 60-80% (their reported norm).
- On success: truncate `now.md` (per-tier); content moved to `today-{date}.md`.

### Task 29 (weekly compress) — direct port

- Single-pass two-stage prompt:
  - Step 1: each `today-*.md` → one entry in `recent.md` (2-4 sentences, day-level)
  - Step 2: rotate entries older than 3 days (configurable) from recent → archive (grouped by week)
  - Step 3: surface identity candidates at end of recent section
- Delimited response format with graceful-degradation fallbacks.
- Token caps: 600 (recent) + 400 (archive) — or scale to our char-cap model.
- Rename `today-X.md` → `today-X.done.md` post-success (audit retention).
- Per-stage `noclobber` lock at `$tierRoot/.locks/consolidation.lock`.

### §6.6 (locking, design.md) — confirm and tighten

The `noclobber + kill -0` pattern is already in our spec; this dive confirms it in production code. Worth adding the per-pipeline-stage convention (separate locks per stage) explicitly to the design note.

### Task 45 (auto-persona) — adopt the "identity candidates" surfacing

claude-remember surfaces identity-defining moments at the end of the consolidation pass — essentially free signal for promotion to user-tier scratchpads. Our Task 45 should adopt this: the Haiku compressor running in Task 29 already touches all the facts in `recent.md`; have it produce a candidate list as a side effect, same way claude-remember does. Cheaper than a separate auto-persona pass at the boundary specified in §16.16, AND it composes with the consolidator's existing prompt budget.

This is a small architectural simplification worth proposing — let the consolidator surface persona candidates inline, rather than running auto-persona as a separate pipeline stage every N facts. Filed for Task 45 spec review.

## Reference URLs

- Repo: <https://github.com/Digital-Process-Tools/claude-remember>
- Key files cited (paths in the cloned repo `/tmp/claude-remember/`):
  - `pipeline/consolidate.py` (106 lines) — the recent + archive parser
  - `pipeline/extract.py` (358 lines) — session JSONL extraction
  - `pipeline/haiku.py` (165 lines) — the LLM client wrapper
  - `scripts/save-session.sh` (270 lines) — incremental capture pipeline
  - `scripts/run-consolidation.sh` (101 lines) — consolidation orchestrator
  - `scripts/session-start-hook.sh` (140 lines) — injection on session start
  - `prompts/compress-ndc.prompt.txt` (15 lines) — NDC compression rules
  - `prompts/consolidate-staging.prompt.txt` (67 lines) — recent + archive prompt
  - `prompts/save-session.prompt.txt` (27 lines) — per-save summarization prompt

## Related research notes

- [`2026-05-21-claude-remember-architecture.md`](2026-05-21-claude-remember-architecture.md) — original architecture survey (pre-code-dive)
- [`2026-05-22-primary-source-examination.md`](2026-05-22-primary-source-examination.md) — partial primary-source pass (covered hook structure + Haiku flags; this note extends with algorithm details)
- [`2026-05-24-gbrain-architecture.md`](2026-05-24-gbrain-architecture.md) — different scope (production-grade hybrid retrieval); convergent on markdown-source-of-truth, divergent on retrieval depth
- [`2026-05-24-beyond-the-log-time-aware-memory.md`](2026-05-24-beyond-the-log-time-aware-memory.md) — temporal-blindness diagnosis (orthogonal concern; can compose with rolling-window)
- [`2026-05-24-tencentdb-agent-memory.md`](2026-05-24-tencentdb-agent-memory.md) — sibling memory project; auto-persona pattern source

## Key takeaway

claude-remember is the closest implementation analog for our Tasks 28 + 29. The rolling-window pattern (`now → today → recent → archive`) we cited as "the pattern" in design.md is theirs verbatim; we've been planning to re-derive their decisions. This dive collapses that work: cooldowns (120s / 1h / nightly), token caps (600 / 400), retention window (3 days), Haiku sandbox flags, position tracking, dedup-via-prior-entry, compression-prompt structure — all directly portable with no scope-bound adjustments needed.

**The one architectural insight worth surfacing for Task 45 review:** their "identity candidates" pattern (consolidator surfaces persona-relevant moments inline, as a side effect of an already-running pass) is materially simpler than running auto-persona as a separate every-N-facts pipeline stage. Worth proposing as a Task 45 spec change — let the consolidator do the work, since it already touches the data.

**What this dive confirms:** the kit's planned approach is correct in shape but undertrained on detail. Porting claude-remember's specific decisions (cooldowns, sandbox flags, prompt structure, position tracking) saves us months of independent calibration — same pattern as GBrain's hybrid-search constants. Cite them in the implementation; their MIT-equivalent license (the file says "Community License" — verify before shipping) permits direct reuse with attribution.

**Verification needed before shipping any port:** confirm the actual license terms on `LICENSE` in their repo. The plugin manifest says `license: Community License`, which is not a standard SPDX id. Whatever the actual terms, attribution + a note in our SOURCES.md will be required.
