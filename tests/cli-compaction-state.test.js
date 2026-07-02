// @doors: 1, 2
// Door 3 N/A: isCompactionNeeded/recordCronHeartbeat do pure file I/O (stat/write) — no subprocess, no spawn.
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: this module writes no NDJSON/observability log — the verdict is computed + the heartbeat stamped, both pure file ops; the lazy-roll/sync-drain observability is tested in cli-lazy-compress.test.js.

// Tests for Task 167 — the compaction-state deep module (D-206/D-207).
// The module owns the compaction verdict + cron-liveness:
//   isCompactionNeeded({projectRoot, now, dailyTtlMs?, weeklyTtlMs?})
//     → {verdict, cronStale, heartbeatAge}
//   recordCronHeartbeat({projectRoot, now})  — the ONLY writer; cron bins call per fire
//
// The PRIMARY bug (167.A): the old detectStaleness short-circuited to 'cron-active'
// on the mere EXISTENCE of the cron-registered sentinel — so a registered-but-dead
// cron (never fired) disabled the lazy roll forever and now.md grew unbounded.
// The fix: gate cron-active on heartbeat FRESHNESS (age), not existence.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  isCompactionNeeded,
  recordCronHeartbeat,
  cronHeartbeatPath,
} from '../packages/cli/src/compaction-state.mjs';

let sandbox;
let projectRoot;

const DAY_MS = 24 * 60 * 60 * 1000;

function sessionsDir() {
  return join(projectRoot, 'context', 'sessions');
}

function writeNow(content) {
  writeFileSync(join(sessionsDir(), 'now.md'), content, 'utf8');
}

function writeRecent(content, ageMs = 0, now = Date.now()) {
  const p = join(sessionsDir(), 'recent.md');
  writeFileSync(p, content, 'utf8');
  if (ageMs) {
    const t = new Date(now - ageMs);
    utimesSync(p, t, t);
  }
}

function writeTodayFile(dateStr) {
  writeFileSync(join(sessionsDir(), `today-${dateStr}.md`), '## Decisions\n\n- x\n', 'utf8');
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-compaction-state-'));
  projectRoot = join(sandbox, 'proj');
  mkdirSync(sessionsDir(), { recursive: true });
  mkdirSync(join(projectRoot, 'context', '.locks'), { recursive: true });
});

afterEach(() => {
  try {
    rmSync(sandbox, { recursive: true, force: true });
  } catch {
    // best-effort
  }
});

describe('recordCronHeartbeat (Door 2: state)', () => {
  it('writes the heartbeat stamp at the resolved path', () => {
    const now = '2026-06-25T12:00:00Z';
    recordCronHeartbeat({ projectRoot, now });
    expect(existsSync(cronHeartbeatPath(projectRoot))).toBe(true);
  });

  it('is a no-op when projectRoot is missing (no throw)', () => {
    expect(() => recordCronHeartbeat({ projectRoot: undefined, now: '2026-06-25T12:00:00Z' })).not.toThrow();
  });

  it('refreshes the stamp mtime on a second call', () => {
    const t0 = Date.now() - 5 * DAY_MS;
    recordCronHeartbeat({ projectRoot, now: new Date(t0).toISOString() });
    const firstMtime = statSync(cronHeartbeatPath(projectRoot)).mtimeMs;
    recordCronHeartbeat({ projectRoot, now: new Date(Date.now()).toISOString() });
    const secondMtime = statSync(cronHeartbeatPath(projectRoot)).mtimeMs;
    expect(secondMtime).toBeGreaterThan(firstMtime);
  });
});

describe('isCompactionNeeded — the cron-liveness gate (167.A, the PRIMARY bug)', () => {
  it('RED→GREEN: a STALE heartbeat + non-empty now.md → stale-now (rolls), NOT cron-active', () => {
    // The exact trap state: cron "registered" (heartbeat exists) but DEAD (old),
    // and now.md has un-rolled content. The old code returned cron-active here and
    // skipped forever. The fix must return stale-now so the lazy roll fires.
    const now = '2026-06-25T12:00:00Z';
    recordCronHeartbeat({ projectRoot, now: '2026-06-20T12:00:00Z' }); // 5 days stale
    writeNow('## prior session content\n\nlots of turns\n');

    const result = isCompactionNeeded({ projectRoot, now });
    expect(result.verdict).toBe('stale-now');
    expect(result.cronStale).toBe(true);
  });

  it('a FRESH heartbeat + EMPTY now.md → cron-active (the cron owns daily/weekly; lazy skips)', () => {
    // A fresh cron defers the DAILY/WEEKLY rolls — but NOT the now→today roll
    // (that's the SessionEnd/lazy path, never the cron). So cron-active requires
    // an empty now.md; a non-empty now.md is always stale-now (see the test below).
    const now = Date.parse('2026-06-25T12:00:00Z');
    recordCronHeartbeat({ projectRoot, now: '2026-06-25T11:00:00Z' }); // 1h old = fresh
    writeNow(''); // nothing to roll now
    writeTodayFile('2026-06-25'); // there IS daily/weekly input the cron would own

    const result = isCompactionNeeded({ projectRoot, now: new Date(now).toISOString() });
    expect(result.verdict).toBe('cron-active');
    expect(result.cronStale).toBe(false);
  });

  it('a FRESH heartbeat does NOT suppress a stale-now roll (Q4: correctness over deferral)', () => {
    // The now→today roll is the lazy path's job even when a live cron exists —
    // un-rolled prior-session content must drain THIS session.
    const now = '2026-06-25T12:00:00Z';
    recordCronHeartbeat({ projectRoot, now: '2026-06-25T11:00:00Z' }); // fresh
    writeNow('## prior session content\n');

    const result = isCompactionNeeded({ projectRoot, now });
    expect(result.verdict).toBe('stale-now');
    expect(result.cronStale).toBe(false); // cron is alive, just not its job
  });

  it('NO heartbeat (no cron registered) → derives normally (stale-now on bloat), cronStale false', () => {
    // The default user: no cron → no heartbeat → the lazy roll is the floor.
    const now = '2026-06-25T12:00:00Z';
    writeNow('## prior session content\n');

    const result = isCompactionNeeded({ projectRoot, now });
    expect(result.verdict).toBe('stale-now');
    expect(result.cronStale).toBe(false); // no cron registered ≠ a dead cron
  });

  it('reports heartbeatAge for a registered cron (the rich return, Q3)', () => {
    const now = '2026-06-25T12:00:00Z';
    recordCronHeartbeat({ projectRoot, now: '2026-06-20T12:00:00Z' }); // 5 days
    writeNow('content\n');

    const result = isCompactionNeeded({ projectRoot, now });
    expect(result.heartbeatAge).toBeGreaterThan(4 * DAY_MS);
    expect(result.heartbeatAge).toBeLessThan(6 * DAY_MS);
  });

  it('heartbeatAge is null when no cron is registered', () => {
    const result = isCompactionNeeded({ projectRoot, now: '2026-06-25T12:00:00Z' });
    expect(result.heartbeatAge).toBeNull();
  });
});

describe('isCompactionNeeded — the derived verdicts (KEPT from detectStaleness)', () => {
  it('empty now.md + fresh recent.md → fresh', () => {
    // Fixed clock like every sibling test — the original `Date.now()` mixed a REAL
    // wall-clock with the hardcoded today-file date below, a time-bomb that detonated
    // 2026-07-02 (7d after the fixture date → stale-weekly). The D-52 class.
    const now = Date.parse('2026-06-25T12:00:00Z');
    writeNow('');
    writeRecent('## recent\n', 1 * 60 * 60 * 1000, now); // 1h old
    writeTodayFile('2026-06-25');
    const result = isCompactionNeeded({ projectRoot, now: new Date(now).toISOString() });
    expect(result.verdict).toBe('fresh');
  });

  it('an OLD today-*.md (>7d) → stale-weekly', () => {
    const now = Date.parse('2026-06-25T12:00:00Z');
    writeNow('');
    writeTodayFile('2026-06-10'); // 15 days old
    const result = isCompactionNeeded({ projectRoot, now: new Date(now).toISOString() });
    expect(result.verdict).toBe('stale-weekly');
  });

  it('no context dir → no-context-dir', () => {
    rmSync(sessionsDir(), { recursive: true, force: true });
    const result = isCompactionNeeded({ projectRoot, now: '2026-06-25T12:00:00Z' });
    expect(result.verdict).toBe('no-context-dir');
  });

  it('missing projectRoot → no-context-dir (defensive)', () => {
    const result = isCompactionNeeded({ projectRoot: undefined, now: '2026-06-25T12:00:00Z' });
    expect(result.verdict).toBe('no-context-dir');
  });
});
