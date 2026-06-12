// @doors: 1, 2
// Door 2: reads real fact files + audit.log + queue files from a sandboxed install.
// Door 3 N/A: pure reads, no subprocess.
// Door 4 N/A: no message-queue.
// Door 5 N/A: read-only analysis — deliberately writes no log (the report IS the output).
//
// Task 144 (D-130) — `cmk doctor` memory-HEALTH section: content quality,
// not just plumbing. Read-only stats over existing files + logs:
// "42 facts: 3 old-and-untouched, 2 possible duplicates, 1 conflict pending"
// makes curation visible before Task 95 automates it.
//
// SPEC DEVIATION (documented in tasks.md): the task entry assumed "the audit
// log has every recall" — it does not (the audit log is MUTATIONS-only by
// design; search/get/cite write nothing). "Stale" is therefore defined
// honestly as OLD-AND-UNTOUCHED: created > N days ago with no audit-trail
// mutation since. Recall-tracking is parked with a trigger (Task 95).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyzeMemoryHealth, formatMemoryHealth } from '../packages/cli/src/memory-health.mjs';
import { install } from '../packages/cli/src/install.mjs';
import { writeFact } from '../packages/cli/src/write-fact.mjs';

let sandbox;
let projectRoot;
let userDir;

const NOW = '2026-06-12T12:00:00Z';

beforeEach(async () => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-memory-health-'));
  projectRoot = join(sandbox, 'proj');
  userDir = join(sandbox, 'user');
  await install({ projectRoot, userTier: userDir });
});

afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

function seedFact({ slug, body, type = 'project', trust = 'medium', createdAt }) {
  const r = writeFact({
    tier: 'P',
    type,
    slug,
    title: slug,
    body,
    writeSource: 'user-explicit',
    trust,
    sourceFile: 'test',
    sourceLine: 1,
    sourceSha1: 'abc',
    projectRoot,
    createdAt,
  });
  expect(r.action).toBe('created');
  return r;
}

describe('Task 144 — analyzeMemoryHealth (Doors 1+2)', () => {
  it('counts facts by type and trust', () => {
    seedFact({ slug: 'alpha', body: 'the deploy gate runs before release', type: 'project', trust: 'high' });
    seedFact({ slug: 'beta', body: 'the user prefers terse answers always', type: 'user', trust: 'medium' });
    const h = analyzeMemoryHealth({ projectRoot, now: NOW });
    expect(h.facts.total).toBe(2);
    expect(h.facts.byType.project).toBe(1);
    expect(h.facts.byType.user).toBe(1);
    expect(h.facts.byTrust.high).toBe(1);
    expect(h.facts.byTrust.medium).toBe(1);
  });

  it('flags OLD-AND-UNTOUCHED facts (created > N days, no audit mutation since)', () => {
    seedFact({ slug: 'ancient', body: 'an old fact nobody touched since spring', createdAt: '2026-03-01T00:00:00Z' });
    seedFact({ slug: 'fresh', body: 'a fact captured this very week again', createdAt: '2026-06-10T00:00:00Z' });
    const h = analyzeMemoryHealth({ projectRoot, now: NOW, staleDays: 60 });
    expect(h.oldUntouched.length).toBe(1);
    expect(h.oldUntouched[0].slug).toContain('ancient');
  });

  it('a post-creation audit mutation rescues a fact from the old-untouched list', () => {
    const r = seedFact({ slug: 'ancient-but-trusted', body: 'an old fact the user re-trusted later on', createdAt: '2026-03-01T00:00:00Z' });
    // Simulate a later mutation touching the fact (e.g. cmk trust).
    const auditPath = join(projectRoot, 'context', '.locks', 'audit.log');
    mkdirSync(join(projectRoot, 'context', '.locks'), { recursive: true });
    writeFileSync(
      auditPath,
      JSON.stringify({ schema: 1, ts: '2026-06-01T00:00:00Z', action: 'trust', tier: 'P', id: r.id, reasonCode: 'trust-override' }) + '\n',
      'utf8',
    );
    const h = analyzeMemoryHealth({ projectRoot, now: NOW, staleDays: 60 });
    expect(h.oldUntouched.length).toBe(0);
  });

  it('surfaces near-duplicate candidate pairs via token overlap (never auto-drops)', () => {
    seedFact({ slug: 'uv-rule-a', body: 'always use uv for python package management never pip' });
    seedFact({ slug: 'uv-rule-b', body: 'use uv for python package management, never use pip' });
    seedFact({ slug: 'unrelated', body: 'the staging cluster deploys from the release branch weekly' });
    const h = analyzeMemoryHealth({ projectRoot, now: NOW });
    expect(h.nearDupPairs.length).toBe(1);
    const pair = h.nearDupPairs[0];
    expect(pair.a + pair.b).toContain('uv-rule');
  });

  it('reports pending queue counts (the detected-contradiction surface)', () => {
    const h = analyzeMemoryHealth({
      projectRoot,
      now: NOW,
      listConflictsImpl: () => [{ id: 'c1' }],
      listReviewImpl: () => [{ id: 'r1' }, { id: 'r2' }],
    });
    expect(h.queues.conflicts).toBe(1);
    expect(h.queues.review).toBe(2);
  });

  it('never throws on a project with no memory at all', () => {
    rmSync(join(projectRoot, 'context'), { recursive: true, force: true });
    const h = analyzeMemoryHealth({ projectRoot, now: NOW });
    expect(h.facts.total).toBe(0);
    expect(h.oldUntouched).toEqual([]);
    expect(h.nearDupPairs).toEqual([]);
  });
});

describe('Task 144 — formatMemoryHealth (Door 1)', () => {
  it('renders the one-glance summary with only the non-zero concerns', () => {
    const text = formatMemoryHealth({
      facts: { total: 42, byType: { project: 30, user: 12 }, byTrust: { high: 20, medium: 20, low: 2 } },
      oldUntouched: [{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }],
      nearDupPairs: [{ a: 'x', b: 'y', score: 0.8 }, { a: 'p', b: 'q', score: 0.7 }],
      queues: { conflicts: 1, review: 0 },
      staleDays: 60,
    });
    expect(text).toMatch(/Memory health/i);
    expect(text).toMatch(/42 fact/);
    expect(text).toMatch(/3 old/);
    expect(text).toMatch(/2 possible duplicate/);
    expect(text).toMatch(/1 conflict/);
    expect(text).not.toMatch(/review/); // zero concerns stay silent
    expect(text).toMatch(/informational/i); // never pass/fail
  });

  it('a healthy memory renders a single quiet line', () => {
    const text = formatMemoryHealth({
      facts: { total: 10, byType: { project: 10 }, byTrust: { high: 10 } },
      oldUntouched: [],
      nearDupPairs: [],
      queues: { conflicts: 0, review: 0 },
      staleDays: 60,
    });
    expect(text).toMatch(/10 fact/);
    expect(text).not.toMatch(/duplicate|conflict|old/);
  });
});
