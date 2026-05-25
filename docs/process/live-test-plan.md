---
process: live-test-plan
status: active
since: 2026-05-26
related_adrs: []
tags:
  - live-test
  - working-product-validation
  - methodology
---

# Process: Live-test plan for working-product validation

Unit tests pin the kit's boundary contracts (`injectContext()` shape, `appendScratchpadBullet()` provenance, etc.). They do **not** exercise Claude Code's plugin loader, the real `claude --print` binary, OS-level child-process semantics, or Anthropic's actual Haiku model. Live tests do.

This document is the durable harness for future live-test rounds. The 7 scenarios + isolation recipe + observation discipline + iteration loop captured here are the same pattern that surfaced PR-22's plugin-layout bug, PR-25's user-tier truncation, and the spawn-layer Windows bug — none of which any unit test could have caught.

## When to run live tests

| Trigger | Cadence |
| --- | --- |
| After every Layer-completion checkpoint (currently Checkpoints 16, 27, 32, 36, 42, 44) | Mandatory |
| After any task that ships a hook handler, subprocess spawn, or plugin manifest change | Mandatory |
| Mid-layer when the architecture-first build needs validation that "structurally correct" matches "actually correct" | Discretionary |
| Before any `cmk release` cycle | Mandatory |

Unit tests verify code; live tests verify the kit. Both are non-negotiable at the layer-completion gate.

## The 7 scenarios (current canonical set)

Each scenario is described by: what it tests, expected outcome, how to verify. Future PRs add scenarios; existing scenarios get amended as the architecture grows. The journey-log entries under `docs/journey/2026-05-26-live-test-findings*.md` are the historical record of each run.

### Scenario 1 — basic capture flow

User dictates 3-5 durable facts in a prompt that does NOT engineer for restatement. Assistant responds tersely. Auto-extract spawns; Haiku identifies user-origin facts; trust-routing lands them in MEMORY.md.

**Verify**: extract.log entry with `success:true`, observation_count matches the user-stated fact count; MEMORY.md Active Threads contains the bullets with auto-extract provenance.

### Scenario 2 — SessionStart injection from session-1 captures

Fresh `claude --print` invocation in the same sandbox. Ask "what do you know about my preferences? Don't read any files." Assistant should reference the session-1 captures.

**Verify**: assistant response cites the session-1 facts; assistant references the kit's seed SOUL.md content if applicable; no file-read tool calls in the stream.

**This is the load-bearing test.** If session 1 → session 2 doesn't carry context that Claude actually USES, the kit's value prop is broken regardless of what the unit tests say.

### Scenario 3 — `<retain>` force-save

User prompt with `<retain>specific fact ≥20 chars</retain>` (per MIN_RETAIN_MATCH_CHARS = 20). The retain segment force-promotes a candidate to trust:high regardless of Haiku's judgment.

**Verify**: the retain content appears in MEMORY.md at trust:high; the retainOverride flag is set on the in-memory result struct.

### Scenario 4 — cap-overflow truncation

Bulk-fill the sandbox's scratchpads (MEMORY.md + SOUL.md + USER.md + HABITS.md + LESSONS.md) to total well above the snapshot cap. Trigger SessionStart and observe per-tier truncation.

**Verify**: truncation.log NDJSON entries with `tier_truncated_to_budget` event type; the injected snapshot ≤ snapshot cap; the drop order matches design §7.1.1 (sections from end of each tier; tier-wholesale drop only on configuration error).

### Scenario 5 — concurrent hook fire (lock contention)

Spawn two parallel `claude --print` sessions from the same sandbox. Both Stop hooks fire ~simultaneously; both auto-extract children try to acquire `context/.locks/auto-extract.lock`.

**Verify**: extract.log shows exactly one successful run + one skipped-due-to-concurrent run; only one bullet lands in MEMORY.md; the lock file is cleanly released after both.

**Windows live caveat**: bash `$!` ≠ Windows OS PID, AND detached node sleepers don't reliably survive parent exit on Windows. Live reproduction of this scenario is unreliable on Windows specifically; unit tests are authoritative for the contention code path (3 dedicated cases in `cli-auto-extract.test.js`). Skipping live verification on Windows is acceptable as long as the unit-test coverage is asserted. POSIX runners should still exercise this live.

### Scenario 6 — failure modes

Force a Haiku failure by overriding `CMK_AUTO_EXTRACT_PATH` to a stub that constructs `HaikuViaAnthropicApi({ claudeBin: '/nonexistent.cmd' })`. Run a normal prompt.

**Verify**: extract.log records `success:false` + `error_category` populated; the parent `claude --print` session completes normally (the user gets their response); no orphaned lock files left behind.

### Scenario 7 — wrapper timing (NFR-1 envelope)

Measure wall-clock from `claude --print` invocation start to first stdout response. Compare against NFR-1's 500 ms in-process budget AND the hosting-overhead envelope (bash + node + module-loading cold start).

**Verify**: in-process timing under 500 ms per NFR-1 unit test; total wall-clock overhead in the documented 1-2.5 second range on Windows (varies); 30-second hook timeout always cleanly absorbs.

## Isolation recipe (no global install)

Set up an ephemeral sandbox in `/tmp/cmk-livetest`:

```bash
SANDBOX=/tmp/cmk-livetest
rm -rf "$SANDBOX" /tmp/cmk-livetest-user
mkdir -p "$SANDBOX"
cd "$SANDBOX"
git init -q
MEMORY_KIT_USER_DIR=/tmp/cmk-livetest-user \
  node <repo>/packages/cli/bin/cmk.mjs install
```

Then invoke Claude Code with the plugin loaded for THIS session only:

```bash
cd /tmp/cmk-livetest
echo "<user prompt>" | \
MEMORY_KIT_USER_DIR=/tmp/cmk-livetest-user \
CLAUDE_CONFIG_DIR=/tmp/cmk-livetest-claude-config \
claude --print \
  --plugin-dir <repo>/plugin \
  --model claude-haiku-4-5-20251001 \
  --max-turns 2 \
  --verbose --output-format stream-json --include-hook-events
```

The three isolation flags (in priority order):

| Flag | Purpose |
| --- | --- |
| `--plugin-dir <repo>/plugin` | Loads the kit's plugin **for this session only**. Does NOT install globally. |
| `MEMORY_KIT_USER_DIR=/tmp/...` | Redirects the kit's user-tier scaffold to an ephemeral location instead of `~/.claude-memory-kit/`. |
| `CLAUDE_CONFIG_DIR=/tmp/...` | (Optional) Isolates Claude Code's own config writes. Set only if you don't want session transcripts landing in your normal `~/.claude/` history. Skip if you need the host's OAuth credentials. |

The `--verbose --output-format stream-json --include-hook-events` triplet is essential for diagnosing hook lifecycle — without it, hooks fire silently and you can't see which ones executed or what they emitted.

## Observation discipline

When running scenarios, **be specific**. The valuable findings are:

> "Claude ignored the injected context for 3 turns until I asked about it directly"

Not:

> "Context injection seemed weak"

And:

> "Haiku extracted a question instead of a fact: candidate text 'is pnpm OK?' tagged TRUST_HIGH assistant"

Not:

> "Extraction was off"

Document **everything that surprised you** — that's the most valuable category. The kit's architecture is built from specs; the live test is where the specs meet reality. Surprises = specs that didn't fully capture reality.

For each scenario, capture in the live-test journey log:

- stdout from `claude --print` (the model's response)
- file system diff before/after the scenario
- contents of `.locks/audit.log`, `.locks/truncation.log`, `.locks/shadowed_by.log` (if present)
- contents of MEMORY.md / queues/review.md / scratchpads as relevant
- Haiku cost metrics from extract.log (`duration_ms`)
- timing measurements where applicable

## Iteration loop

If something's broken, the discipline is:

1. **Fix it** (small follow-up commit on a `fix-livetest-findings-N` branch, **NOT** mixed with the main build plan)
2. **Retest** (rebuild sandbox, re-run the affected scenario, capture evidence)
3. **Document** (journey-log entry per finding with the diagnostic process + the fix + the meta-lesson)

**Don't try to plan the whole investigation up front.** Let the findings drive next steps. Some findings need a separate journey log + separate PR; some are small enough to fold into the in-progress one. The shape emerges from the diagnostic process.

## What to bring back to the user

After each live-test round, surface to the user:

1. **Per-scenario pass/fail/partial** — with the journey-log entry as the load-bearing detail
2. **Any unexpected findings** — anything not predicted by the specs (architecture-first projects need these surfaced explicitly since they're the recoupment of the foundation work)
3. **Recommendations for next-task spec changes** — "Task N's spec should clarify X based on what scenario M revealed"
4. **Open questions** — "we couldn't verify Z on Windows; needs POSIX runner"

The expected cadence: a live-test round at a Layer-completion checkpoint is 1-3 hours of test execution + 1-2 hours of write-up. Don't compress the write-up — it's where the meta-lessons live, and meta-lessons compound across the v0.1 build.

## Historical record

- **2026-05-26 round 1** (scenarios 1-2, PR-22) — surfaced plugin-layout path mismatch + Windows spawn bug. Journey: [docs/journey/2026-05-26-live-test-findings.md](../journey/2026-05-26-live-test-findings.md).
- **2026-05-26 round 2** (scenario 1 with realistic dictation, PR-23) — surfaced auto-extract-reads-assistant-only architectural finding; fixed bi-turn extraction. Journey: same file (later sections).
- **2026-05-26 round 3** (scenarios 3-7, PR-24) — surfaced default-install user-tier truncation; 7 scenarios documented. Journey: [docs/journey/2026-05-26-live-test-findings-scenarios-3-7.md](../journey/2026-05-26-live-test-findings-scenarios-3-7.md).
- **2026-05-26 round 4** (post-PR-25, embedded in PR-25 verification) — user-tier seed bullets now visible in default install. Journey: [docs/journey/2026-05-26-user-tier-cap-fix.md](../journey/2026-05-26-user-tier-cap-fix.md).

Each round's findings informed the next layer's spec. Pattern: round N's surprises → round N+1's tests.
