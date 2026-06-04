// @doors: 1, 2, 5
// Door 3 N/A: at the runLazyCompress boundary, backend + spawn are both injected (MockHaikuBackend; inject-context.mjs uses testSpawnLazy for tests). The bin wrapper's real spawn is a v0.1.x spawn-smoke candidate per design §16 (parallel to cmk-daily-distill / cmk-weekly-curate).
// Door 4 N/A: no message-queue interaction.

// Tests for Task 35 — Lazy compression fallback for no-cron envs (T-030).
// Per tasks.md 35.4 (4 cases):
//   1. SessionStart with stale recent.md (mtime 8d): cmk compress --lazy spawned; SessionStart still returns within 500ms
//   2. SessionStart with fresh recent.md: no spawn
//   3. cmk compress --lazy runs daily-distill when only daily is stale; weekly-curate when weekly is stale
//   4. With cron-registered sentinel: lazy detector exits skipped: cron-active

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  detectStaleness,
  runLazyCompress,
  markCronRegistered,
  unmarkCronRegistered,
  cronSentinelPath,
} from '../packages/cli/src/lazy-compress.mjs';
import { injectContext } from '../packages/cli/src/inject-context.mjs';
import { MockHaikuBackend } from '../packages/cli/src/compressor.mjs';
import { install } from '../packages/cli/src/install.mjs';

let sandbox;
let projectRoot;
let userDir;

async function makeFixture() {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-lazy-test-'));
  projectRoot = join(sandbox, 'proj');
  userDir = join(sandbox, 'user');
  await install({ projectRoot, userTier: userDir });
}

function seedTodayFile(date, body = `## Decisions\n- ${date}\n`) {
  const dir = join(projectRoot, 'context', 'sessions');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `today-${date}.md`);
  writeFileSync(path, body, 'utf8');
  return path;
}

function seedRecentMd(body, ageMs, baseMs = Date.now()) {
  const path = join(projectRoot, 'context', 'sessions', 'recent.md');
  mkdirSync(join(projectRoot, 'context', 'sessions'), { recursive: true });
  writeFileSync(path, body, 'utf8');
  if (ageMs !== undefined) {
    // baseMs lets a test that passes a FIXED `now` to detectStaleness seed the
    // mtime relative to THAT instant (not real wall-clock) — otherwise the
    // computed age drifts with real time and a staleness assertion eventually
    // flips. Defaults to Date.now() for tests where the age sign is all that
    // matters (fresh = "future relative to a past fixed now").
    const t = (baseMs - ageMs) / 1000;
    utimesSync(path, t, t);
  }
  return path;
}

function mockBackend(...outputs) {
  return new MockHaikuBackend({
    responses: outputs.map((outputText) => ({
      outputText,
      inputTokens: 50,
      outputTokens: 25,
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

describe('Task 35 — detectStaleness (cheap inline staleness check)', () => {
  describe('cron-sentinel short-circuit (35.4 #4)', () => {
    it('returns cron-active when .locks/cron-registered exists', () => {
      // Seed a stale-looking fixture to prove the sentinel WINS over staleness
      seedTodayFile('2026-05-10');
      seedRecentMd('## old\n', 30 * 24 * 60 * 60 * 1000);
      markCronRegistered({ projectRoot });
      const v = detectStaleness({ projectRoot, now: '2026-05-28T10:00:00Z' });
      expect(v.action).toBe('cron-active');
    });

    it('unmarkCronRegistered restores normal staleness detection', () => {
      markCronRegistered({ projectRoot });
      expect(existsSync(cronSentinelPath(projectRoot))).toBe(true);
      unmarkCronRegistered({ projectRoot });
      expect(existsSync(cronSentinelPath(projectRoot))).toBe(false);
    });

    it('unmarkCronRegistered is idempotent (no-op when missing)', () => {
      unmarkCronRegistered({ projectRoot });
      unmarkCronRegistered({ projectRoot });
      expect(existsSync(cronSentinelPath(projectRoot))).toBe(false);
    });
  });

  describe('no-context-dir guard', () => {
    it('returns no-context-dir when sessions/ is missing', () => {
      rmSync(join(projectRoot, 'context', 'sessions'), { recursive: true, force: true });
      const v = detectStaleness({ projectRoot, now: '2026-05-28T10:00:00Z' });
      expect(v.action).toBe('no-context-dir');
    });

    it('returns no-context-dir when projectRoot missing', () => {
      const v = detectStaleness({ now: '2026-05-28T10:00:00Z' });
      expect(v.action).toBe('no-context-dir');
    });
  });

  describe('weekly staleness precedence (35.4 #1 + #3)', () => {
    it('returns stale-weekly when ANY today-*.md is older than 7 days', () => {
      seedTodayFile('2026-05-10'); // older than 7d from 2026-05-28
      seedRecentMd('## fresh\n', 60_000); // recent.md is fresh, irrelevant
      const v = detectStaleness({ projectRoot, now: '2026-05-28T10:00:00Z' });
      expect(v.action).toBe('stale-weekly');
    });

    it('returns stale-weekly even when recent.md is missing', () => {
      seedTodayFile('2026-05-10');
      const v = detectStaleness({ projectRoot, now: '2026-05-28T10:00:00Z' });
      expect(v.action).toBe('stale-weekly');
    });
  });

  describe('daily staleness (35.4 #1)', () => {
    it('returns stale-daily when recent.md is missing AND today files exist', () => {
      seedTodayFile('2026-05-28');
      const v = detectStaleness({ projectRoot, now: '2026-05-28T10:00:00Z' });
      expect(v.action).toBe('stale-daily');
      expect(v.reason).toBe('recent-md-missing');
    });

    it('returns stale-daily when recent.md mtime > 24h', () => {
      seedTodayFile('2026-05-28');
      // Seed mtime against the SAME fixed `now` (not real wall-clock) so the
      // 8d age is deterministic — this test tripped 2026-06-04 when real time
      // marched past the point where (realNow − 8d) sat <24h before the fixed now.
      seedRecentMd('## stale\n', 8 * 24 * 60 * 60 * 1000, Date.parse('2026-05-28T10:00:00Z'));
      const v = detectStaleness({ projectRoot, now: '2026-05-28T10:00:00Z' });
      // Note: this fires stale-DAILY because no OLD today file exists
      // (only 2026-05-28 which is current). The recent.md mtime > 24h
      // criterion fires.
      expect(v.action).toBe('stale-daily');
      expect(v.reason).toBe('recent-md-older-than-ttl');
    });
  });

  describe('fresh path (35.4 #2)', () => {
    it('returns fresh when recent.md is younger than 24h and no OLD today files', () => {
      seedTodayFile('2026-05-28');
      seedRecentMd('## fresh\n', 60_000); // 1 minute old
      const v = detectStaleness({ projectRoot, now: '2026-05-28T10:00:00Z' });
      expect(v.action).toBe('fresh');
    });

    it('returns fresh when no today files exist at all (nothing to compress)', () => {
      const v = detectStaleness({ projectRoot, now: '2026-05-28T10:00:00Z' });
      expect(v.action).toBe('fresh');
      expect(v.reason).toBe('no-input');
    });
  });
});

describe('Task 35 — runLazyCompress (delegates to daily-distill or weekly-curate)', () => {
  describe('Validation (Door 1)', () => {
    it('rejects missing projectRoot', async () => {
      const r = await runLazyCompress({ backend: mockBackend('output') });
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('missing_project_root');
    });

    it('rejects missing backend', async () => {
      const r = await runLazyCompress({ projectRoot });
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('missing_backend');
    });
  });

  describe('cron-active skip path', () => {
    it('skips when sentinel present', async () => {
      seedTodayFile('2026-05-10');
      markCronRegistered({ projectRoot });
      const r = await runLazyCompress({
        projectRoot,
        backend: mockBackend('output'),
        now: '2026-05-28T10:00:00Z',
      });
      expect(r.action).toBe('skipped');
      expect(r.reason).toBe('cron-active');
      // NDJSON log entry written
      const logPath = join(projectRoot, 'context', '.locks', 'lazy-compress.log');
      expect(existsSync(logPath)).toBe(true);
      const entry = JSON.parse(readFileSync(logPath, 'utf8').trim().split('\n')[0]);
      expect(entry.reason).toBe('cron-active');
    });
  });

  describe('I1 fix — cooldown gate composes with shared 120s marker', () => {
    it('returns skipped:cooldown when last-haiku-call.ts marker is active', async () => {
      // The load-bearing composition class — same shape as Task 25
      // and the auto-extract / compress-session cooldown gating.
      // Seed a stale fixture so we know the cooldown gate (not
      // fresh-path) is what causes the skip.
      seedTodayFile('2026-05-10');
      const { touchCooldownMarker } = await import('../packages/cli/src/cooldown.mjs');
      touchCooldownMarker({ projectRoot, now: '2026-05-28T10:00:00Z' });
      const backend = mockBackend('should-not-be-called');
      const r = await runLazyCompress({
        projectRoot,
        backend,
        now: '2026-05-28T10:00:00Z',
      });
      // Door 1 — response shape
      expect(r.action).toBe('skipped');
      expect(r.reason).toBe('cooldown');
      // Door 2 — state: backend NOT called, no delegation happened
      expect(backend.calls.length).toBe(0);
      // archive.md + recent.md untouched
      expect(existsSync(join(projectRoot, 'context', 'sessions', 'archive.md'))).toBe(false);
      // Door 4 — NDJSON shape: cooldown branch has stable schema with
      // verdict + delegated_to null sentinels (M1 fix).
      const logPath = join(projectRoot, 'context', '.locks', 'lazy-compress.log');
      const entry = JSON.parse(readFileSync(logPath, 'utf8').trim().split('\n')[0]);
      expect(entry.scope).toBe('lazy-compress');
      expect(entry.action).toBe('skipped');
      expect(entry.reason).toBe('cooldown');
      expect(entry.verdict).toBeNull();
      expect(entry.delegated_to).toBeNull();
    });

    it('overrides cooldown when caller passes cooldownMs: 0 (allows inner-cycle composition)', async () => {
      // The cooldownMs override path — used by inner-cycle callers
      // that have already gated above (parallel to weekly-curate's
      // inline dailyDistill call per §8.7.2).
      seedTodayFile('2026-05-28');
      const { touchCooldownMarker } = await import('../packages/cli/src/cooldown.mjs');
      touchCooldownMarker({ projectRoot, now: '2026-05-28T10:00:00Z' });
      const r = await runLazyCompress({
        projectRoot,
        backend: mockBackend('## Decisions\n- x\n'),
        now: '2026-05-28T10:00:00Z',
        cooldownMs: 0,
      });
      // With cooldownMs: 0 the gate is effectively disabled
      expect(r.action).toBe('distilled');
    });
  });

  describe('35.4 #3 — delegates to daily-distill when only daily is stale', () => {
    it('runs dailyDistill and recent.md is rebuilt', async () => {
      seedTodayFile('2026-05-28');
      // No recent.md → stale-daily
      const distilledOutput = '## Decisions\n- fresh daily output\n';
      const backend = mockBackend(distilledOutput);
      const r = await runLazyCompress({
        projectRoot,
        backend,
        now: '2026-05-28T10:00:00Z',
      });
      expect(r.action).toBe('distilled');
      expect(r.delegatedTo).toBe('daily-distill');
      expect(r.verdict).toBe('stale-daily');
      // recent.md now exists with the distilled output
      const recent = readFileSync(
        join(projectRoot, 'context', 'sessions', 'recent.md'),
        'utf8',
      );
      expect(recent).toContain('fresh daily output');
    });
  });

  describe('35.4 #3 — delegates to weekly-curate when weekly is stale', () => {
    it('runs weeklyCurate (archive + recent rebuild) when OLD today files exist', async () => {
      seedTodayFile('2026-05-10'); // OLD
      seedTodayFile('2026-05-28'); // CURRENT
      // Two Haiku calls expected: archive + recent rebuild
      const backend = mockBackend(
        '## Week of 2026-05-04\n\n- archived\n',
        '## Decisions\n\n- current\n',
      );
      const r = await runLazyCompress({
        projectRoot,
        backend,
        now: '2026-05-28T10:00:00Z',
      });
      expect(r.action).toBe('curated');
      expect(r.delegatedTo).toBe('weekly-curate');
      expect(r.verdict).toBe('stale-weekly');
      // archive.md created
      expect(existsSync(join(projectRoot, 'context', 'sessions', 'archive.md'))).toBe(true);
    });
  });

  describe('fresh path: no work needed', () => {
    it('returns skipped when nothing is stale', async () => {
      seedTodayFile('2026-05-28');
      seedRecentMd('## fresh\n', 60_000);
      const r = await runLazyCompress({
        projectRoot,
        backend: mockBackend('should-not-be-called'),
        now: '2026-05-28T10:00:00Z',
      });
      expect(r.action).toBe('skipped');
      expect(r.reason).toBe('within-ttl');
    });
  });

  describe('Door 5 — lazy-compress.log NDJSON observability', () => {
    it('writes log entry on skip-cron-active', async () => {
      seedTodayFile('2026-05-10');
      markCronRegistered({ projectRoot });
      await runLazyCompress({
        projectRoot,
        backend: mockBackend(),
        now: '2026-05-28T10:00:00Z',
      });
      const logPath = join(projectRoot, 'context', '.locks', 'lazy-compress.log');
      const entry = JSON.parse(readFileSync(logPath, 'utf8').trim().split('\n')[0]);
      expect(entry.scope).toBe('lazy-compress');
      expect(entry.action).toBe('skipped');
    });

    it('writes log entry on stale-daily delegation', async () => {
      seedTodayFile('2026-05-28');
      await runLazyCompress({
        projectRoot,
        backend: mockBackend('## Decisions\n- x\n'),
        now: '2026-05-28T10:00:00Z',
      });
      const logPath = join(projectRoot, 'context', '.locks', 'lazy-compress.log');
      const entry = JSON.parse(readFileSync(logPath, 'utf8').trim().split('\n')[0]);
      expect(entry.scope).toBe('lazy-compress');
      expect(entry.delegated_to).toBe('daily-distill');
      expect(entry.success).toBe(true);
    });
  });
});

describe('Task 35 — inject-context spawn integration (35.4 #1 + #2)', () => {
  it('35.4 #1 — SessionStart with stale recent.md detaches cmk-compress-lazy', () => {
    // Seed a stale fixture: OLD today file → stale-weekly
    seedTodayFile('2026-05-10');
    let spawnCalls = 0;
    const testSpawnLazy = () => {
      spawnCalls += 1;
      return { spawned: true, pid: 999 };
    };
    const t0 = Date.now();
    const r = injectContext({
      cwd: projectRoot,
      userDir,
      now: '2026-05-28T10:00:00Z',
      testSpawnLazy,
    });
    const elapsed = Date.now() - t0;
    expect(spawnCalls).toBe(1);
    expect(r.lazyTrigger.verdict).toBe('stale-weekly');
    expect(r.lazyTrigger.spawned).toBe(true);
    // 35.4 #1 budget: SessionStart returns within 500ms (NFR-1).
    // injectContext is synchronous, ~5ms for staleness check is the
    // bound; the detached spawn doesn't block the return.
    expect(elapsed).toBeLessThan(500);
  });

  it('35.4 #2 — SessionStart with fresh recent.md does NOT spawn', () => {
    seedTodayFile('2026-05-28');
    seedRecentMd('## fresh\n', 60_000);
    let spawnCalls = 0;
    const testSpawnLazy = () => {
      spawnCalls += 1;
      return { spawned: true, pid: 999 };
    };
    const r = injectContext({
      cwd: projectRoot,
      userDir,
      now: '2026-05-28T10:00:00Z',
      testSpawnLazy,
    });
    expect(spawnCalls).toBe(0);
    expect(r.lazyTrigger.verdict).toBe('fresh');
  });

  it('35.4 #4 — SessionStart with cron-sentinel present does NOT spawn', () => {
    seedTodayFile('2026-05-10'); // would be stale-weekly normally
    markCronRegistered({ projectRoot });
    let spawnCalls = 0;
    const testSpawnLazy = () => {
      spawnCalls += 1;
      return { spawned: true, pid: 999 };
    };
    const r = injectContext({
      cwd: projectRoot,
      userDir,
      now: '2026-05-28T10:00:00Z',
      testSpawnLazy,
    });
    expect(spawnCalls).toBe(0);
    expect(r.lazyTrigger.verdict).toBe('cron-active');
  });
});
