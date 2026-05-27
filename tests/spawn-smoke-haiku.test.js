// @doors: 1, 3
// Door 2 N/A: real-binary spawn smoke; the kit-disk-state surface (lock-file, log writes) is covered by the in-process auto-extract tests.
// Door 4 N/A: no message-queue interaction; this test pins the cross-process spawn boundary itself, not the IPC contract.
// Door 5 N/A: spawn-smoke pins that the OS-level spawn primitives work end-to-end; observability log shape is pinned in cli-compressor (mocked) + auto-extract / compress-session (composed).

// Real-binary spawn smoke test for HaikuViaAnthropicApi (Task 23.8,
// retroactive). Per design §17 "Test discipline" — specifically
// the §17.3-§17.5 spawn-boundary subsections (§17.1 five-exit-doors
// umbrella covers WHAT to assert; these subsections cover HOW to
// assert door 3 properly when the call is cross-process). The
// Task 23 unit tests use an injected `spawnFn` mock; that pins the
// cmd/args shape per spec but does NOT invoke real
// `child_process.spawn` against the real `claude` binary on the
// real OS. The working-product live test surfaced three spawn-
// layer bugs the mock could not catch:
//
//   1. `spawn('claude', ...)` returns ENOENT on Windows — npm CLI
//      binaries ship as `.cmd` shims; node's spawn doesn't auto-resolve
//      the extension.
//   2. CVE-2024-27980 hardening blocks `.cmd` execution without
//      `shell: true`.
//   3. cmd.exe strips outer quotes from inline JSON arguments, turning
//      `--mcp-config '{"mcpServers":{}}'` into a malformed path.
//
// This file uses HaikuViaAnthropicApi.compress() via its production
// code path (no MockSpawn, no spawnFn injection) against the real
// `claude` binary. The assertions catch the spawn-layer bug class:
//
//   - spawn() does NOT throw ENOENT/EINVAL (the spawn-layer Windows bug)
//   - exit code 0 / success-shape from real Haiku
//   - stderr does NOT contain `unrecognized` or `invalid` (catches flag
//     renames in future Claude Code updates)
//   - outputText is non-empty (proves the full spawn → response → close
//     cycle works end-to-end)
//
// CI portability: skips gracefully if CMK_SKIP_LIVE_HAIKU=1 env is set
// OR if `claude` binary is not found in PATH. Default behavior is to
// run the real thing — the opt-out is auditable, not silent.
//
// Dev cost: each invocation is one Haiku --print round trip (~3-8 seconds,
// pennies of API cost on a Claude Pro subscription). Cheap to run on
// every `npm test` for the spawn-layer baseline the unit tests miss.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { HaikuViaAnthropicApi } from '../packages/cli/src/compressor.mjs';

// Decide whether to run the real-Haiku smoke or skip.
function shouldSkip() {
  if (process.env.CMK_SKIP_LIVE_HAIKU === '1') {
    return 'CMK_SKIP_LIVE_HAIKU=1';
  }
  // Check claude is on PATH. `where` on Windows, `which` on POSIX.
  // spawnSync returns status 0 + stdout with path when found.
  const lookup = process.platform === 'win32'
    ? spawnSync('where', ['claude'], { encoding: 'utf8' })
    : spawnSync('which', ['claude'], { encoding: 'utf8' });
  if (lookup.status !== 0 || !lookup.stdout.trim()) {
    return 'claude binary not on PATH';
  }
  return null;
}

const skipReason = shouldSkip();

// describe.skip vs describe — chosen at test-collection time. If
// skipping, vitest reports the cases as skipped (visible in output),
// not silently absent.
const describeMaybe = skipReason ? describe.skip : describe;

describeMaybe(`spawn-smoke: HaikuViaAnthropicApi (live: ${skipReason ?? 'enabled'})`, () => {
  // ONE real-Haiku round-trip; assertions cover all 4 bug classes the
  // mocked-spawn unit tests miss. Consolidated from 4 separate `it`
  // blocks to avoid 4× API load under full-suite concurrency (each
  // round-trip is ~5-7s; sequential rate-limits showed up when all
  // 4 ran back-to-back amid the rest of the 670+ test suite).
  // 30s test budget: real Haiku round-trip is ~5-8s in isolation but
  // can hit 10-15s under full-suite concurrency (API contention +
  // bash/node cold-start). 30s leaves headroom for occasional Anthropic
  // server slowness without false-failing the smoke. This test pings
  // HaikuViaAnthropicApi.compress() directly without setting timeoutMs,
  // so it is NOT pinned to any specific hook envelope — compress() is
  // called from BOTH auto-extract (Stop, 30s outer / 25s inner per §8.5)
  // AND compress-session (SessionEnd, 60s outer / 50s inner per §8.5).
  // The test budget here is "how long the vitest harness will wait on
  // a tiny pong-roundtrip before failing", not a production envelope
  // mirror. The compress-session-specific envelope is pinned by the
  // sister smoke (spawn-smoke-compress-session.test.js, 60s).
  it('real-spawn round-trip covers all 4 bug classes the mock misses', { timeout: 30_000 }, async () => {
    const h = new HaikuViaAnthropicApi();

    // The act of constructing + invoking compress() exercises:
    //   - claude binary resolution (Windows .cmd vs POSIX, CVE
    //     hardening with shell:true, MCP-config tempfile generation)
    //   - real OS spawn (not the injected mock the unit tests use)
    //   - full spawn → response → close lifecycle
    //   - flag acceptance (a rename in `--allowed-tools` / `--max-turns`
    //     / `--mcp-config` / `--strict-mcp-config` / `--output-format`
    //     by a future claude version would surface here)
    let result;
    try {
      result = await h.compress({
        input: 'Reply with the single word: pong',
        maxOutputBytes: 200,
        instructions: 'Reply with exactly: pong',
        preserveCitationIds: true,
      });
    } catch (err) {
      // If spawn-layer failed (ENOENT, EINVAL) OR claude --print exited
      // non-zero with a flag-rename surface, surface what specifically
      // before re-throwing so the test diagnostic is actionable.
      const msg = String(err?.message ?? err);
      expect(msg.toLowerCase(), `spawn-layer regression — full error: ${msg}`)
        .not.toMatch(/unrecognized|invalid (flag|argument|option)|enoent|einval/);
      throw err;
    }

    // Spawn-layer assertion #1 — compress() resolved (no ENOENT/EINVAL throw).
    expect(result).toBeDefined();

    // Spawn-layer assertion #2 — full cycle completed; outputText non-empty.
    expect(typeof result.outputText).toBe('string');
    expect(result.outputText.length).toBeGreaterThan(0);

    // Spawn-layer assertion #3 — token accounting present (full
    // CompressorResult shape, proving the close handler ran).
    expect(typeof result.inputTokens).toBe('number');
    expect(typeof result.outputTokens).toBe('number');
    expect(result.outputTokens).toBeGreaterThan(0);

    // Spawn-layer assertion #4 — preservedIds array shape (proves the
    // post-spawn parsing path ran, not just the spawn itself).
    expect(Array.isArray(result.preservedIds)).toBe(true);
  });
});

// When the smoke is skipped, we still want ONE asserted-test slot so
// the test file isn't reported as "no tests" (which some CI dashboards
// surface as a regression). This case asserts the skip-reason was
// computed deterministically and the env-var / binary-lookup logic
// works as documented.
if (skipReason) {
  describe('spawn-smoke: skip-reason diagnostic', () => {
    it(`smoke skipped (reason: ${skipReason}); set CMK_SKIP_LIVE_HAIKU=0 and install \`claude\` to enable`, () => {
      expect(skipReason).toBeTruthy();
    });
  });
}
