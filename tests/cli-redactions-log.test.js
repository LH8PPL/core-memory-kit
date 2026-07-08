// @doors: 1, 2, 5
// Door 3 N/A: no subprocess — filesystem appends only.
// Door 4 N/A: no message-queue interaction.
// Door 5: the log ITSELF is the observability surface — shape asserted here.
//
// Tests for Task 148.6 (ADR-0019, design §6.10) — the redactions recovery log.
// Boundary: appendRedactions / readRedactionsLog / redactionsLogPath.
// The contract: every L1/L3 redaction records original→placeholder in a
// GITIGNORED NDJSON log under context/.locks/ — the ONE place originals
// survive (machine-local, never committed), so a false positive is locally
// recoverable. Best-effort append (hook-path safety: never throws);
// corrupt-tolerant read (an interrupted append must not poison the log).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  appendRedactions,
  readRedactionsLog,
  redactionsLogPath,
} from '../packages/cli/src/redactions-log.mjs';

let projectRoot;

beforeEach(() => {
  projectRoot = mkdtempSync(join(tmpdir(), 'cmk-redlog-'));
});

afterEach(() => {
  try {
    rmSync(projectRoot, { recursive: true, force: true });
  } catch {
    /* Windows EPERM drain — the tmpdir reaper gets it */
  }
});

describe('Task 148.6 — redactions.log (Doors 1+2+5)', () => {
  it('appends one NDJSON line per redaction batch with ts/source/entries (Door 2+5)', () => {
    const res = appendRedactions(projectRoot, {
      source: 'transcript-live:2026-07-07',
      layer: 'L1',
      redactions: [
        { category: 'EMAIL', placeholder: '«EMAIL»', original: 'someuser@gmail.com' },
      ],
    });
    expect(res.ok).toBe(true);
    const raw = readFileSync(redactionsLogPath(projectRoot), 'utf8').trim();
    const entry = JSON.parse(raw);
    expect(entry.source).toBe('transcript-live:2026-07-07');
    expect(entry.layer).toBe('L1');
    expect(entry.redactions[0]).toEqual({
      category: 'EMAIL',
      placeholder: '«EMAIL»',
      original: 'someuser@gmail.com',
    });
    expect(typeof entry.ts).toBe('string');
  });

  it('no-ops (ok:true, nothing written) on an empty redactions array — clean turns cost nothing', () => {
    const res = appendRedactions(projectRoot, { source: 'x', layer: 'L1', redactions: [] });
    expect(res.ok).toBe(true);
    expect(existsSync(redactionsLogPath(projectRoot))).toBe(false);
  });

  it('is best-effort: an unwritable path returns ok:false, never throws (hook-path safety)', () => {
    // a projectRoot whose context/.locks cannot be created (a FILE in the way)
    mkdirSync(join(projectRoot, 'context'), { recursive: true });
    writeFileSync(join(projectRoot, 'context', '.locks'), 'a file, not a dir', 'utf8');
    const res = appendRedactions(projectRoot, {
      source: 'x',
      layer: 'L1',
      redactions: [{ category: 'EMAIL', placeholder: '«EMAIL»', original: 'a@b.co' }],
    });
    expect(res.ok).toBe(false);
  });

  it('readRedactionsLog returns oldest-first and skips corrupt lines (Door 1)', () => {
    appendRedactions(projectRoot, {
      source: 's1',
      layer: 'L1',
      redactions: [{ category: 'EMAIL', placeholder: '«EMAIL»', original: 'a@b.co' }],
    });
    // simulate an interrupted append (a torn line terminated by the next write's newline)
    writeFileSync(redactionsLogPath(projectRoot), readFileSync(redactionsLogPath(projectRoot), 'utf8') + '{"broken\n', 'utf8');
    appendRedactions(projectRoot, {
      source: 's2',
      layer: 'L3',
      redactions: [{ category: 'JUDGE', placeholder: '«NAME»', original: 'A Person' }],
    });
    const entries = readRedactionsLog(projectRoot);
    expect(entries).toHaveLength(2);
    expect(entries[0].source).toBe('s1');
    expect(entries[1].source).toBe('s2');
    expect(entries[1].layer).toBe('L3');
  });

  it('readRedactionsLog on a missing log returns [] (fresh install)', () => {
    expect(readRedactionsLog(projectRoot)).toEqual([]);
  });
});
