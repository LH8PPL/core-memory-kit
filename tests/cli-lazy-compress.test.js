// @doors: 1, 2, 5
// Door 3 N/A: at the runLazyCompress boundary, backend + spawn are both injected (MockHaikuBackend; inject-context.mjs uses testSpawnLazy for tests). The bin wrapper's real spawn is a v0.1.x spawn-smoke candidate per design §16 (parallel to cmk-daily-distill / cmk-weekly-curate).
// Door 4 N/A: no message-queue interaction.

// Tests for Task 35 — Lazy compression fallback for no-cron envs (T-030).
// Per tasks.md 35.4 (4 cases):
//   1. SessionStart with stale recent.md (mtime 8d): cmk compress --lazy spawned; SessionStart still returns within 500ms
//   2. SessionStart with fresh recent.md: no spawn
//   3. cmk compress --lazy runs daily-distill when only daily is stale; weekly-curate when weekly is stale
//   4. With cron-registered sentinel: lazy detector exits skipped: cron-active

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
  isJournalStale,
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

function seedNowMd(body = '## 2026-05-27T10:00:00Z — user\n\na prior-session turn\n') {
  const dir = join(projectRoot, 'context', 'sessions');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'now.md');
  writeFileSync(path, body, 'utf8');
  return path;
}

function readFileTrim(path) {
  return existsSync(path) ? readFileSync(path, 'utf8').trim() : '';
}

// Task 159 added an unconditional `scope:'journal-sync'` entry to lazy-compress.log
// (written before the compress action). Tests that want the compress ACTION entry
// must select by scope, not by line position [0] — the journal entry now precedes it.
function readLazyEntry(logPath) {
  const entries = readFileSync(logPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  return entries.find((e) => e.scope === 'lazy-compress');
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

// Task 159 (D-169): the journal-staleness check is INDEPENDENT of the compress
// pipeline's single verdict — a session can be compress-fresh yet have new
// decisions to journal. So isJournalStale is its own boolean (not a competing
// detectStaleness verdict), used as an ADDITIONAL spawn condition in
// inject-context and synced unconditionally inside runLazyCompress.
describe('Task 159 — isJournalStale (independent of compress staleness)', () => {
  // isJournalStale uses context/memory/INDEX.md mtime as the O(1) freshness
  // proxy (write-fact.mjs rewrites INDEX.md on every fact write, so INDEX.md ≥
  // newest fact always). So a faithful seed writes BOTH a project_*.md (the
  // "a decision fact exists" gate) AND touches INDEX.md (the freshness signal),
  // mirroring what the real writer does.
  const memDir = () => join(projectRoot, 'context', 'memory');
  function seedDecisionFact(id, title) {
    mkdirSync(memDir(), { recursive: true });
    const fm = ['---', `id: ${id}`, 'type: project', `title: ${title}`, 'created_at: 2026-06-18T10:00:00Z', 'trust: high', '---', '', `Body of ${title}.`, ''].join('\n');
    writeFileSync(join(memDir(), `project_${id}.md`), fm, 'utf8');
    writeFileSync(join(memDir(), 'INDEX.md'), `# Index\n- ${id}\n`, 'utf8'); // the real writer rewrites INDEX on every fact write
  }
  function writeJournal(body = '# Decisions\n') {
    writeFileSync(join(projectRoot, 'context', 'DECISIONS.md'), body, 'utf8');
  }
  const ageFile = (p, ms) => { const t = (Date.now() - ms) / 1000; utimesSync(p, t, t); };

  it('is stale when a decision fact exists but DECISIONS.md is missing', () => {
    seedDecisionFact('P-AAAAAAAA', 'A decision');
    expect(isJournalStale(projectRoot)).toBe(true);
  });

  it('is NOT stale when there are no decision facts at all', () => {
    // fresh install: no project facts → nothing to journal → not stale
    expect(isJournalStale(projectRoot)).toBe(false);
  });

  it('is stale when INDEX.md (the fresh-write proxy) is NEWER than DECISIONS.md', () => {
    writeJournal();
    ageFile(join(projectRoot, 'context', 'DECISIONS.md'), 60_000); // journal into the past
    seedDecisionFact('P-BBBBBBBB', 'A newer decision');             // INDEX.md mtime = now
    expect(isJournalStale(projectRoot)).toBe(true);
  });

  it('is NOT stale when DECISIONS.md is newer than INDEX.md', () => {
    seedDecisionFact('P-CCCCCCCC', 'An old decision');
    ageFile(join(memDir(), 'INDEX.md'), 60_000);                    // index into the past
    writeJournal('# Decisions\n\n<!-- decision:P-CCCCCCCC -->\n### An old decision\n'); // journal = now
    expect(isJournalStale(projectRoot)).toBe(false);
  });

  it('is NOT stale (defensive) when a fact exists but INDEX.md is absent (pre-index repo)', () => {
    // a fact exists + journal exists but no INDEX.md yet → treat as fresh (a
    // reindex will create INDEX; the session-end sync covers the journal anyway).
    mkdirSync(memDir(), { recursive: true });
    writeFileSync(join(memDir(), 'project_P-DDDDDDDD.md'), '---\nid: P-DDDDDDDD\ntype: project\ntitle: x\n---\nbody\n', 'utf8');
    writeJournal();
    expect(isJournalStale(projectRoot)).toBe(false);
  });

  it('returns false defensively when projectRoot is missing', () => {
    expect(isJournalStale(undefined)).toBe(false);
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

  // Task 198.1b (D-266): the SessionStart-lazy site runs the temporal sweep on
  // the Haiku paths that DON'T already route through weekly-curate (stale-now /
  // stale-daily) — covering the new-chat-same-window case where SessionEnd never
  // fired (the Task-105 gap). stale-weekly already sweeps inside weeklyCurate;
  // cron-active/fresh/cooldown skip the whole Haiku cycle (a sweep needs Haiku),
  // so no sweep there. Injected via deps.temporalSweep (the injection-seam idiom).
  describe('Task 198.1b — temporal sweep on the lazy Haiku paths', () => {
    it('fires the sweep on the stale-daily path (SessionEnd-never-fired coverage)', async () => {
      seedTodayFile('2026-05-28'); // no recent.md → stale-daily
      const sweepSpy = vi.fn().mockResolvedValue({ action: 'skipped', reason: 'no-new-facts' });
      const r = await runLazyCompress({
        projectRoot,
        backend: mockBackend('## Decisions\n- x\n'),
        now: '2026-05-28T10:00:00Z',
        deps: { temporalSweep: sweepSpy },
      });
      expect(r.verdict).toBe('stale-daily');
      expect(sweepSpy).toHaveBeenCalledTimes(1);
      // Door 3: projectRoot + the same backend + now forwarded
      expect(sweepSpy).toHaveBeenCalledWith(
        expect.objectContaining({ projectRoot, now: '2026-05-28T10:00:00Z' }),
      );
    });

    it('fires the sweep on the stale-now path too', async () => {
      // a non-empty now.md with prior-session content → stale-now
      mkdirSync(join(projectRoot, 'context', 'sessions'), { recursive: true });
      writeFileSync(
        join(projectRoot, 'context', 'sessions', 'now.md'),
        '## 2026-05-27T10:00:00Z — user\n\nprior turn\n',
        'utf8',
      );
      const sweepSpy = vi.fn().mockResolvedValue({ action: 'skipped', reason: 'no-new-facts' });
      const r = await runLazyCompress({
        projectRoot,
        backend: mockBackend('## today\n- rolled\n'),
        now: '2026-05-28T10:00:00Z',
        deps: { temporalSweep: sweepSpy },
      });
      expect(r.verdict).toBe('stale-now');
      expect(sweepSpy).toHaveBeenCalledTimes(1);
    });

    it('does NOT double-sweep on the stale-weekly path (weeklyCurate already sweeps)', async () => {
      seedTodayFile('2026-05-10'); // OLD → stale-weekly
      seedTodayFile('2026-05-28');
      const sweepSpy = vi.fn().mockResolvedValue({ action: 'skipped', reason: 'no-new-facts' });
      await runLazyCompress({
        projectRoot,
        backend: mockBackend('## Decisions\n- x\n'),
        now: '2026-05-28T10:00:00Z',
        deps: { temporalSweep: sweepSpy },
      });
      // the lazy site must NOT call the sweep itself here — weeklyCurate owns it
      expect(sweepSpy).not.toHaveBeenCalled();
    });

    it('does NOT sweep on the cooldown skip path (no Haiku cycle)', async () => {
      seedTodayFile('2026-05-28');
      const { touchCooldownMarker } = await import('../packages/cli/src/cooldown.mjs');
      touchCooldownMarker({ projectRoot, now: '2026-05-28T10:00:00Z' });
      const sweepSpy = vi.fn().mockResolvedValue({ action: 'skipped', reason: 'no-new-facts' });
      const r = await runLazyCompress({
        projectRoot,
        backend: mockBackend('output'),
        now: '2026-05-28T10:00:00Z',
        deps: { temporalSweep: sweepSpy },
      });
      expect(r.reason).toBe('cooldown');
      expect(sweepSpy).not.toHaveBeenCalled();
    });

    it('a thrown sweep never breaks the lazy compress result (best-effort)', async () => {
      seedTodayFile('2026-05-28');
      const sweepSpy = vi.fn().mockRejectedValue(new Error('sweep boom'));
      const r = await runLazyCompress({
        projectRoot,
        backend: mockBackend('## Decisions\n- x\n'),
        now: '2026-05-28T10:00:00Z',
        deps: { temporalSweep: sweepSpy },
      });
      expect(r.action).toBe('distilled'); // the compress result stands
    });

    // 198.1c — the automatic-path + idle-is-free criteria, end-to-end through the
    // REAL temporalSweep (NOT the spy): an idle project with no new State facts
    // must run the sweep with NO manual command AND spawn NO judge call (the
    // no-new-facts short-circuit returns before backend.compress). We assert the
    // backend saw exactly ONE compress call — the daily-distill's — and the sweep
    // added none. This is the D-169 automatic-path guard: a real user's idle
    // session boundary triggers the sweep, and it costs zero Haiku.
    it('logs the temporal outcome to lazy-compress.log (Door 4)', async () => {
      seedTodayFile('2026-05-28'); // stale-daily → the sweep runs on this path
      await runLazyCompress({
        projectRoot,
        backend: mockBackend('## Decisions\n- x\n'),
        now: '2026-05-28T10:00:00Z',
        deps: { temporalSweep: vi.fn().mockResolvedValue({ action: 'swept', superseded: 1, pairs_judged: 2 }) },
      });
      const logPath = join(projectRoot, 'context', '.locks', 'lazy-compress.log');
      const entry = readLazyEntry(logPath);
      expect(entry.temporal_action).toBe('swept');
      expect(entry.temporal_superseded).toBe(1);
      expect(entry.temporal_pairs_judged).toBe(2);
    });

    it('an idle session runs the REAL sweep with NO extra judge call (idle is free, no manual command)', async () => {
      seedTodayFile('2026-05-28'); // stale-daily → one distill compress call
      // TWO canned responses available: if the sweep spuriously called the judge
      // it would consume the 2nd. We assert exactly ONE was consumed → the sweep
      // short-circuited on no-new-facts BEFORE backend.compress. (A weaker
      // single-response backend would let a real sweep call throw + get swallowed
      // by the best-effort catch, hiding the spawn — so give it room to spend.)
      const backend = mockBackend('## Decisions\n- x\n', 'PAIR 1: SUPERSEDES');
      const before = backend.calls.length;
      await runLazyCompress({
        projectRoot,
        backend,
        now: '2026-05-28T10:00:00Z',
        // NO deps.temporalSweep → the REAL sweep runs. No manual `cmk` command.
      });
      expect(backend.calls.length - before).toBe(1);
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
      const entry = readLazyEntry(logPath); // by scope, not position (Task 159 added a journal-sync entry)
      expect(entry.reason).toBe('cron-active');
    });
  });

  describe('Task 159 — unconditional journal sync (D-169)', () => {
    function seedDecisionFact(id, title) {
      const dir = join(projectRoot, 'context', 'memory');
      mkdirSync(dir, { recursive: true });
      const fm = ['---', `id: ${id}`, 'type: project', `title: ${title}`, 'created_at: 2026-06-18T10:00:00Z', 'trust: high', '---', '', `Body of ${title}.`, ''].join('\n');
      writeFileSync(join(dir, `project_${id}.md`), fm, 'utf8');
    }

    it('syncs DECISIONS.md even when compress is cron-active-skipped (independent of the compress verdict)', async () => {
      // The composition proof: the journal sync must NOT be gated by the
      // compress verdict — cron handles compress, but the journal still needs
      // rendering at SessionStart for a no-clean-exit session.
      seedDecisionFact('P-AAAAAAAA', 'A decision made this session');
      markCronRegistered({ projectRoot });
      const journalPath = join(projectRoot, 'context', 'DECISIONS.md');
      expect(existsSync(journalPath)).toBe(false);

      const r = await runLazyCompress({
        projectRoot,
        backend: mockBackend('output'),
        now: '2026-06-18T12:00:00Z',
      });

      // compress still skips on cron-active …
      expect(r.action).toBe('skipped');
      expect(r.reason).toBe('cron-active');
      // … but the journal was rendered anyway (Door 2: real disk state).
      expect(existsSync(journalPath)).toBe(true);
      expect(readFileSync(journalPath, 'utf8')).toContain('A decision made this session');
    });

    it('writes a Door-4 journal-sync NDJSON entry to lazy-compress.log (observability)', async () => {
      // I1 from skill-review: the unconditional sync must leave a trace, like
      // every other action in runLazyCompress — else a silent fallback-path
      // failure (e.g. a DECISIONS.md permission error) is undebuggable.
      seedDecisionFact('P-BBBBBBBB', 'A decision to log');
      const r = await runLazyCompress({
        projectRoot,
        backend: mockBackend('output'),
        now: '2026-06-18T12:00:00Z',
      });
      expect(r).toBeTruthy();
      const logPath = join(projectRoot, 'context', '.locks', 'lazy-compress.log');
      expect(existsSync(logPath)).toBe(true);
      const entries = readFileSync(logPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
      const journalEntry = entries.find((e) => e.scope === 'journal-sync');
      expect(journalEntry, 'no journal-sync entry in lazy-compress.log').toBeTruthy();
      expect(journalEntry.action).toBe('written');
      expect(journalEntry.written).toBe(true);
      expect(journalEntry.appended).toBeGreaterThan(0);
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
      const entry = readLazyEntry(logPath); // by scope, not position (Task 159 journal-sync entry precedes it)
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
      const entry = readLazyEntry(logPath); // by scope, not position (Task 159 journal-sync entry precedes it)
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
      const entry = readLazyEntry(logPath); // by scope, not position (Task 159 journal-sync entry precedes it)
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

  // Task 159 (D-169): the journal is synced by the detached lazy worker, so a
  // session that's compress-FRESH but has new un-journaled decisions must still
  // spawn (otherwise the journal never renders without a clean SessionEnd).
  it('Task 159 — spawns when compress is fresh but the decision journal is stale', () => {
    seedTodayFile('2026-05-28');
    seedRecentMd('## fresh\n', 60_000); // compress-fresh
    // seed a decision fact (+ INDEX.md, the fresh-write proxy) with no
    // DECISIONS.md → journal stale
    const memDir = join(projectRoot, 'context', 'memory');
    mkdirSync(memDir, { recursive: true });
    writeFileSync(
      join(memDir, 'project_P-AAAAAAAA.md'),
      ['---', 'id: P-AAAAAAAA', 'type: project', 'title: A decision', 'created_at: 2026-05-28T09:00:00Z', 'trust: high', '---', '', 'body', ''].join('\n'),
      'utf8',
    );
    writeFileSync(join(memDir, 'INDEX.md'), '# Index\n- P-AAAAAAAA\n', 'utf8');
    let spawnCalls = 0;
    const testSpawnLazy = () => {
      spawnCalls += 1;
      return { spawned: true, pid: 999 };
    };
    const r = injectContext({ cwd: projectRoot, userDir, now: '2026-05-28T10:00:00Z', testSpawnLazy });
    expect(spawnCalls).toBe(1);
    // the compress verdict is still 'fresh' — the spawn is journal-driven.
    expect(r.lazyTrigger.verdict).toBe('fresh');
    expect(r.lazyTrigger.journalStale).toBe(true);
    expect(r.lazyTrigger.spawned).toBe(true);
  });

  it('Task 159 — does NOT spawn when compress is fresh AND the journal is current', () => {
    seedTodayFile('2026-05-28');
    seedRecentMd('## fresh\n', 60_000);
    // no decision facts → journal not stale
    let spawnCalls = 0;
    const testSpawnLazy = () => {
      spawnCalls += 1;
      return { spawned: true, pid: 999 };
    };
    const r = injectContext({ cwd: projectRoot, userDir, now: '2026-05-28T10:00:00Z', testSpawnLazy });
    expect(spawnCalls).toBe(0);
    expect(r.lazyTrigger.verdict).toBe('fresh');
    expect(r.lazyTrigger.journalStale).toBe(false);
  });
});

describe('Task 105 — now.md lazy-roll on SessionStart (D-75)', () => {
  describe('detectStaleness — stale-now verdict', () => {
    it('returns stale-now when now.md has prior-session content', () => {
      seedNowMd();
      const v = detectStaleness({ projectRoot, now: '2026-05-28T10:00:00Z' });
      expect(v.action).toBe('stale-now');
    });

    it('an empty / whitespace-only now.md is NOT stale-now (falls through to existing verdicts)', () => {
      // Fresh today + recent → 'fresh'; a whitespace now.md must not flip it.
      seedTodayFile('2026-05-28');
      seedRecentMd('## fresh\n', 60_000);
      seedNowMd('   \n\n');
      const v = detectStaleness({ projectRoot, now: '2026-05-28T10:00:00Z' });
      expect(v.action).toBe('fresh');
    });

    it('stale-now takes PRECEDENCE over stale-weekly (now→today is the first pipeline level)', () => {
      seedTodayFile('2026-05-10'); // would be stale-weekly on its own
      seedNowMd();
      const v = detectStaleness({ projectRoot, now: '2026-05-28T10:00:00Z' });
      expect(v.action).toBe('stale-now');
    });

    // Task 167 (D-207, Q4) REVERSED the old contract: this test previously
    // asserted "cron-active wins over stale-now (sentinel short-circuits
    // everything)" — which WAS the bug. A live cron handles daily/weekly on its
    // schedule, but it NEVER does the now→today roll (that's the SessionEnd/lazy
    // path), so un-rolled now.md content must drain THIS session regardless. The
    // old behavior let now.md grow to 410 KB because a (possibly dead) registered
    // cron suppressed the only roll that drains it.
    it('Task 167: stale-now WINS over a live cron (the now→today roll is never the cron\'s job)', () => {
      seedNowMd();
      markCronRegistered({ projectRoot }); // writes a FRESH heartbeat (live cron)
      const v = detectStaleness({ projectRoot, now: '2026-05-28T10:00:00Z' });
      expect(v.action).toBe('stale-now');
    });

    it('Task 167: a DEAD cron (stale heartbeat) does NOT suppress the roll — cronStale flagged', () => {
      // The PRIMARY bug: a registered-but-never-fired cron used to disable the
      // lazy roll forever. Now a stale heartbeat falls through to stale-now.
      seedNowMd();
      markCronRegistered({ projectRoot });
      // Age the heartbeat past the 48h TTL by stamping it 5 days before `now`.
      const hb = cronSentinelPath(projectRoot);
      const old = new Date(Date.parse('2026-05-28T10:00:00Z') - 5 * 24 * 60 * 60 * 1000);
      utimesSync(hb, old, old);
      const v = detectStaleness({ projectRoot, now: '2026-05-28T10:00:00Z' });
      expect(v.action).toBe('stale-now');
      expect(v.cronStale).toBe(true);
    });
  });

  describe('runLazyCompress — dispatches stale-now to compressSession (the now→today roll)', () => {
    it('rolls now.md → today-*.md, drains now.md, and logs the delegation', async () => {
      const nowPath = seedNowMd();
      expect(readFileTrim(nowPath)).not.toBe(''); // precondition

      const r = await runLazyCompress({
        projectRoot,
        backend: mockBackend('compressed session summary'),
        now: '2026-05-28T10:00:00Z',
      });

      // Door 1 (Response): the verdict + delegation are surfaced.
      expect(r.verdict).toBe('stale-now');
      expect(r.delegatedTo).toBe('compress-session');

      // Door 2 (State): now.md drained, today-*.md created with the rolled output.
      expect(readFileTrim(nowPath)).toBe('');
      const todayPath = join(projectRoot, 'context', 'sessions', 'today-2026-05-28.md');
      expect(existsSync(todayPath)).toBe(true);
      expect(readFileSync(todayPath, 'utf8')).toContain('compressed session summary');

      // Door 5 (Observability): the lazy-compress.log records the delegation,
      // and compressSession writes its own per-date compress.log (D-75: it
      // lives at sessions/{date}.compress.log, NOT .locks/).
      const lazyLog = join(projectRoot, 'context', '.locks', 'lazy-compress.log');
      const lazyEntries = readFileSync(lazyLog, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
      expect(lazyEntries.some((e) => e.delegated_to === 'compress-session')).toBe(true);
      const compressLog = join(projectRoot, 'context', 'sessions', '2026-05-28.compress.log');
      expect(existsSync(compressLog)).toBe(true);
    });

    it('skips (no roll) within the 120s cooldown — does NOT drain now.md', async () => {
      const nowPath = seedNowMd();
      // Touch the cooldown marker so the up-front gate fires.
      const r1 = await runLazyCompress({
        projectRoot,
        backend: mockBackend('first'),
        now: '2026-05-28T10:00:00Z',
      });
      expect(r1.verdict).toBe('stale-now'); // first run did the roll
      expect(readFileTrim(nowPath)).toBe('');

      // Re-seed now.md and fire again 30s later — inside the 120s cooldown.
      seedNowMd();
      const r2 = await runLazyCompress({
        projectRoot,
        backend: mockBackend('second'),
        now: '2026-05-28T10:00:30Z',
      });
      expect(r2.action).toBe('skipped');
      expect(r2.reason).toBe('cooldown');
      expect(readFileTrim(nowPath)).not.toBe(''); // NOT drained — cooldown protected it
    });
  });

  describe('inject-context — SessionStart spawns the lazy worker when now.md is stale', () => {
    it('non-empty now.md → detached spawn (verdict stale-now), still returns within 500ms', () => {
      seedNowMd();
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
      expect(r.lazyTrigger.verdict).toBe('stale-now');
      expect(r.lazyTrigger.spawned).toBe(true);
      expect(elapsed).toBeLessThan(500); // NFR-1: the Haiku roll is detached, not inline
    });

    it('empty now.md + fresh today/recent → no spawn (no false trigger)', () => {
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
  });
});
