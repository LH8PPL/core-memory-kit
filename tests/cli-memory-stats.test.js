// @doors: 1, 2
// Door 2: read-only over the existing logs — the ONE state assertion is that
//         computing a report never mutates them (report-only posture).
// Door 3 N/A: in-process; no subprocess spawn.
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: report-only — reads NDJSON logs, writes none.

// Task 212 — the memory-health behavioral dashboard (AutoMem's Figure-4
// indicator set; D-308). AGGREGATION ONLY: every number derives from logs the
// kit already writes (recall.log, audit.log, truncation.log) — no new capture,
// no LLM, REPORT-ONLY in v1 (observe before alarming; the D-169 no-ritual
// line). These are Task 194's tuning instrumentation: empty-search +
// redundant-write are the blend's before/after numbers.
//
// DISTINCT from Task 144's memory-health doctor section (content quality —
// stale/dups/queues over the fact ARCHIVE): this is PROCESS behavior over
// the activity LOGS. Module memory-stats.mjs; verb `cmk stats memory-health`.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  computeMemoryStats,
  renderMemoryStats,
} from '../packages/cli/src/memory-stats.mjs';

const NOW = '2026-07-14T00:00:00Z';
const DAY = 24 * 60 * 60 * 1000;

let sandbox;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-memstats-'));
  mkdirSync(join(sandbox, 'context', '.locks'), { recursive: true });
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

function iso(daysAgo, offsetMs = 0) {
  return new Date(Date.parse(NOW) - daysAgo * DAY + offsetMs).toISOString();
}

function writeNdjson(name, entries) {
  writeFileSync(
    join(sandbox, 'context', '.locks', name),
    entries.map((e) => JSON.stringify(e)).join('\n') + '\n',
    'utf8',
  );
}

function seedTypicalLogs() {
  // CURRENT window (≤7d ago): 4 searches (1 empty, recovered by a retry;
  // 1 repeated query), 6 writes, 2 redundant events, 1 truncation.
  writeNdjson('recall.log', [
    { session: 's2', ts: iso(2), source: 'inject', ids: ['P-AAAAAAAA'] },
    { session: null, ts: iso(2, 1000), source: 'search', query: 'deploy target', ids: ['P-AAAAAAAA'] },
    { session: null, ts: iso(2, 2000), source: 'search', query: 'redis cache', ids: [] }, // empty…
    { session: null, ts: iso(2, 60_000), source: 'search', query: 'cache layer redis', ids: ['P-BBBBBBBB'] }, // …recovered
    { session: null, ts: iso(1), source: 'search', query: 'deploy target', ids: ['P-AAAAAAAA'] }, // repeat
    // PREVIOUS window (7–14d ago): 2 searches, both non-empty, no repeats.
    { session: null, ts: iso(9), source: 'search', query: 'linter config', ids: ['P-CCCCCCCC'] },
    { session: null, ts: iso(10), source: 'search', query: 'test runner', ids: ['P-DDDDDDDD'] },
  ]);
  writeNdjson('audit.log', [
    // current window: 6 writes
    { ts: iso(1), action: 'appended', id: 'P-AAAAAAAA' },
    { ts: iso(1, 1000), action: 'appended', id: 'P-BBBBBBBB' },
    { ts: iso(2), action: 'created', id: 'P-CCCCCCCC' },
    { ts: iso(2, 1000), action: 'created', id: 'P-DDDDDDDD' },
    { ts: iso(3), action: 'replaced', id: 'P-EEEEEEEE' },
    { ts: iso(3, 1000), action: 'appended', id: 'P-FFFFFFFF' },
    // current window: 2 redundant events
    { ts: iso(1, 2000), action: 'recurrence', id: 'P-AAAAAAAA' },
    { ts: iso(2, 3000), action: 'queued', id: 'P-GGGGGGGG' },
    // previous window: 4 writes, 3 redundant (a WORSE prior week)
    { ts: iso(8), action: 'appended', id: 'P-HHHHHHHH' },
    { ts: iso(9), action: 'appended', id: 'P-JJJJJJJJ' },
    { ts: iso(10), action: 'created', id: 'P-KKKKKKKK' },
    { ts: iso(11), action: 'created', id: 'P-LLLLLLLL' },
    { ts: iso(9, 1000), action: 'recurrence', id: 'P-HHHHHHHH' },
    { ts: iso(10, 1000), action: 'merged', id: 'P-KKKKKKKK' },
    { ts: iso(11, 1000), action: 'temporal_supersede', id: 'P-LLLLLLLL' },
    // outside both windows — must not count anywhere
    { ts: iso(20), action: 'appended', id: 'P-MMMMMMMM' },
  ]);
  writeNdjson('truncation.log', [
    { ts: iso(2), event: 'tier_truncated_to_budget', tier: 'P', dropped_sections: [{ heading: 'x' }, { heading: 'y' }] },
    { ts: iso(9), event: 'tier_truncated_to_budget', tier: 'U', dropped_sections: [{ heading: 'z' }] },
  ]);
}

describe('Task 212 — computeMemoryStats (aggregation over existing logs)', () => {
  it('computes the v1 metric set for the current window', () => {
    seedTypicalLogs();
    const r = computeMemoryStats({ projectRoot: sandbox, now: NOW });
    expect(r.windowDays).toBe(7);
    expect(r.current.searches).toBe(4);
    expect(r.current.emptySearches).toBe(1);
    expect(r.current.emptySearchesRecovered).toBe(1); // the retry hit
    expect(r.current.repeatedSearches).toBe(1); // 'deploy target' twice
    expect(r.current.writes).toBe(6);
    expect(r.current.writesPerSearch).toBeCloseTo(6 / 4, 5);
    expect(r.current.redundantEvents).toBe(2);
    expect(r.current.redundantWriteRate).toBeCloseTo(2 / 6, 5);
    expect(r.current.truncationEvents).toBe(1);
    expect(r.current.droppedSections).toBe(2);
  });

  it('computes the PREVIOUS window independently (the trend baseline)', () => {
    seedTypicalLogs();
    const r = computeMemoryStats({ projectRoot: sandbox, now: NOW });
    expect(r.previous.searches).toBe(2);
    expect(r.previous.emptySearches).toBe(0);
    expect(r.previous.writes).toBe(4);
    expect(r.previous.redundantEvents).toBe(3);
    expect(r.previous.truncationEvents).toBe(1);
    // The 20d-old write is in NEITHER window.
    expect(r.current.writes + r.previous.writes).toBe(10);
  });

  it('trend arrows: lower-is-better rates falling read as improving', () => {
    seedTypicalLogs();
    const r = computeMemoryStats({ projectRoot: sandbox, now: NOW });
    // redundant rate: 3/4=0.75 → 2/6≈0.33 — down (improving).
    expect(r.trends.redundantWriteRate).toBe('down');
    // writes-per-search: 4/2=2.0 → 6/4=1.5 — down.
    expect(r.trends.writesPerSearch).toBe('down');
    // empty rate: 0 → 0.25 — up (worse).
    expect(r.trends.emptySearchRate).toBe('up');
  });

  it('is total on an empty project: zero logs → zero metrics, never a throw', () => {
    const r = computeMemoryStats({ projectRoot: sandbox, now: NOW });
    expect(r.current.searches).toBe(0);
    expect(r.current.writes).toBe(0);
    expect(r.current.writesPerSearch).toBe(0);
    expect(r.trends.writesPerSearch).toBe('flat');
  });

  it('a corrupt NDJSON line is skipped, not fatal (log-reader posture)', () => {
    writeFileSync(
      join(sandbox, 'context', '.locks', 'audit.log'),
      '{"ts":"' + iso(1) + '","action":"appended","id":"P-AAAAAAAA"}\n{BROKEN LINE\n',
      'utf8',
    );
    const r = computeMemoryStats({ projectRoot: sandbox, now: NOW });
    expect(r.current.writes).toBe(1);
  });

  it('30-day window honors windowDays (the 7/30 spec knob)', () => {
    seedTypicalLogs();
    const r = computeMemoryStats({ projectRoot: sandbox, now: NOW, windowDays: 30 });
    // Everything ≤30d falls into current (incl. the 20d-old write).
    expect(r.current.writes).toBe(11);
    expect(r.current.searches).toBe(6);
  });

  it('REPORT-ONLY: computing never mutates the logs (Door 2)', () => {
    seedTypicalLogs();
    const before = readFileSync(join(sandbox, 'context', '.locks', 'audit.log'), 'utf8');
    computeMemoryStats({ projectRoot: sandbox, now: NOW });
    expect(readFileSync(join(sandbox, 'context', '.locks', 'audit.log'), 'utf8')).toBe(before);
  });
});

describe('Task 212 — the CLI surface (cmk stats memory-health)', () => {
  it('runStatsMemoryHealth renders the report through injected deps (the Task-113 pattern)', async () => {
    const { runStatsMemoryHealth } = await import('../packages/cli/src/subcommands.mjs');
    seedTypicalLogs();
    const lines = [];
    const report = runStatsMemoryHealth({}, undefined, {
      projectRoot: sandbox,
      log: (l) => lines.push(l),
      // inject the clock like every computeMemoryStats test — without this the
      // fixed-date fixtures age out of the real-now window (the D-351 time bomb)
      now: NOW,
    });
    expect(report.current.writes).toBe(6);
    expect(lines.join('\n')).toMatch(/writes-per-search/);
  });

  it('rejects a bad --window with exit 2 (closed validation)', async () => {
    const { runStatsMemoryHealth } = await import('../packages/cli/src/subcommands.mjs');
    const errors = [];
    const prevExit = process.exitCode;
    try {
      runStatsMemoryHealth({ window: 'lots' }, undefined, {
        projectRoot: sandbox,
        log: () => {},
        logError: (e) => errors.push(e),
      });
      expect(process.exitCode).toBe(2);
      expect(errors.join(' ')).toMatch(/--window/);
    } finally {
      process.exitCode = prevExit;
    }
  });
});

describe('Task 212 — renderMemoryStats (the report surface)', () => {
  it('renders every v1 metric with a trend arrow vs the prior window — and no pass/fail language', () => {
    seedTypicalLogs();
    const r = computeMemoryStats({ projectRoot: sandbox, now: NOW });
    const text = renderMemoryStats(r).join('\n');
    expect(text).toMatch(/writes-per-search/i);
    expect(text).toMatch(/empty-search/i);
    expect(text).toMatch(/redundant-write/i);
    expect(text).toMatch(/repeated identical search/i);
    expect(text).toMatch(/snapshot/i);
    expect(text).toMatch(/[↑↓→]/); // trend arrows present
    // Report-only in v1: no FAIL/PASS verdicts (observe before alarming).
    expect(text).not.toMatch(/\bFAIL\b|\bPASS\b/);
  });

  it('renders honestly on an empty project (zeros, no arrows pretending movement)', () => {
    const r = computeMemoryStats({ projectRoot: sandbox, now: NOW });
    const text = renderMemoryStats(r).join('\n');
    expect(text).toMatch(/0/);
    expect(text).not.toMatch(/NaN|Infinity/);
  });
});
