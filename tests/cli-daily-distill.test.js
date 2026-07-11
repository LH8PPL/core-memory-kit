// @doors: 1, 2, 5
// @door-3.5: prompt-assertion — pins the sent instructions (grounding + supersede rules) and the sent input (the seeded day-file content rides the prompt).
// Door 3 N/A: dailyDistill uses an injected CompressorBackend (MockHaikuBackend in tests); no subprocess spawn at this boundary. The bin wrapper's real-Haiku spawn is covered by spawn-smoke-haiku/-compress-session in their own files.
// Door 4 N/A: no message-queue interaction.

// Tests for Task 33 — Daily distill cron (T-028).
// Per tasks.md 33.4 (4 cases):
//   1. Test fixture with 7 days of `today-*.md`: script produces single `recent.md` with compressed consolidation
//   2. Test `register-crons.py` idempotency: re-run adds no duplicate entries (platform-specific check) — covered by cli-register-crons.test.js (the separate file for register-crons)
//   3. Test cooldown active: script exits `skipped: cooldown`; no output
//   4. Test 0 `today-*.md` files: script exits 0 cleanly; recent.md unchanged

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  utimesSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dailyDistill } from '../packages/cli/src/daily-distill.mjs';
import { MockHaikuBackend, HaikuTimeoutError } from '../packages/cli/src/compressor.mjs';
import { install } from '../packages/cli/src/install.mjs';
import { touchCooldownMarker } from '../packages/cli/src/cooldown.mjs';

let sandbox;
let projectRoot;
let userDir;

async function makeFixture() {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-distill-test-'));
  projectRoot = join(sandbox, 'proj');
  userDir = join(sandbox, 'user');
  await install({ projectRoot, userTier: userDir });
}

function seedTodayFile(projectRoot, date, body) {
  const dir = join(projectRoot, 'context', 'sessions');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `today-${date}.md`);
  writeFileSync(path, body, 'utf8');
  return path;
}

// Task 204: dailyDistill now distills ONE today-*.md per compress() call
// (resumable per-day, not one whole-corpus call), so a backend needs enough
// canned responses for the number of days seeded. `count` supplies that many
// identical responses (default 8 = the 7-day window + slack).
function mockBackend(outputText, count = 8) {
  return new MockHaikuBackend({
    responses: Array.from({ length: count }, () => ({
      outputText,
      inputTokens: 100,
      outputTokens: 50,
      costUSD: 0.0001,
      preservedIds: [],
    })),
  });
}

beforeEach(async () => {
  await makeFixture();
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe('Task 33 — dailyDistill', () => {
  describe('33.4 #1 — fixture with 7 days of today-*.md produces recent.md', () => {
    it('reads all 7 days, sends to Haiku, writes consolidated recent.md', async () => {
      // Seed today-*.md for the 7 days leading up to "now".
      const now = '2026-05-28T23:00:00Z';
      const days = [
        '2026-05-22', '2026-05-23', '2026-05-24', '2026-05-25',
        '2026-05-26', '2026-05-27', '2026-05-28',
      ];
      for (const d of days) {
        seedTodayFile(projectRoot, d, `## ${d}\n\n- Decision: ship feature X on ${d}\n`);
      }
      const r = await dailyDistill({
        projectRoot,
        backend: mockBackend('## Decisions\n- consolidated 7-day summary\n'),
        now,
      });
      expect(r.action).toBe('distilled');
      expect(r.sourceDays).toBe(7);
      const recentPath = join(projectRoot, 'context', 'sessions', 'recent.md');
      expect(existsSync(recentPath)).toBe(true);
      const content = readFileSync(recentPath, 'utf8');
      expect(content).toContain('consolidated 7-day summary');
      // Task 213 (D-308): today→recent provenance is structural — the per-day
      // `## <date>` section headers ARE the source pointer (the resumable
      // per-day assembly, Task 204). Every source day resolves to a section.
      for (const d of days) expect(content).toContain(`## ${d}`);
    });

    // Task 161 / D-175: daily-distill is a CEILING-FREE path (cron/detached child,
    // no 60s hook ceiling), so it retries a transient Haiku failure once. A timeout
    // on attempt 1 → retry → success → recent.md still written.
    it('retries a transient timeout and recovers (ceiling-free path, maxAttempts:2)', async () => {
      const now = '2026-05-28T23:00:00Z';
      seedTodayFile(projectRoot, '2026-05-28', '## 2026-05-28\n\n- Decision: ship X\n');
      // A backend that times out once, then succeeds.
      const queue = [new HaikuTimeoutError('slow', { timeoutMs: 50_000 })];
      const calls = [];
      const backend = {
        calls,
        modelId: () => 'mock',
        estimatedCostPerCall: () => 0,
        async compress(opts) {
          calls.push(opts);
          if (queue.length) throw queue.shift();
          return { outputText: '## Decisions\n- recovered after retry\n', inputTokens: 10, outputTokens: 5, costUSD: 0, preservedIds: [] };
        },
      };
      const r = await dailyDistill({ projectRoot, backend, now });
      expect(backend.calls).toHaveLength(2); // retried once
      expect(r.action).toBe('distilled');
      const recent = readFileSync(join(projectRoot, 'context', 'sessions', 'recent.md'), 'utf8');
      expect(recent).toContain('recovered after retry');
      // Task 161.12: the success log entry records the retry (so the retry RATE is visible).
      const logPath = join(projectRoot, 'context', 'sessions', `${now.slice(0, 10)}.distill.log`);
      const lastLine = readFileSync(logPath, 'utf8').trim().split('\n').pop();
      expect(JSON.parse(lastLine).retries).toBe(1);
      // D-179: daily-distill is CEILING-FREE → 120s timeout (not the hook-sized 50s), so a
      // future edit can't silently revert it. Pin the value the verb actually sent.
      expect(backend.calls[0].timeoutMs).toBe(120_000);
    });

    it('the distill prompt carries the faithfulness/grounding rule (Task 84 / D-36)', async () => {
      // Same anti-hallucination guard as compress-session: the consolidator
      // must not invent facts absent from the daily summaries it consolidates.
      // General rule — no example categories.
      const now = '2026-05-28T23:00:00Z';
      seedTodayFile(projectRoot, '2026-05-28', '## 2026-05-28\n- Decision: ship X');
      const backend = mockBackend('## Decisions\n- summary\n');
      await dailyDistill({ projectRoot, backend, now });
      const instructions = backend.calls[0].instructions ?? '';
      expect(instructions).toMatch(/grounded in the daily summaries/i);
      expect(instructions).toMatch(/do not infer or add any fact not explicitly present/i);
      // Task 84b: supersede-on-change at the rollup layer — when daily summaries
      // show a fact was later corrected/replaced/reversed, keep ONLY the latest
      // (don't accumulate cross-day stale state). Domain-neutral, example-free.
      expect(instructions).toMatch(/corrected, replaced, or reversed/i);
      expect(instructions).toMatch(/keep ONLY the latest version/i);
      // Task 137.1 Door-3.5: the INPUT half of WHAT IS SENT — the seeded
      // day-file content must actually ride the prompt (an input-composition
      // bug here was unpinnable before the audit; the D-122 shape).
      expect(backend.calls[0].input).toContain('Decision: ship X');
    });

    it('excludes today-*.md files older than 7 days', async () => {
      const now = '2026-05-28T23:00:00Z';
      // 8 days old — should be EXCLUDED.
      seedTodayFile(projectRoot, '2026-05-20', '## 2026-05-20\n- old, excluded');
      // Within window — should be INCLUDED.
      seedTodayFile(projectRoot, '2026-05-25', '## 2026-05-25\n- in window');
      const r = await dailyDistill({
        projectRoot,
        backend: mockBackend('## Decisions\n- summary\n'),
        now,
      });
      expect(r.action).toBe('distilled');
      expect(r.sourceDays).toBe(1);
    });
  });

  describe('33.4 #3 — cooldown active: skipped: cooldown, no recent.md written', () => {
    it('honors the 120s Haiku cooldown via cooldown.mjs', async () => {
      const now = '2026-05-28T23:00:00Z';
      seedTodayFile(projectRoot, '2026-05-28', '## 2026-05-28\n- fact\n');
      // Pre-touch the cooldown marker so the gate is active.
      touchCooldownMarker({ projectRoot, now });
      const r = await dailyDistill({
        projectRoot,
        backend: mockBackend('## Decisions\n- should not fire\n'),
        now,
      });
      expect(r.action).toBe('skipped');
      expect(r.reason).toBe('cooldown');
      // recent.md MUST NOT have been written.
      const recentPath = join(projectRoot, 'context', 'sessions', 'recent.md');
      expect(existsSync(recentPath)).toBe(false);
    });
  });

  describe('33.4 #4 — 0 today-*.md files: exits 0 cleanly; recent.md unchanged', () => {
    it('returns skipped: no-input when no today-*.md exist', async () => {
      const r = await dailyDistill({
        projectRoot,
        backend: mockBackend('## Decisions\n- should not fire\n'),
        now: '2026-05-28T23:00:00Z',
      });
      expect(r.action).toBe('skipped');
      expect(r.reason).toBe('no-input');
      const recentPath = join(projectRoot, 'context', 'sessions', 'recent.md');
      expect(existsSync(recentPath)).toBe(false);
    });

    it('preserves an existing recent.md when there are no today-*.md to distill', async () => {
      const recentPath = join(projectRoot, 'context', 'sessions', 'recent.md');
      mkdirSync(join(projectRoot, 'context', 'sessions'), { recursive: true });
      writeFileSync(recentPath, '## Decisions\n- preserved from earlier\n', 'utf8');
      await dailyDistill({
        projectRoot,
        backend: mockBackend('## Decisions\n- should not fire\n'),
        now: '2026-05-28T23:00:00Z',
      });
      const content = readFileSync(recentPath, 'utf8');
      expect(content).toContain('preserved from earlier');
    });
  });

  describe('Task 204 / ADR-0020 — resumable per-day distill', () => {
    const days7 = [
      '2026-05-22', '2026-05-23', '2026-05-24', '2026-05-25',
      '2026-05-26', '2026-05-27', '2026-05-28',
    ];
    const now = '2026-05-28T23:00:00Z';

    function seed7() {
      for (const d of days7) {
        seedTodayFile(projectRoot, d, `- Decision: ship on ${d} #P-9LXBA3ZK\n`);
      }
    }

    it('killed at day 4 of 7 → the completed days survive as artifacts; the next run resumes (D-298 fix)', async () => {
      seed7();
      const sessions = join(projectRoot, 'context', 'sessions');

      // Run 1: a backend that succeeds 4 times then THROWS (simulates the cron
      // killed mid-run, e.g. the machine sleeping at 23:00 — D-298).
      let call = 0;
      const dyingBackend = {
        calls: [],
        modelId: () => 'mock',
        estimatedCostPerCall: () => 0,
        async compress(opts) {
          this.calls.push(opts);
          call += 1;
          if (call > 4) throw new Error('killed mid-run (machine asleep)');
          return { outputText: `day-summary-${call}`, inputTokens: 10, outputTokens: 5, costUSD: 0, preservedIds: [] };
        },
      };
      const r1 = await dailyDistill({ projectRoot, backend: dyingBackend, now });
      expect(r1.action).toBe('error');
      // FORWARD PROGRESS: the 4 completed days persisted their artifacts.
      const distilled = readdirSync(sessions).filter((f) => f.endsWith('.distilled.md'));
      expect(distilled).toHaveLength(4);
      // recent.md is FRESHER (reflects the 4 done days), not left empty/stale.
      const recentPath = join(sessions, 'recent.md');
      expect(existsSync(recentPath)).toBe(true);
      expect(readFileSync(recentPath, 'utf8')).toContain('day-summary-1');
      expect(r1.distilledThisRun).toBe(4);

      // Run 2 (the "next night"): a healthy backend. It must RESUME — only the
      // 3 remaining days get compressed, not all 7 again.
      const healthy = mockBackend('resumed-day', 8);
      const r2 = await dailyDistill({ projectRoot, backend: healthy, now, cooldownMs: 0 });
      expect(r2.action).toBe('distilled');
      expect(r2.distilledThisRun).toBe(3); // ONLY the 3 not-yet-done days
      expect(r2.skippedResumed).toBe(4); // the 4 from run 1 were reused
      // All 7 days now have artifacts; recent.md spans all 7.
      expect(readdirSync(sessions).filter((f) => f.endsWith('.distilled.md'))).toHaveLength(7);
    });

    it('a fully-fresh re-run distills ZERO days (all artifacts current) but still rewrites recent.md', async () => {
      seed7();
      await dailyDistill({ projectRoot, backend: mockBackend('s', 8), now });
      // Immediate second run: every artifact is newer than its source → all skipped.
      const r = await dailyDistill({ projectRoot, backend: mockBackend('s', 8), now, cooldownMs: 0 });
      expect(r.action).toBe('distilled');
      expect(r.distilledThisRun).toBe(0);
      expect(r.skippedResumed).toBe(7);
    });

    it('the assembled recent.md is re-capped to maxOutputBytes (drop oldest-first; D-313)', async () => {
      seed7();
      // Each per-day distill returns ~200 bytes; 7 days would be ~1.4KB + headers.
      // Cap at 600 bytes → only the newest day or two survive the re-cap.
      const chunk = '- ' + 'x'.repeat(180);
      const backend = mockBackend(chunk, 8);
      const r = await dailyDistill({ projectRoot, backend, now, maxOutputBytes: 600 });
      expect(r.action).toBe('distilled');
      const recent = readFileSync(join(projectRoot, 'context', 'sessions', 'recent.md'), 'utf8');
      expect(Buffer.byteLength(recent, 'utf8')).toBeLessThanOrEqual(600);
      // The NEWEST day is always kept (drop-oldest-first); the oldest is dropped.
      expect(recent).toContain('## 2026-05-28'); // newest
      expect(recent).not.toContain('## 2026-05-22'); // oldest, dropped under the cap
    });

    it('an EMPTY backend result does NOT bank a blank artifact (the day re-distills; D-313)', async () => {
      seedTodayFile(projectRoot, '2026-05-28', '- something #P-9LXBA3ZK\n');
      // Backend returns whitespace-only (a soft hiccup, not an error).
      const empties = new MockHaikuBackend({
        responses: [{ outputText: '   \n', inputTokens: 1, outputTokens: 1, costUSD: 0, preservedIds: [] }],
      });
      const r1 = await dailyDistill({ projectRoot, backend: empties, now });
      // No artifact banked → distilledThisRun 0, and the day is NOT marked done.
      expect(r1.distilledThisRun).toBe(0);
      expect(existsSync(join(projectRoot, 'context', 'sessions', 'today-2026-05-28.distilled.md'))).toBe(false);
      // Next run with real output distills the day (it wasn't falsely skipped).
      const r2 = await dailyDistill({ projectRoot, backend: mockBackend('real', 8), now, cooldownMs: 0 });
      expect(r2.distilledThisRun).toBe(1);
    });

    it('an EDITED source day re-distills (artifact older than its today-*.md)', async () => {
      seedTodayFile(projectRoot, '2026-05-28', '- original #P-9LXBA3ZK\n');
      await dailyDistill({ projectRoot, backend: mockBackend('v1', 8), now });
      // Edit the source day so its mtime is newer than the .distilled.md.
      await new Promise((res) => setTimeout(res, 10));
      seedTodayFile(projectRoot, '2026-05-28', '- EDITED #P-9LXBA3ZK\n');
      const r = await dailyDistill({ projectRoot, backend: mockBackend('v2', 8), now, cooldownMs: 0 });
      expect(r.distilledThisRun).toBe(1); // the edited day re-ran
      expect(readFileSync(join(projectRoot, 'context', 'sessions', 'recent.md'), 'utf8')).toContain('v2');
    });
  });

  describe('Error + boundary cases', () => {
    it('errors on missing projectRoot', async () => {
      const r = await dailyDistill({
        backend: mockBackend('foo'),
        now: '2026-05-28T23:00:00Z',
      });
      expect(r.action).toBe('error');
      expect(r.error_category).toBe('missing_project_root');
    });

    it('errors on missing backend', async () => {
      const r = await dailyDistill({
        projectRoot,
        now: '2026-05-28T23:00:00Z',
      });
      expect(r.action).toBe('error');
      expect(r.error_category).toBe('missing_backend');
    });

    it('skips when context/sessions/ does not exist (no-context-dir)', async () => {
      // Use a fresh sandbox WITHOUT running install().
      const fresh = mkdtempSync(join(tmpdir(), 'cmk-distill-no-install-'));
      try {
        const r = await dailyDistill({
          projectRoot: fresh,
          backend: mockBackend('foo'),
          now: '2026-05-28T23:00:00Z',
        });
        expect(r.action).toBe('skipped');
        expect(r.reason).toBe('no-context-dir');
      } finally {
        rmSync(fresh, { recursive: true, force: true });
      }
    });

    it('routes Haiku failure as error with COMPRESS_FAILED category + touches cooldown', async () => {
      const now = '2026-05-28T23:00:00Z';
      seedTodayFile(projectRoot, '2026-05-28', '## 2026-05-28\n- fact\n');
      const throwingBackend = {
        compress: async () => { throw new Error('mock-haiku-down'); },
        modelId: () => 'mock-haiku',
      };
      const r = await dailyDistill({
        projectRoot,
        backend: throwingBackend,
        now,
      });
      expect(r.action).toBe('error');
      expect(r.error_category).toBe('compress_failed');
      // Cooldown marker MUST be touched even on the error path so a
      // failing Haiku doesn't get immediately re-tried by another cron
      // tick. Matches the auto-extract / compress-session pattern.
      const markerPath = join(projectRoot, 'context', '.locks', 'last-haiku-call.ts');
      expect(existsSync(markerPath)).toBe(true);
    });
  });
});
