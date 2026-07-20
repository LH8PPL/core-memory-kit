// @doors: 1, 2, 3
// Door 1 (Response): findBackfillGaps / runBackfill return the gap list + outcome.
// Door 2 (State): a reconstructed today-{date}.md lands, marked as backfilled.
// Door 3 (External calls): git log is shelled out; the summarize backend is injected.
// Door 4 N/A: no message-queue surface.
// Door 5 N/A: backfill reports through its result + the day file; the distill log
//   covers the cron leg (asserted in cli-daily-distill).
//
// Task 174 (D-372) — git-history backfill.
//
// THE GAP, measured on this repo before building: 15 of 40 dogfood days (37.5%)
// have commits but NO session record. `daily-distill` only compresses what is
// already in now.md; nothing ever goes back and fills a day the Stop hook
// missed (a crash, a day worked in another tool, a hook misfire). Those days
// are durable work the memory has no record of.
//
// THE BINDING CRITERION (D-169): the backfill must happen with NO user command.
// The cron sweep is the deliverable; `cmk backfill` is only the manual override.
// A test that only exercises the verb would mask exactly the failure D-169 names.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  findBackfillGaps,
  runBackfill,
  BACKFILL_MARKER,
} from '../packages/cli/src/backfill.mjs';
import { dailyDistill } from '../packages/cli/src/daily-distill.mjs';

let sandbox;
let projectRoot;

function git(...args) {
  return execFileSync('git', args, { cwd: projectRoot, encoding: 'utf8', windowsHide: true });
}

// Commit on a specific date so git log has a day to find.
function commitOn(isoDate, message) {
  const stamp = `${isoDate}T12:00:00`;
  writeFileSync(join(projectRoot, `f-${isoDate}-${Math.random().toString(36).slice(2, 7)}.txt`), message);
  git('add', '-A');
  execFileSync('git', ['commit', '-m', message], {
    cwd: projectRoot,
    encoding: 'utf8',
    windowsHide: true,
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: stamp,
      GIT_COMMITTER_DATE: stamp,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 't@example.invalid',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 't@example.invalid',
    },
  });
}

function seedDayFile(date, body) {
  writeFileSync(join(projectRoot, 'context', 'sessions', `today-${date}.md`), body, 'utf8');
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-backfill-'));
  projectRoot = join(sandbox, 'proj');
  mkdirSync(join(projectRoot, 'context', 'sessions'), { recursive: true });
  mkdirSync(join(projectRoot, 'context', '.locks'), { recursive: true });
  git('init', '-q');
  git('config', 'user.email', 't@example.invalid');
  git('config', 'user.name', 'Test');
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

describe('Task 174 — gap detection', () => {
  it('finds a day with commits but NO session log', () => {
    commitOn('2026-07-01', 'feat: the thing');
    const gaps = findBackfillGaps({ projectRoot, windowDays: 3650 });
    expect(gaps.map((g) => g.date)).toContain('2026-07-01');
  });

  it('does NOT flag a day that already has a real session log', () => {
    commitOn('2026-07-02', 'feat: covered');
    seedDayFile('2026-07-02', '## Decisions\n- already captured live\n');
    const gaps = findBackfillGaps({ projectRoot, windowDays: 3650 });
    expect(gaps.map((g) => g.date)).not.toContain('2026-07-02');
  });

  it('is BOUNDED by the window — ancient history is not swept', () => {
    commitOn('2020-01-01', 'feat: ancient');
    const gaps = findBackfillGaps({ projectRoot, windowDays: 7 });
    expect(gaps.map((g) => g.date)).not.toContain('2020-01-01');
  });

  it('a repo with no commits yields no gaps (and does not throw)', () => {
    expect(findBackfillGaps({ projectRoot, windowDays: 30 })).toEqual([]);
  });

  it('a non-git directory degrades to empty, never throws (fail-open)', () => {
    const plain = join(sandbox, 'plain');
    mkdirSync(join(plain, 'context', 'sessions'), { recursive: true });
    expect(findBackfillGaps({ projectRoot: plain, windowDays: 30 })).toEqual([]);
  });
});

describe('Task 174 — reconstruction', () => {
  const backend = {
    compress: async () => '## Decisions\n- reconstructed: shipped the parser\n',
  };

  it('writes a today-{date}.md for the gap day, MARKED as backfilled', async () => {
    commitOn('2026-07-03', 'feat: shipped the parser');
    const r = await runBackfill({ projectRoot, backend, windowDays: 3650 });

    expect(r.backfilled).toContain('2026-07-03');
    const p = join(projectRoot, 'context', 'sessions', 'today-2026-07-03.md');
    expect(existsSync(p)).toBe(true);
    const body = readFileSync(p, 'utf8');
    expect(body).toContain('reconstructed');
    // HONEST provenance: this is not a real captured session.
    expect(body, 'a reconstruction must say it is one').toContain(BACKFILL_MARKER);
  });

  it('NEVER overwrites a real session log (real > backfilled, always)', async () => {
    commitOn('2026-07-04', 'feat: x');
    seedDayFile('2026-07-04', '## Decisions\n- THE REAL CAPTURE\n');
    const before = readFileSync(join(projectRoot, 'context', 'sessions', 'today-2026-07-04.md'), 'utf8');

    await runBackfill({ projectRoot, backend, windowDays: 3650 });

    const after = readFileSync(join(projectRoot, 'context', 'sessions', 'today-2026-07-04.md'), 'utf8');
    expect(after, 'a real log must survive byte-identical').toBe(before);
    expect(after).not.toContain(BACKFILL_MARKER);
  });

  it('is IDEMPOTENT — a second run does not double-write a backfilled day', async () => {
    commitOn('2026-07-05', 'feat: y');
    await runBackfill({ projectRoot, backend, windowDays: 3650 });
    const first = readFileSync(join(projectRoot, 'context', 'sessions', 'today-2026-07-05.md'), 'utf8');

    const second = await runBackfill({ projectRoot, backend, windowDays: 3650 });
    const after = readFileSync(join(projectRoot, 'context', 'sessions', 'today-2026-07-05.md'), 'utf8');

    expect(after).toBe(first);
    expect(second.backfilled, 'an already-backfilled day is not a gap').not.toContain('2026-07-05');
  });

  it('a backend failure leaves NO half-written day file (never a lie on disk)', async () => {
    commitOn('2026-07-06', 'feat: z');
    const failing = { compress: async () => { throw new Error('haiku down'); } };
    const r = await runBackfill({ projectRoot, backend: failing, windowDays: 3650 });
    expect(existsSync(join(projectRoot, 'context', 'sessions', 'today-2026-07-06.md'))).toBe(false);
    expect(r.failed).toContain('2026-07-06');
  });

  it('bounds work per run so a long-neglected repo cannot stall the cron', async () => {
    for (const d of ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05']) {
      commitOn(d, `feat: ${d}`);
    }
    const r = await runBackfill({ projectRoot, backend, windowDays: 3650, maxPerRun: 2 });
    expect(r.backfilled.length).toBeLessThanOrEqual(2);
    expect(r.remaining, 'the caller must know work is left').toBeGreaterThan(0);
  });
});

describe('Task 174 — THE automatic path (D-169): no command run', () => {
  it('the daily-distill cron fills the gap by itself — `cmk backfill` never invoked', async () => {
    // THE done-criterion. A test that only drove runBackfill() would prove the
    // VERB works while the automatic path stayed dead — precisely the D-169
    // failure (a capability whose only route is a command a user must remember).
    commitOn('2026-07-07', 'feat: shipped without a session log');
    const backend = { compress: async () => '## Decisions\n- reconstructed by the cron\n' };

    await dailyDistill({ projectRoot, backend });

    const p = join(projectRoot, 'context', 'sessions', 'today-2026-07-07.md');
    expect(existsSync(p), 'the cron must fill the gap with no user command').toBe(true);
    expect(readFileSync(p, 'utf8')).toContain(BACKFILL_MARKER);
  });

  it('a backfill failure never wedges the distill (fail-open on the cron path)', async () => {
    commitOn('2026-07-08', 'feat: q');
    const exploding = { compress: async () => { throw new Error('backend down'); } };
    // Must not throw — the cron's primary job survives a backfill problem.
    await expect(dailyDistill({ projectRoot, backend: exploding })).resolves.toBeDefined();
  });
});
