// @doors: 1, 2, 3
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: spawn-smoke pins the cross-process spawn boundary + the resulting disk-state mutation (Door 2); the NDJSON compress.log shape is pinned by cli-compress-session (in-process + mocked backend).

// Real-binary spawn smoke test for the SessionEnd compression code
// path (Task 22, retroactive). Per design §17 "Test discipline" —
// specifically §17.3-§17.5 (§17.1 five-exit-doors umbrella covers WHAT
// to assert; these subsections cover HOW to assert door 3 when the
// call is cross-process):
//
// The Task 22 unit tests (tests/cli-compress-session.test.js) inject
// a MockHaikuBackend. That pins compressSession()'s own logic but
// NEVER exercises the actual `claude --print` spawn that ships in
// production. The existing tests/spawn-smoke-haiku.test.js covers the
// HaikuViaAnthropicApi spawn in isolation; this file covers the
// integration: compressSession() → HaikuViaAnthropicApi.compress() →
// real `claude` binary → today-{date}.md write → now.md truncate.
//
// What this smoke catches that the mock cannot:
//   - The §8.4 compression prompt is acceptable to real Haiku (it
//     doesn't refuse, doesn't return an error response, doesn't time
//     out on a reasonable input).
//   - Real Haiku output, after being appended to today-{date}.md,
//     contains the documented section headings (## Decisions etc.)
//     — i.e., the prompt actually gets the model to follow the
//     §8.4 structure.
//   - The compress.log NDJSON entry carries real token counts + a
//     non-zero cost_usd (proves the close handler ran end-to-end
//     and the model_id is the real Haiku model, not 'mock-haiku').
//
// CI portability: same skip protocol as spawn-smoke-haiku.test.js.
// Set CMK_SKIP_LIVE_HAIKU=1 or run without `claude` in PATH and the
// suite degrades to a single skip-reason diagnostic.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compressSession } from '../packages/cli/src/compress-session.mjs';
import { HaikuViaAnthropicApi } from '../packages/cli/src/compressor.mjs';

function shouldSkip() {
  if (process.env.CMK_SKIP_LIVE_HAIKU === '1') {
    return 'CMK_SKIP_LIVE_HAIKU=1';
  }
  const lookup = process.platform === 'win32'
    ? spawnSync('where', ['claude'], { encoding: 'utf8' })
    : spawnSync('which', ['claude'], { encoding: 'utf8' });
  if (lookup.status !== 0 || !lookup.stdout.trim()) {
    return 'claude binary not on PATH';
  }
  return null;
}

const skipReason = shouldSkip();
const describeMaybe = skipReason ? describe.skip : describe;

describeMaybe(`spawn-smoke: compressSession (live: ${skipReason ?? 'enabled'})`, () => {
  // ONE real-Haiku round-trip through the SessionEnd code path.
  // Consolidated (per the spawn-smoke-haiku pattern from PR-26) to
  // avoid multiplying API load under full-suite concurrency.
  //
  // 60s test timeout: matches the SessionEnd hook envelope per design §5.1
  // ([`plugin/hooks/hooks.json`] SessionEnd = 60s). MUST be >= the production
  // inner subprocess timeout of 50_000ms (§8.5 cap composition for
  // compressSession) so that on a slow-Haiku round-trip the production
  // code's HAIKU_TIMEOUT path fires naturally BEFORE the vitest test budget
  // expires. With a 30s test budget (the original mis-aligned value), a
  // cold-start `claude --print` round-trip that would have legitimately
  // resolved at 35-45s instead failed as a vitest timeout, masking the
  // production behavior the smoke is supposed to pin. Cross-ref: design §8.5
  // composition rule (inner timeoutMs < outer hook ceiling + headroom).
  it('compressSession invokes real claude --print and writes today-{date}.md', { timeout: 60_000 }, async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'cmk-compress-session-smoke-'));
    const projectRoot = join(sandbox, 'proj');
    mkdirSync(join(projectRoot, 'context', 'sessions'), { recursive: true });
    mkdirSync(join(projectRoot, 'context', '.locks'), { recursive: true });

    // A small live buffer that should produce a Decisions / Files
    // Touched compression. Kept short so the round-trip is fast but
    // substantive enough that Haiku doesn't return an empty body.
    const nowMdBody = [
      '## 2026-05-25T10:00:00Z',
      '',
      'Decided to ship the SessionEnd hook with a 120s cooldown.',
      'Touched packages/cli/src/compress-session.mjs.',
      'Open question: should we expose cooldownMs via settings.json?',
      '',
    ].join('\n');
    writeFileSync(join(projectRoot, 'context', 'sessions', 'now.md'), nowMdBody, 'utf8');

    const backend = new HaikuViaAnthropicApi();
    let result;
    try {
      result = await compressSession({
        projectRoot,
        backend,
        now: '2026-05-25T11:00:00Z',
      });
    } catch (err) {
      // Spawn-layer or contract regression — surface specifically
      // before re-throwing so the diagnostic is actionable.
      const msg = String(err?.message ?? err);
      expect(msg.toLowerCase(), `compressSession threw — full error: ${msg}`)
        .not.toMatch(/unrecognized|invalid (flag|argument|option)|enoent|einval/);
      rmSync(sandbox, { recursive: true, force: true });
      throw err;
    }

    // Live-jitter tolerance + graceful-degradation contract. A HAIKU_TIMEOUT
    // means the real Anthropic API didn't return within the 50s ceiling — and
    // that ceiling CANNOT be raised: compress runs inside the 60s SessionEnd
    // hook (design §8.5), unlike the detached 90s auto-extract path. This is the
    // documented live-Haiku jitter class, NOT a code regression. So instead of
    // asserting a single live call always wins (flaky) OR ignoring the timeout
    // (hides bugs), assert the degradation CONTRACT: on timeout the kit must
    // leave now.md INTACT so the next session-end retries (compress-session.mjs
    // "the next session-end retries naturally"). A genuine spawn/contract bug
    // still fails — those surface as ENOENT/invalid-flag in the catch above, or
    // as a non-timeout error_category here.
    if (result.action === 'error' && result.error_category === 'haiku_timeout') {
      const nowMdPath = join(projectRoot, 'context', 'sessions', 'now.md');
      expect(
        statSync(nowMdPath).size,
        'now.md must be preserved on HAIKU_TIMEOUT so the next session-end retries',
      ).toBeGreaterThan(0);
      rmSync(sandbox, { recursive: true, force: true });
      return;
    }

    try {
      // Assertion #1 — action is 'compressed' (not 'error').
      // If real Haiku rejected the prompt for any reason, this fails
      // with the error_category surfaced.
      expect(result.action, `compressSession returned non-success: ${JSON.stringify(result)}`)
        .toBe('compressed');

      // Assertion #2 — today-{date}.md exists and is non-empty.
      const todayPath = join(projectRoot, 'context', 'sessions', 'today-2026-05-25.md');
      expect(existsSync(todayPath)).toBe(true);
      const today = readFileSync(todayPath, 'utf8');
      expect(today.length).toBeGreaterThan(0);

      // Assertion #3 — output follows the §8.4 structure. We can't
      // guarantee which sections Haiku populates (it omits empty
      // ones per rule 3), but at least one of the three section
      // headings should appear in a substantive compression. (Task 83
      // dropped "Files Touched" — a file-write log doesn't belong in memory.)
      const hasAnySectionHeading =
        today.includes('## Decisions') ||
        today.includes('## Open Questions') ||
        today.includes('## Active Threads');
      expect(hasAnySectionHeading, `today-{date}.md missing §8.4 section heading; got: ${today}`)
        .toBe(true);

      // Assertion #4 — now.md was truncated to 0 bytes.
      const nowMdPath = join(projectRoot, 'context', 'sessions', 'now.md');
      expect(statSync(nowMdPath).size).toBe(0);

      // Assertion #5 — compress.log entry has real model_id (not the
      // mock backend's 'mock-haiku') and non-zero token-derived cost.
      const logPath = join(projectRoot, 'context', 'sessions', '2026-05-25.compress.log');
      expect(existsSync(logPath)).toBe(true);
      const log = readFileSync(logPath, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l));
      expect(log).toHaveLength(1);
      const entry = log[0];
      expect(entry.success).toBe(true);
      expect(entry.scope).toBe('session-end');
      expect(entry.model_id).toMatch(/haiku/);
      expect(entry.model_id).not.toBe('mock-haiku');
      expect(entry.cost_usd).toBeGreaterThan(0);
      expect(entry.input_bytes).toBeGreaterThan(0);
      expect(entry.output_bytes).toBeGreaterThan(0);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
});

// Skip-reason diagnostic — same pattern as spawn-smoke-haiku.test.js.
if (skipReason) {
  describe('spawn-smoke compress-session: skip-reason diagnostic', () => {
    it(`smoke skipped (reason: ${skipReason}); set CMK_SKIP_LIVE_HAIKU=0 and install \`claude\` to enable`, () => {
      expect(skipReason).toBeTruthy();
    });
  });
}
