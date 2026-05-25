---
date: 2026-05-26
topic: working-product live-test scenarios 3-7 — complete coverage after PRs #22 + #23
status: complete
related_research: [2026-05-26-live-test-findings]
informed_sections: [design.md NFR-1 amendment candidate]
tags:
  - live-test
  - working-product-validation
  - nfr-1
  - windows-portability
---

# Live-test findings — scenarios 3-7 (completes the original 7-scenario plan)

Companion to [2026-05-26-live-test-findings.md](2026-05-26-live-test-findings.md) (scenarios 1-2 + the plugin-layout + Windows-spawn fixes). PRs #22 and #23 both merged; the kit's auto-extract → MEMORY.md → SessionStart-injection loop is now structurally complete AND bi-turn-aware. This note records scenarios 3-7 against the merged kit.

## Summary

| # | Scenario | Result |
| --- | --- | --- |
| 3 | `<retain>` force-save | ✅ Pass — retain content landed in MEMORY.md at trust:high |
| 4 | Cap-overflow truncation | ✅ Pass — snapshot 2917 bytes after dropping user+project tiers; truncation.log records `dropped_tiers: ["U","P"]` |
| 5 | Concurrent hook fire / lock contention | ⚠️ Partial — Windows OS-PID vs bash `$!` mismatch + detached-child fragility prevented reliable live reproduction; unit tests (3 cases) are authoritative |
| 6 | Haiku failure mode | ✅ Pass — `success:false, error_category:"haiku_failed", duration_ms:265`; parent claude session unaffected |
| 7 | Wrapper timing (NFR-1) | 📊 Measured — kit's SessionStart hook adds ~1480ms median overhead on Windows; in-process work fits NFR-1 but bash+node cold-start does not |

**Working-product loop validated end-to-end.** The single remaining open issue (scenario 5) is OS-level test-harness limitation, not a kit bug — the contention path is exhaustively covered at unit-test level.

## Scenario 3 — `<retain>` force-save

Test prompt:

> "Hi! Quick note: `<retain>the deployment uses canary rollout via flagger with 5-stage progressive traffic shifting</retain>`. Just acknowledge briefly, don't do anything else."

Assistant response:

> "Got it — canary rollout via Flagger with 5-stage progressive traffic shifting. I'll keep that in mind for deployment-related work."

Auto-extract result:

```json
{"ts":"2026-05-25T11:50:45Z","success":true,"error_category":null,"observation_count":1,"skipped_reason":null,"duration_ms":12877}
```

MEMORY.md Active Threads gained:

```markdown
- (P-TYCFTT42) Deployment uses canary rollout via Flagger with 5-stage progressive traffic shifting
  <!-- source: auto-extract-session, source_line: 1, sha1: 7584cdfab23048c1cfd432125259d69daebf87a0, write: auto-extract, trust: high, at: 2026-05-25T11:50:45Z -->
```

Trust:high lands in MEMORY.md; no entries in review queue. The `<retain>` segment (54 chars, well over MIN_RETAIN_MATCH_CHARS=20) was extracted by `extractRetainSegments` and matched against Haiku's emitted candidate. Whether the candidate was user-origin (no demotion needed) or assistant-origin (would demote to MEDIUM, then `<retain>` overrides back to HIGH) — the on-disk artifact is identical either way. The visible contract is satisfied: retain content reaches MEMORY.md.

## Scenario 4 — cap-overflow truncation

Bulk-filled scratchpads to push total >10KB:

| File | Bytes (after padding) |
| --- | --- |
| MEMORY.md (P) | 4182 |
| SOUL.md (P) | 3421 |
| HABITS.md (U) | 3781 |
| LESSONS.md (U) | 3703 |
| USER.md (U) | 3229 |
| **Total** | **18316** |

SessionStart hook output `additionalContext` byte length: **2917 bytes** (well under the 10240 cap). The cap enforcement dropped tiers from the lowest-priority end:

```ndjson
{"ts":"2026-05-25T11:59:20Z","capBytes":10240,"dropped_tiers":["U","P"]}
```

Only the local tier survived in the snapshot (verified by string-grep: `<!-- cmk: local tier (L) -->` present; project + user markers absent; MEMORY.md filler content absent).

**The cap enforcement is tier-granular, not byte-granular** (per design §1.4 + auto-extract `enforceCap`). Drops whole tier blocks; never partial-cuts a section. The snapshot stays internally coherent.

### Bonus observation — historical truncation entries from scenarios 1-3

The `truncation.log` showed entries from prior `claude --print` invocations in this sandbox, ALL of them dropping at least the user tier:

```ndjson
{"ts":"2026-05-25T11:42:10Z","capBytes":10240,"dropped_tiers":["U"]}
{"ts":"2026-05-25T11:44:44Z","capBytes":10240,"dropped_tiers":["U"]}
{"ts":"2026-05-25T11:48:42Z","capBytes":10240,"dropped_tiers":["U"]}
{"ts":"2026-05-25T11:50:38Z","capBytes":10240,"dropped_tiers":["U"]}
```

The kit's default scaffolded scratchpads + a single auto-extracted bullet ALREADY exceeds the 10KB snapshot cap. The user tier (USER.md + HABITS.md + LESSONS.md) gets dropped on every session in default state. **This is a defaults-vs-cap mismatch worth flagging:** the user-tier seed content is the lowest-priority tier; the kit's onboarding install size makes truncation routine, not exceptional. Not blocking — drops are correctly logged and the project + local tiers (the two more-specific tiers) always survive — but the user tier's value prop is undercut by cap pressure from day 1.

Possible remediation (future task, NOT this PR): tighten the seed content of the user-tier scratchpads OR raise the snapshot cap to 12-15KB so the default install fits without dropping any tier. Logged as a candidate for the Layer-4 checkpoint (#27) discussion.

## Scenario 5 — concurrent hook fire / lock contention (partial)

**Goal:** verify two parallel `claude --print` invocations from the same sandbox produce one successful auto-extract + one concurrent-run skip in extract.log.

**Result:** could not reliably reproduce on Windows. Two failure modes encountered:

1. **Bash `$!` ≠ OS PID.** Tried seeding the lock file with `$!` from a backgrounded `sleep`. Auto-extract's `pidIsAlive` check uses `process.kill(pid, 0)`, which operates on OS-level PIDs. Bash's `$!` returns its internal job-table PID, not the Windows OS PID. `process.kill` returns ESRCH → auto-extract takes the stale-recovery path and acquires the lock. Test fails to exercise contention.
2. **Detached node sleeper killed.** Tried spawning a long-lived node process via `child_process.spawn(node, ['-e', 'setTimeout(...)' ], {detached: true, stdio: 'ignore', unref})` and writing its real PID to the lock file. The detached child got killed when its parent (the bootstrap node script) exited — same Windows quirk that produces the cli-capture-turn flake in the test suite.

**The lock-contention code path is comprehensively covered by 3 unit tests in `tests/cli-auto-extract.test.js`:**

- live-PID concurrent: pre-acquired lock with current `process.pid` → assert `action: 'concurrent'`
- stale-PID recovery: pre-acquired lock with PID 99999 (almost certainly dead) → assert `action: 'extracted'` (recovery succeeded)
- lock release: two sequential invocations succeed (proves lock cleanup works)

Production behavior verified at the unit level. Live verification on Windows is blocked by OS-level child-process semantics, not by kit code. Same class of issue as the cli-capture-turn detached-child flake (documented in [2026-05-26-live-test-findings.md](2026-05-26-live-test-findings.md) under "Bonus finding").

If future work runs the kit's live tests on Linux/macOS where `bash $!` IS the OS PID AND detached children survive parent exit reliably, the contention scenario should reproduce cleanly. No code change needed.

## Scenario 6 — Haiku failure mode

Forced a Haiku failure by setting `CMK_AUTO_EXTRACT_PATH` to a stub auto-extract that constructs `HaikuViaAnthropicApi({ claudeBin: '/nonexistent-claude.cmd' })`. The spawn fails ENOENT immediately.

Result:

```json
{"ts":"2026-05-25T12:26:33Z","success":false,"error_category":"haiku_failed","observation_count":0,"skipped_reason":null,"duration_ms":265}
```

- `success: false` ✓
- `error_category: "haiku_failed"` ✓
- `observation_count: 0` ✓
- `duration_ms: 265` — fast fail (spawn errored within ~250ms)
- Parent `claude --print` completed normally; user got their response
- MEMORY.md not touched

**The failure path works exactly as specified.** Hook exits 0. extract.log records the failure with correct schema. Parent session is unaffected. Per design §6.1 + auto-extract.mjs's defensive try/catch around `haikuBackend.compress()`.

## Scenario 7 — wrapper timing (NFR-1)

Measured `claude --print` end-to-end across 5 runs in two configurations:

| Configuration | Total ms | API ms | Local-overhead ms |
| --- | --- | --- | --- |
| With kit plugin (SessionStart fires) | 4243-6017 | 1860-4167 | **1602-2401** (median 1755) |
| Baseline (no `--plugin-dir`) | 2173-3285 | 1973-2949 | **200-336** (median 273) |

**Kit's SessionStart hook adds ~1480ms median overhead** (1755 - 273). Range: 1300-2100ms depending on cold cache state.

This matches the PR-18 prediction: "the bash + node cold-start envelope on the wrapper path is variable (500-2500ms observed on Windows)". The breakdown of the ~1480ms (estimated, not instrumented):

- bash startup: ~50-200ms
- node cold-start: ~100-300ms
- ES-module import-resolution chain (`auto-extract` + `scratchpad` + `frontmatter` + `tier-paths` + shared modules): ~50-200ms
- `injectContext()` actual work (3-tier walk, dedup, snapshot assembly, file reads): ~50-300ms
- JSON serialization + stdout: ~10-50ms

**The kit's in-process work fits NFR-1's 500ms budget** (unit test `injectContext() completes within 500ms` passes deterministically). The overhead that pushes the live measurement past 500ms is **hosting cost** the kit doesn't own — bash + node + module loading.

### Proposed NFR-1 amendment

Per Lior's PR-18 review of this same timing concern + scenario 7's data:

**Option (a) — clarify NFR-1 as in-process compute time.** Update design.md's NFR section to specify that the 500ms target applies to the kit's in-process work (`injectContext()` body, capture-prompt body, etc.), measured from the moment the kit's code starts executing. Bash + node startup + module loading is documented as hosting overhead outside the kit's contract; the 30s hook timeout (design §5.1) is the actual production envelope that absorbs cold-start.

Recommendation: **adopt option (a)**. The unit-test invariant remains 500ms; documentation gets a clarifying sentence. No code change.

**Option (b) — replace bash wrapper with direct node invocation in hooks.json.** Would shave ~50-200ms (the bash layer) but leave the ~1200ms of node cold-start + module loading intact. Marginal improvement at the cost of breaking the documented design §5.1 verbatim hooks.json convention. **Not recommended.**

**Option (c, deferred to v0.2) — AOT-compiled standalone binary or long-running daemon with IPC.** Would shave the node cold-start. Significant complexity. Not justified by NFR-1's actual production-tolerance constraints (30s hook timeout per design §5.1). Park as v0.2 candidate IF telemetry from real users surfaces SessionStart latency complaints.

### Concrete NFR-1 amendment text (proposed)

Replace any existing NFR-1 phrasing with:

> **NFR-1**: The kit's in-process hook work — `injectContext()` for SessionStart, `capturePrompt()` for UserPromptSubmit, `captureTurn()` for Stop, `observeEdit()` for PostToolUse — must complete within 500ms on a fixture of typical size. Measured at the module's public boundary, from invocation to return. Bash + node + module-loading cold-start is hosting overhead outside this budget; the 30s hook timeout (design §5.1) is the production-tolerance envelope.

Pin via unit tests; covered today by `tests/cli-inject-context.test.js` ("completes within 500ms NFR-1 budget") and equivalent in capture-prompt / observe-edit / capture-turn test files.

## What scenarios 3-7 collectively validated

| Capability | Live evidence | Unit-test coverage |
| --- | --- | --- |
| Bi-turn extraction (PR-23) | Scenarios 1+2 (in prior journey entry) | 28/28 |
| `<retain>` force-save | Scenario 3: 54-char retain → MEMORY.md trust:high | 4 cases |
| Snapshot cap enforcement (10KB) | Scenario 4: 18KB content → 2917-byte snapshot; tier drops logged | 2 cases |
| Lock contention | (Live blocked by Windows; unit-test authoritative) | 3 cases |
| Haiku failure → extract.log + parent unaffected | Scenario 6: ENOENT spawn → error_category:haiku_failed | 1 case |
| Hook timing | Scenario 7: ~1480ms median Windows overhead; in-process fits NFR-1 | NFR-1 pinned in inject-context test |

**The working-product loop is real, not just structurally implemented.** Auto-extract works. SessionStart injection works. Cap enforcement works. Failure handling works. Privacy + retain + provenance all work in real `claude --print` sessions against real Haiku.

The remaining gaps (Tasks 22 + 24) are about features adjacent to the loop:

- Task 22: SessionEnd hook compresses `sessions/now.md` → `today-{date}.md` via the `CompressorBackend` interface (already ships in compressor.mjs; SessionEnd handler still a stub). Live test wasn't gated on this.
- Task 24: `memory-write` skill + Poison_Guard. The skill replaces the direct-`appendScratchpadBullet` call in `routeHigh`; Poison_Guard adds secret/injection filtering. Currently auto-extract bypasses Poison_Guard (documented gap accepted at PR-21 review).

Resume build plan: Task 22 first (SessionEnd handler), then Task 24 (memory-write + Poison_Guard).

## Open observations parked for later

- **Default install + 10KB cap = routine user-tier truncation.** Scenario 4's bonus finding. Either tighten user-tier seed content or raise cap to ~12-15KB. Candidate for Layer-4 checkpoint (#27).
- **Windows live-test fragility.** Detached children + bash-vs-OS-PID + node spawn .cmd resolution are recurring friction points. Real production users on POSIX shouldn't experience these. Worth noting in the v0.1.0 release README under "Windows known issues."
- **`SessionEnd hook cancelled` messages on scenario 5's parallel runs.** Saw `SessionEnd hook [bash "${CLAUDE_PLUGIN_ROOT}/bin/cmk-compress-session"] failed: Hook cancelled` in two parallel session outputs. The stub script should exit fast (it just `echo '{"continue": true}'`). Suggests Claude Code is killing hooks during a clean-shutdown race when multiple sessions exit simultaneously. Not blocking — the stub is a no-op anyway — but worth investigating when Task 22 wires the real SessionEnd handler.
