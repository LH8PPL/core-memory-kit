// @doors: 1, 2, 5
// Door 3 N/A: the Haiku call goes through the injected CompressorBackend
//   (MockHaikuBackend here); the real-spawn side is compressor.mjs's own
//   spawn-smoke coverage.
// @door-3.5: prompt-assertion — pins the judge INSTRUCTIONS (the bake-off's
//   10/10 SUPERSEDES/DUPLICATE/COEXIST framing) and the INPUT composition
//   (both facts' titles + dates reach the model).
// Door 4 N/A: no message-queue interaction (candidates re-derive from the
//   corpus each pass; deliberately no fragile pending-queue file).
// Door 5: supersede routing audits via validity-window's temporal_supersede
//   entry; duplicate routing audits via the recurrence entry — asserted here.

// Tests for Task 66.4 — the weekly contradiction-catch sweep (D-259: the
// corpus-measured design — search candidates → ONE batched judge → event-time
// routing).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFact } from '../packages/cli/src/write-fact.mjs';
import { resolveFact } from '../packages/cli/src/forget.mjs';
import { temporalSweep, buildCandidateQuery } from '../packages/cli/src/temporal-sweep.mjs';
import { MockHaikuBackend } from '../packages/cli/src/compressor.mjs';
import { parse as parseFm } from '../packages/cli/src/frontmatter.mjs';

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
    ...overrides,
  };
}

function mockJudge(...lines) {
  return new MockHaikuBackend({
    responses: [
      {
        outputText: lines.join('\n'),
        inputTokens: 100,
        outputTokens: 20,
        costUSD: 0.0004,
        preservedIds: [],
      },
    ],
  });
}

describe('Task 66.4 — temporalSweep() boundary', () => {
  let sandbox;
  let projectRoot;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'cmk-temporal-sweep-test-'));
    projectRoot = join(sandbox, 'proj');
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  // The v9.9 chain: an older current-state fact + a newer one sharing subject
  // tokens, plus an unrelated bystander.
  function seedChain() {
    const older = writeFact(
      factOpts({
        projectRoot,
        slug: 'gate-progress',
        title: 'v9.9 release cut-gate in progress',
        body: 'The v9.9 release cut-gate is currently in progress.',
        createdAt: '2026-06-29T09:00:00Z',
      }),
    );
    const newer = writeFact(
      factOpts({
        projectRoot,
        slug: 'gate-published',
        title: 'v9.9 release published to npm',
        body: 'The v9.9 release is published to npm with provenance.',
        createdAt: '2026-07-01T18:00:00Z',
      }),
    );
    const bystander = writeFact(
      factOpts({
        projectRoot,
        slug: 'bystander',
        title: 'Python venv convention',
        body: 'Always use a venv for python projects.',
        createdAt: '2026-07-01T19:00:00Z',
      }),
    );
    return { older, newer, bystander };
  }

  it('SUPERSEDES verdict → the older window closes (66.2), newer + bystander stay live (Doors 1+2+5)', async () => {
    const { older, newer, bystander } = seedChain();
    const backend = mockJudge('PAIR 1: SUPERSEDES');
    const r = await temporalSweep({ projectRoot, backend, now: NOW });
    expect(r.action).toBe('swept');
    expect(r.superseded).toBe(1);
    // Door 2 — the older fact is archived with the window closed at the
    // NEWER fact's created_at (event-time).
    expect(existsSync(older.path)).toBe(false);
    const archived = join(projectRoot, 'context', 'memory', 'archive', 'superseded', `${older.id}.md`);
    const { frontmatter } = parseFm(readFileSync(archived, 'utf8'));
    expect(frontmatter.ended_at).toBe('2026-07-01T18:00:00Z');
    expect(frontmatter.superseded_by).toBe(newer.id);
    expect(existsSync(newer.path)).toBe(true);
    expect(existsSync(bystander.path)).toBe(true);
    // Door 5 — the audit trail names the judge.
    const audit = readFileSync(join(projectRoot, 'context', '.locks', 'audit.log'), 'utf8');
    expect(audit).toContain('temporal_supersede');
    expect(audit).toContain('temporal-sweep');
  });

  it('Door 3.5 — the judge prompt carries the bake-off framing and BOTH facts reach the input', async () => {
    seedChain();
    const backend = mockJudge('PAIR 1: COEXIST');
    await temporalSweep({ projectRoot, backend, now: NOW });
    expect(backend.calls).toHaveLength(1);
    const call = backend.calls[0];
    // Instructions: the three verdicts + the load-bearing framing sentence.
    expect(call.instructions).toContain('SUPERSEDES');
    expect(call.instructions).toContain('DUPLICATE');
    expect(call.instructions).toContain('COEXIST');
    expect(call.instructions).toMatch(/old state is still current/i);
    // Input: both facts' content + dates are what the model actually sees.
    expect(call.input).toContain('cut-gate');
    expect(call.input).toContain('published to npm');
    expect(call.input).toContain('2026-06-29');
    expect(call.input).toContain('2026-07-01');
    // The spawn is bounded (spawn-discipline: an explicit timeout reaches the backend).
    expect(call.timeoutMs).toBeGreaterThan(0);
  });

  it('DUPLICATE verdict → the OLDER fact recurrence bump, both files stay live', async () => {
    const { older, newer } = seedChain();
    const backend = mockJudge('PAIR 1: DUPLICATE');
    const r = await temporalSweep({ projectRoot, backend, now: NOW });
    expect(r.duplicates).toBe(1);
    expect(existsSync(older.path)).toBe(true);
    expect(existsSync(newer.path)).toBe(true);
    const { frontmatter } = parseFm(readFileSync(older.path, 'utf8'));
    expect(frontmatter.recurrence_count).toBe(2);
  });

  it('COEXIST verdict → nothing mutates', async () => {
    const { older, newer } = seedChain();
    const beforeOld = readFileSync(older.path, 'utf8');
    const beforeNew = readFileSync(newer.path, 'utf8');
    const backend = mockJudge('PAIR 1: COEXIST');
    const r = await temporalSweep({ projectRoot, backend, now: NOW });
    expect(r.coexist).toBe(1);
    expect(readFileSync(older.path, 'utf8')).toBe(beforeOld);
    expect(readFileSync(newer.path, 'utf8')).toBe(beforeNew);
  });

  it('no new facts since the marker → skipped, the judge is NEVER called', async () => {
    seedChain();
    const first = mockJudge('PAIR 1: COEXIST');
    await temporalSweep({ projectRoot, backend: first, now: NOW });
    // Second pass, no new facts written since:
    const second = mockJudge('PAIR 1: SUPERSEDES');
    const r = await temporalSweep({ projectRoot, backend: second, now: '2026-07-02T13:00:00Z' });
    expect(r.action).toBe('skipped');
    expect(r.reason).toBe('no-new-facts');
    expect(second.calls).toHaveLength(0);
  });

  it('judge failure → error result, marker NOT advanced (the pair re-derives next pass)', async () => {
    seedChain();
    const failing = {
      compress: async () => {
        throw new Error('haiku unavailable');
      },
    };
    const r = await temporalSweep({ projectRoot, backend: failing, now: NOW });
    expect(r.action).toBe('error');
    expect(r.reason).toBe('judge-failed');
    // Marker not advanced → a later pass still sees the facts as new.
    const retry = mockJudge('PAIR 1: SUPERSEDES');
    const r2 = await temporalSweep({ projectRoot, backend: retry, now: '2026-07-02T13:00:00Z' });
    expect(r2.action).toBe('swept');
    expect(r2.superseded).toBe(1);
  });

  it('malformed verdict lines → pair counted unjudged, nothing mutates, sweep still succeeds', async () => {
    const { older, newer } = seedChain();
    const backend = mockJudge('I think these are related somehow.');
    const r = await temporalSweep({ projectRoot, backend, now: NOW });
    expect(r.action).toBe('swept');
    expect(r.unjudged).toBeGreaterThanOrEqual(1);
    expect(existsSync(older.path)).toBe(true);
    expect(existsSync(newer.path)).toBe(true);
  });

  it('no same-subject candidates (unrelated facts only) → skipped no-candidates, no judge call', async () => {
    writeFact(
      factOpts({
        projectRoot,
        slug: 'solo',
        title: 'Completely unique zebra topic',
        body: 'A fact with no same-subject sibling.',
        createdAt: '2026-07-01T18:00:00Z',
      }),
    );
    const backend = mockJudge('PAIR 1: COEXIST');
    const r = await temporalSweep({ projectRoot, backend, now: NOW });
    expect(r.action).toBe('skipped');
    expect(r.reason).toBe('no-candidates');
    expect(backend.calls).toHaveLength(0);
  });

  describe('buildCandidateQuery (pure helper)', () => {
    it('quotes each token (the FTS5 shred fix: "v0.3.2" matches as a phrase) and ORs them', () => {
      const q = buildCandidateQuery('v9.9 release cut-gate in progress');
      expect(q).toContain(' OR ');
      for (const part of q.split(' OR ')) {
        expect(part.startsWith('"') && part.endsWith('"')).toBe(true);
      }
    });

    it('empty/short titles → empty query (sweep skips gracefully)', () => {
      expect(buildCandidateQuery('')).toBe('');
      expect(buildCandidateQuery('a b')).toBe('');
    });
  });
});
