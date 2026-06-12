// @doors: 1, 2
// Door 2: the CLI runner reads real .extract.log files from a sandbox dir.
// Door 3 N/A: no subprocess.
// Door 4 N/A: no message-queue.
// Door 5 N/A: the script's report IS the observability surface (stdout), pinned via Door 1.
//
// Task 137.5 — live-test trend thresholds (the D-122 class).
// The dedup self-poisoning bug suppressed organic capture for ~10 releases
// because every per-turn outcome looked individually plausible: a single
// `nothing_durable` skip is normal; 90%+ of substantive turns skipping is the
// fingerprint of a systemic suppressor. Lenient per-turn pass-bars tolerate
// stochastic masking — only the TREND exposes it. This script turns the trend
// into a checkable gate step: read extract.log entries, compute the
// nothing_durable rate over substantive turns, fail above the threshold.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyzeExtractTrend, runExtractTrend } from '../scripts/extract-trend.mjs';

const extractEntry = (over = {}) => ({
  phase: 'extract',
  success: true,
  observation_count: 1,
  ...over,
});

describe('Task 137.5 — analyzeExtractTrend (pure)', () => {
  it('computes the nothing_durable rate over extract-phase entries only', () => {
    const entries = [
      extractEntry(),
      extractEntry({ skipped_reason: 'nothing_durable', observation_count: 0 }),
      extractEntry({ skipped_reason: 'nothing_durable', observation_count: 0 }),
      // spawn-phase entries are a different surface — never counted
      { phase: 'spawn', success: false },
      // non-judgment skips (lock contention etc.) are not the model's call —
      // they say nothing about extraction quality, so they're excluded too
      extractEntry({ skipped_reason: 'concurrent_run', observation_count: 0 }),
      // ERROR entries (timeout/spawn trouble) are not judgments either —
      // counting them would dilute the rate exactly when capture is sickest
      extractEntry({ success: false, error_category: 'haiku_timeout', observation_count: 0 }),
    ];
    const r = analyzeExtractTrend(entries, { threshold: 0.8 });
    expect(r.substantive).toBe(3);
    expect(r.nothingDurable).toBe(2);
    expect(r.rate).toBeCloseTo(2 / 3);
    expect(r.pass).toBe(true);
  });

  it('fails above the threshold (the D-122 fingerprint)', () => {
    const entries = [
      extractEntry({ skipped_reason: 'nothing_durable', observation_count: 0 }),
      extractEntry({ skipped_reason: 'nothing_durable', observation_count: 0 }),
      extractEntry({ skipped_reason: 'nothing_durable', observation_count: 0 }),
      extractEntry({ skipped_reason: 'nothing_durable', observation_count: 0 }),
      extractEntry(),
    ];
    const r = analyzeExtractTrend(entries, { threshold: 0.8 });
    expect(r.rate).toBeCloseTo(0.8);
    expect(r.pass).toBe(false); // >= threshold fails — 4/5 IS the fingerprint
  });

  it('too few entries → inconclusive pass (a 1-turn sample is not a trend)', () => {
    const r = analyzeExtractTrend(
      [extractEntry({ skipped_reason: 'nothing_durable', observation_count: 0 })],
      { threshold: 0.8, minSample: 5 },
    );
    expect(r.pass).toBe(true);
    expect(r.inconclusive).toBe(true);
  });
});

describe('Task 137.5 — runExtractTrend (the gate-step runner)', () => {
  let sandbox;
  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'cmk-extract-trend-'));
  });
  afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

  function seedLog(name, entries) {
    mkdirSync(sandbox, { recursive: true });
    writeFileSync(
      join(sandbox, name),
      entries.map((e) => JSON.stringify(e)).join('\n') + '\n',
      'utf8',
    );
  }

  it('reads every *.extract.log in the dir, reports, exits pass under the threshold', () => {
    seedLog('2026-06-12.extract.log', [
      extractEntry(),
      extractEntry(),
      extractEntry({ skipped_reason: 'nothing_durable', observation_count: 0 }),
    ]);
    seedLog('2026-06-11.extract.log', [extractEntry(), extractEntry(), extractEntry()]);
    const out = [];
    const r = runExtractTrend({ dir: sandbox, threshold: 0.8, minSample: 3, log: (m) => out.push(String(m)) });
    expect(r.pass).toBe(true);
    expect(r.substantive).toBe(6);
    expect(out.join('\n')).toMatch(/nothing_durable rate/i);
  });

  it('fails (exit-style result) when the dir trend crosses the threshold', () => {
    seedLog('2026-06-12.extract.log', Array.from({ length: 10 }, () =>
      extractEntry({ skipped_reason: 'nothing_durable', observation_count: 0 }),
    ));
    const out = [];
    const r = runExtractTrend({ dir: sandbox, threshold: 0.8, minSample: 5, log: (m) => out.push(String(m)) });
    expect(r.pass).toBe(false);
    expect(out.join('\n')).toMatch(/FAIL/);
  });

  it('no log files → inconclusive pass with an honest note', () => {
    const out = [];
    const r = runExtractTrend({ dir: sandbox, threshold: 0.8, log: (m) => out.push(String(m)) });
    expect(r.pass).toBe(true);
    expect(r.inconclusive).toBe(true);
    expect(out.join('\n')).toMatch(/no extract\.log|inconclusive/i);
  });
});
