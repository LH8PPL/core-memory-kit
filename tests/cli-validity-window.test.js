// @doors: 1, 2, 5
// Door 3 N/A: pure in-process file IO — no subprocess spawn, no LLM.
// Door 4 N/A: no message-queue interaction.
// Door 5: the close emits a `temporal_supersede` audit entry (both ids +
//   event-time) — a window never closes silently.

// Tests for Task 66.2 — the validity-window close (design §16.18 layer 2,
// detection-input pivoted per D-259).
//
// Semantics under test (graphiti resolve_edge_contradictions arithmetic):
//   - the OLDER fact's window closes at the NEWER fact's created_at
//     (EVENT-TIME decides, never the clock, never the LLM);
//   - the older fact is annotated (ended_at / status: completed /
//     superseded_by) and moved to archive/superseded/ — never deleted;
//   - the newer fact is byte-untouched (absence of ended_at = ongoing).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFact } from '../packages/cli/src/write-fact.mjs';
import { resolveFact } from '../packages/cli/src/forget.mjs';
import { resolveTemporalSupersede } from '../packages/cli/src/validity-window.mjs';
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

describe('Task 66.2 — resolveTemporalSupersede() boundary', () => {
  let sandbox;
  let projectRoot;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'cmk-validity-window-test-'));
    projectRoot = join(sandbox, 'proj');
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  function writePair() {
    const older = writeFact(
      factOpts({
        projectRoot,
        slug: 'status-old',
        body: 'v9.9 cut-gate is in progress.',
        createdAt: '2026-06-16T09:00:00Z',
      }),
    );
    const newer = writeFact(
      factOpts({
        projectRoot,
        slug: 'status-new',
        body: 'v9.9 published to npm.',
        createdAt: '2026-06-16T18:00:00Z',
      }),
    );
    return { older, newer };
  }

  it('closes the older window at the NEWER fact created_at (event-time), annotates, archives (Doors 1+2)', () => {
    const { older, newer } = writePair();
    const r = resolveTemporalSupersede({
      olderId: older.id,
      newerId: newer.id,
      projectRoot,
      now: NOW,
    });
    expect(r.action).toBe('superseded');
    expect(r.olderId).toBe(older.id);
    expect(r.newerId).toBe(newer.id);
    // Event-time, NOT the wall clock passed as now:
    expect(r.endedAt).toBe('2026-06-16T18:00:00Z');

    // The live older file is gone; the archived copy carries the window fields.
    expect(existsSync(older.path)).toBe(false);
    const archived = join(
      projectRoot, 'context', 'memory', 'archive', 'superseded', `${older.id}.md`,
    );
    expect(existsSync(archived)).toBe(true);
    const { frontmatter } = parseFm(readFileSync(archived, 'utf8'));
    expect(frontmatter.ended_at).toBe('2026-06-16T18:00:00Z');
    expect(frontmatter.status).toBe('completed');
    expect(frontmatter.superseded_by).toBe(newer.id);
    // Body preserved verbatim (never lose content).
    expect(readFileSync(archived, 'utf8')).toContain('cut-gate is in progress');
  });

  it('the NEWER fact is byte-untouched (absence of ended_at = ongoing)', () => {
    const { older, newer } = writePair();
    const before = readFileSync(newer.path, 'utf8');
    resolveTemporalSupersede({ olderId: older.id, newerId: newer.id, projectRoot, now: NOW });
    expect(readFileSync(newer.path, 'utf8')).toBe(before);
  });

  it('over-mutation guard: an unrelated third fact is untouched', () => {
    const { older, newer } = writePair();
    const bystander = writeFact(
      factOpts({ projectRoot, slug: 'bystander', body: 'Unrelated permanent fact.' }),
    );
    resolveTemporalSupersede({ olderId: older.id, newerId: newer.id, projectRoot, now: NOW });
    expect(existsSync(bystander.path)).toBe(true);
    expect(readFileSync(bystander.path, 'utf8')).toContain('Unrelated permanent fact.');
  });

  it('resolveFact(olderId) reports superseded with supersededBy = newer id (old ids never die)', () => {
    const { older, newer } = writePair();
    resolveTemporalSupersede({ olderId: older.id, newerId: newer.id, projectRoot, now: NOW });
    const resolved = resolveFact({ id: older.id, projectRoot });
    expect(resolved.state).toBe('superseded');
    expect(resolved.supersededBy).toBe(newer.id);
  });

  it('Door 5: audit log records temporal_supersede with both ids and the event-time', () => {
    const { older, newer } = writePair();
    resolveTemporalSupersede({ olderId: older.id, newerId: newer.id, projectRoot, now: NOW });
    const auditPath = join(projectRoot, 'context', '.locks', 'audit.log');
    const entries = readFileSync(auditPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    const e = entries.find((x) => x.action === 'temporal_supersede');
    expect(e).toBeDefined();
    const flat = JSON.stringify(e);
    expect(flat).toContain(older.id);
    expect(flat).toContain(newer.id);
    expect(flat).toContain('2026-06-16T18:00:00Z');
  });

  it('direction guard: older must actually be older — inverted pair → schema error, nothing mutated', () => {
    const { older, newer } = writePair();
    const r = resolveTemporalSupersede({
      olderId: newer.id, // inverted on purpose
      newerId: older.id,
      projectRoot,
      now: NOW,
    });
    expect(r.action).toBe('error');
    expect(r.errorCategory).toBe('schema');
    expect(existsSync(older.path)).toBe(true);
    expect(existsSync(newer.path)).toBe(true);
  });

  it('idempotent re-apply: an already-superseded older → action skipped, no double-archive', () => {
    const { older, newer } = writePair();
    const first = resolveTemporalSupersede({ olderId: older.id, newerId: newer.id, projectRoot, now: NOW });
    expect(first.action).toBe('superseded');
    const second = resolveTemporalSupersede({ olderId: older.id, newerId: newer.id, projectRoot, now: NOW });
    expect(second.action).toBe('skipped');
    expect(second.reason).toBe('already-superseded');
  });

  it('unknown ids → not-found, same id twice → schema error', () => {
    const { older } = writePair();
    expect(
      resolveTemporalSupersede({ olderId: 'P-ZZZZZZZZ', newerId: older.id, projectRoot, now: NOW }).action,
    ).toBe('not-found');
    expect(
      resolveTemporalSupersede({ olderId: older.id, newerId: older.id, projectRoot, now: NOW }).action,
    ).toBe('error');
  });
});
