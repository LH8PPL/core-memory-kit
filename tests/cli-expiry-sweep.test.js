// @doors: 1, 2, 5
// Door 3 N/A: pure in-process file IO — no subprocess spawn, no LLM.
// Door 4 N/A: no message-queue interaction.
// Door 5: each expired fact tombstones through forget(), which appends the
//   standard `tombstoned` audit entry (deleted_by: expiry-sweep) — asserted
//   here so the sweep is never a silent mutation.

// Tests for Task 66.3 — the expires_at curate-time sweep (design §16.18 / D-258).
//
// Semantics under test (the D-258 settled calls):
//   - expires_at is the FIRST moment the fact no longer holds: now >= expires_at
//     → expired (exclusive-end, matching the ended_at convention).
//   - Expired facts are TOMBSTONED (audited, recoverable via
//     `cmk get --include-tombstoned`), never hard-deleted — mem0/graphiti
//     hide-don't-delete precedent + the kit's D-163 posture.
//   - The sweep touches ONLY expired facts (over-mutation guard).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFact } from '../packages/cli/src/write-fact.mjs';
import { sweepExpiredFacts } from '../packages/cli/src/expiry-sweep.mjs';
import { resolveFact } from '../packages/cli/src/forget.mjs';

const NOW = '2026-07-02T12:00:00Z';

function factOpts(overrides = {}) {
  return {
    tier: 'P',
    type: 'project',
    slug: 'sample',
    title: 'Sample fact',
    body: 'Some text content for the fact.',
    writeSource: 'user-explicit',
    trust: 'high',
    sourceFile: 'context/transcripts/2026-07-01.md',
    sourceLine: 1,
    sourceSha1: 'deadbeef0123456789abcdef0123456789abcdef',
    createdAt: '2026-07-01T09:00:00Z',
    ...overrides,
  };
}

describe('Task 66.3 — sweepExpiredFacts() boundary', () => {
  let sandbox;
  let projectRoot;
  let userDir;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'cmk-expiry-sweep-test-'));
    projectRoot = join(sandbox, 'proj');
    userDir = join(sandbox, 'user-tier');
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('tombstones a fact whose expires_at is in the past (Doors 1+2)', () => {
    const w = writeFact(
      factOpts({ projectRoot, slug: 'demo', body: 'Demo is Friday.', expiresAt: '2026-07-01' }),
    );
    const r = sweepExpiredFacts({ projectRoot, now: NOW });
    expect(r.action).toBe('swept');
    expect(r.count).toBe(1);
    expect(r.swept[0].id).toBe(w.id);
    // State: the live file is gone; the fact resolves as tombstoned (recoverable).
    expect(existsSync(w.path)).toBe(false);
    const resolved = resolveFact({ id: w.id, projectRoot });
    expect(resolved.state).toBe('tombstoned');
  });

  it('expiry is exclusive-end: expires_at exactly == now IS expired; a future date is NOT', () => {
    const atNow = writeFact(
      factOpts({ projectRoot, slug: 'at-now', body: 'Expires at noon.', expiresAt: NOW }),
    );
    const future = writeFact(
      factOpts({ projectRoot, slug: 'future', body: 'Expires tomorrow.', expiresAt: '2026-07-03T12:00:00Z' }),
    );
    const r = sweepExpiredFacts({ projectRoot, now: NOW });
    expect(r.count).toBe(1);
    expect(r.swept[0].id).toBe(atNow.id);
    expect(existsSync(future.path)).toBe(true);
  });

  it('over-mutation guard: facts with NO expires_at and future-dated ones are untouched (seed 3, sweep 1, 2 remain live)', () => {
    const permanent = writeFact(
      factOpts({ projectRoot, slug: 'permanent', body: 'We deploy to Cloud Run.' }),
    );
    const future = writeFact(
      factOpts({ projectRoot, slug: 'later', body: 'Conference in September.', expiresAt: '2026-09-30' }),
    );
    const expired = writeFact(
      factOpts({ projectRoot, slug: 'gone', body: 'Sprint review was Monday.', expiresAt: '2026-06-30' }),
    );
    const r = sweepExpiredFacts({ projectRoot, now: NOW });
    expect(r.count).toBe(1);
    expect(r.swept[0].id).toBe(expired.id);
    expect(existsSync(permanent.path)).toBe(true);
    expect(existsSync(future.path)).toBe(true);
    const livePermanent = readFileSync(permanent.path, 'utf8');
    expect(livePermanent).toContain('We deploy to Cloud Run.');
  });

  it('an already-tombstoned expired fact is not double-swept (idempotent re-run)', () => {
    writeFact(
      factOpts({ projectRoot, slug: 'demo', body: 'Demo is Friday.', expiresAt: '2026-07-01' }),
    );
    const first = sweepExpiredFacts({ projectRoot, now: NOW });
    expect(first.count).toBe(1);
    const second = sweepExpiredFacts({ projectRoot, now: NOW });
    expect(second.action).toBe('swept');
    expect(second.count).toBe(0);
  });

  it('sweeps the user tier when userDir is supplied', () => {
    const w = writeFact(
      factOpts({ tier: 'U', userDir, slug: 'u-fact', body: 'User-tier ephemeral.', expiresAt: '2026-07-01' }),
    );
    const r = sweepExpiredFacts({ projectRoot, userDir, now: NOW });
    expect(r.count).toBe(1);
    expect(existsSync(w.path)).toBe(false);
  });

  it('no facts / missing dirs → action swept, count 0 (graceful)', () => {
    const r = sweepExpiredFacts({ projectRoot, now: NOW });
    expect(r.action).toBe('swept');
    expect(r.count).toBe(0);
    expect(r.swept).toEqual([]);
  });

  it('Door 5: the tombstone lands in the audit log with deleted_by expiry-sweep + the expiry reason', () => {
    writeFact(
      factOpts({ projectRoot, slug: 'demo', body: 'Demo is Friday.', expiresAt: '2026-07-01' }),
    );
    sweepExpiredFacts({ projectRoot, now: NOW });
    const auditPath = join(projectRoot, 'context', '.locks', 'audit.log');
    expect(existsSync(auditPath)).toBe(true);
    const entries = readFileSync(auditPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    const tomb = entries.find((e) => e.action === 'tombstoned');
    expect(tomb).toBeDefined();
    expect(JSON.stringify(tomb)).toContain('expiry-sweep');
    expect(JSON.stringify(tomb)).toContain('2026-07-01');
  });

  it('a malformed expires_at in a hand-edited file is SKIPPED and reported, never fatal', () => {
    // Simulate a hand-edit that corrupted the field: write a valid fact, then
    // the sweep must not crash on (or sweep) an unparseable value.
    const good = writeFact(
      factOpts({ projectRoot, slug: 'good', body: 'Fine fact.', expiresAt: '2026-06-30' }),
    );
    const badPath = join(projectRoot, 'context', 'memory', 'project_bad.md');
    writeFileSync(
      badPath,
      ['---', 'id: P-BADEXPRY', 'type: project', 'title: Bad', 'expires_at: whenever', '---', '', 'Bad expiry.'].join('\n'),
      'utf8',
    );
    const r = sweepExpiredFacts({ projectRoot, now: NOW });
    expect(r.count).toBe(1); // only the good one swept
    expect(r.swept[0].id).toBe(good.id);
    expect(existsSync(badPath)).toBe(true); // never swept on a value it can't read
    expect(r.skipped_malformed).toBe(1);
  });
});
