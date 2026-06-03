// @doors: 1, 2, 5
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
  readFileSync,
  rmSync,
  writeFileSync,
  utimesSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dailyDistill } from '../packages/cli/src/daily-distill.mjs';
import { MockHaikuBackend } from '../packages/cli/src/compressor.mjs';
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

function mockBackend(outputText) {
  return new MockHaikuBackend({
    responses: [
      {
        outputText,
        inputTokens: 100,
        outputTokens: 50,
        costUSD: 0.0001,
        preservedIds: [],
      },
    ],
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
