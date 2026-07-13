// @doors: 1, 2
// Door 3 N/A: in-process; no subprocess spawn.
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: labeling is pure serialization — no NDJSON log of its own.

// Task 209 — state-labeled recall (A-TMA's QA-level mechanism; D-308/D-331).
//
// The kit COMPUTES and STORES temporal state (Task 66 validity windows,
// superseded_by, expires_at, tombstones) but never TOLD Claude at recall time —
// results rendered as undifferentiated bullets. A-TMA (arXiv 2607.01935,
// Case Study 1): IDENTICAL retrieved evidence flips from wrong to correct
// answer with deterministic state labels + a one-line instruction alone.
//
// Shape: a PURE projection of already-known metadata → a small fixed label
// vocabulary, applied where facts are SERIALIZED (search results, get, the
// snapshot). LABELS, never RE-RANKS — §20.3's hot path stays enum-ordered;
// the common case (current-active) stays UNLABELED (zero noise).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  projectStateLabel,
  STATE_LABELS,
  STATE_INSTRUCTION,
} from '../packages/cli/src/state-label.mjs';
import { search } from '../packages/cli/src/search.mjs';
import { getObservations } from '../packages/cli/src/read-core.mjs';
import { openIndexDb } from '../packages/cli/src/index-db.mjs';

const NOW = '2026-07-13T12:00:00Z';

let sandbox;
let db;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-statelabel-'));
  db = openIndexDb({ projectRoot: sandbox });
});

afterEach(() => {
  db?.close();
  rmSync(sandbox, { recursive: true, force: true });
});

function seedObservation(db, {
  id, body, tier = 'P', trust = 'high',
  heading_path = 'MEMORY.md > Active Threads',
  source_file = 'MEMORY.md', source_line = 1,
  created_at = Date.parse('2026-07-01T10:00:00Z'),
  deleted_at = null, superseded_by = null, expires_at = null,
}) {
  db.prepare(`
    INSERT INTO observations
      (id, tier, source_file, source_line, source_sha1, heading_path, body,
       write_source, trust, created_at, superseded_by, deleted_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'user-explicit', ?, ?, ?, ?, ?)
  `).run(
    id, tier, source_file, source_line, 'a'.repeat(40), heading_path, body,
    trust, created_at, superseded_by, deleted_at, expires_at,
  );
}

describe('Task 209 — projectStateLabel (the pure projection)', () => {
  it('current-active (no state metadata) → null: the common case is UNLABELED', () => {
    expect(projectStateLabel({ now: NOW })).toBeNull();
    expect(projectStateLabel({ deletedAt: null, supersededBy: null, expiresAt: null, now: NOW })).toBeNull();
  });

  it('a future expires_at is still current (labels only PAST the boundary; exclusive end per 66.3)', () => {
    expect(projectStateLabel({ expiresAt: Date.parse('2026-08-01T00:00:00Z'), now: NOW })).toBeNull();
    // expires_at == now → already expired (the 66.3 exclusive-end convention).
    expect(projectStateLabel({ expiresAt: Date.parse(NOW), now: NOW })).toBe('expired');
  });

  it('each state maps deterministically', () => {
    expect(projectStateLabel({ deletedAt: Date.parse('2026-07-02T00:00:00Z'), now: NOW })).toBe('retracted');
    expect(projectStateLabel({ supersededBy: 'P-NEWERNE2', now: NOW })).toBe('superseded');
    expect(projectStateLabel({ expiresAt: Date.parse('2026-07-02T00:00:00Z'), now: NOW })).toBe('expired');
  });

  it('precedence: retracted > superseded > expired', () => {
    expect(
      projectStateLabel({
        deletedAt: Date.parse('2026-07-02T00:00:00Z'),
        supersededBy: 'P-NEWERNE2',
        expiresAt: Date.parse('2026-07-02T00:00:00Z'),
        now: NOW,
      }),
    ).toBe('retracted');
    expect(
      projectStateLabel({
        supersededBy: 'P-NEWERNE2',
        expiresAt: Date.parse('2026-07-02T00:00:00Z'),
        now: NOW,
      }),
    ).toBe('superseded');
  });

  it('ISO-string inputs work too (frontmatter values are strings)', () => {
    expect(projectStateLabel({ supersededBy: 'P-NEWERNE2', deletedAt: '2026-07-02T00:00:00Z', now: NOW })).toBe('retracted');
    expect(projectStateLabel({ expiresAt: '2026-07-02T00:00:00Z', now: NOW })).toBe('expired');
  });

  it('the serialization vocabulary is the A-TMA fixed set', () => {
    expect(STATE_LABELS.superseded).toBe('[superseded — kept for history]');
    expect(STATE_LABELS.expired).toBe('[expired]');
    expect(STATE_LABELS.retracted).toBe('[retracted]');
    expect(STATE_INSTRUCTION).toMatch(/unlabeled .*current/i);
  });
});

describe('Task 209 — search results carry the state (per row, deterministic)', () => {
  it('a live superseded row is labeled; the healthy row carries NO state key (zero noise)', () => {
    seedObservation(db, { id: 'P-HEALTHY2', body: 'runtime target is node twenty two' });
    seedObservation(db, {
      id: 'P-SUPRSDD2', body: 'runtime target is node eighteen legacy',
      superseded_by: 'P-HEALTHY2',
    });
    const r = search({ db, query: 'runtime target node', now: NOW });
    const byId = Object.fromEntries(r.results.map((x) => [x.id, x]));
    expect(byId['P-SUPRSDD2'].state).toBe('superseded');
    expect('state' in byId['P-HEALTHY2']).toBe(false);
  });

  it('an expired row surfaced via includeExpired is labeled expired', () => {
    seedObservation(db, {
      id: 'P-EXPRED42', body: 'the beta feature flag is enabled until july',
      expires_at: Date.parse('2026-07-10T00:00:00Z'),
    });
    const r = search({ db, query: 'beta feature flag', includeExpired: true, now: NOW });
    expect(r.results[0].id).toBe('P-EXPRED42');
    expect(r.results[0].state).toBe('expired');
  });

  it('a tombstoned row surfaced via includeTombstoned is labeled retracted', () => {
    seedObservation(db, {
      id: 'P-DELETED6', body: 'the old api key location was in env local',
      deleted_at: Date.parse('2026-07-05T00:00:00Z'),
    });
    const r = search({ db, query: 'api key location', includeTombstoned: true, now: NOW });
    expect(r.results[0].id).toBe('P-DELETED6');
    expect(r.results[0].state).toBe('retracted');
  });

  it('the recall shape (spec): a superseded + successor pair surfaced together is DISTINGUISHABLE', () => {
    seedObservation(db, { id: 'P-VNEWFACT', body: 'deploys go to hetzner now' });
    seedObservation(db, {
      id: 'P-VPRVFACT', body: 'deploys go to vercel currently',
      superseded_by: 'P-VNEWFACT',
    });
    const r = search({ db, query: 'deploys go', now: NOW });
    const old = r.results.find((x) => x.id === 'P-VPRVFACT');
    const neu = r.results.find((x) => x.id === 'P-VNEWFACT');
    expect(old.state).toBe('superseded');
    expect(neu.state).toBeUndefined();
  });
});

describe('Task 209 — getObservations (mk_get / cmk get, the shared core)', () => {
  it('labels a superseded row; a current row carries no state key', () => {
    seedObservation(db, { id: 'P-GETCURR2', body: 'a current fact body' });
    seedObservation(db, { id: 'P-GETSUPR2', body: 'an old fact body', superseded_by: 'P-GETCURR2' });
    const [curr, supr] = getObservations(db, ['P-GETCURR2', 'P-GETSUPR2'], { now: NOW });
    expect('state' in curr).toBe(false);
    expect(supr.state).toBe('superseded');
  });

  it('a recovered tombstone is labeled retracted', () => {
    // Build a real tombstone file (the read path getObservations recovers from).
    const tombDir = join(sandbox, 'context', 'memory', 'archive', 'tombstones');
    mkdirSync(tombDir, { recursive: true });
    writeFileSync(
      join(tombDir, 'P-TMBSTNE2.md'),
      ['---', 'id: P-TMBSTNE2', 'tier: P', 'trust: medium', 'write_source: user-explicit',
        "deleted_at: '2026-07-05T00:00:00Z'", '---', '', 'the forgotten fact body', ''].join('\n'),
      'utf8',
    );
    const [row] = getObservations(db, ['P-TMBSTNE2'], {
      includeTombstoned: true, projectRoot: sandbox, now: NOW,
    });
    expect(row.tombstoned).toBe(true);
    expect(row.state).toBe('retracted');
  });
});

describe('Task 209 — the envelope instruction (mk_search, CLI parity)', () => {
  it('mk_search appends the instruction block ONLY when a labeled row is present', async () => {
    const { buildMcpServer } = await import('../packages/cli/src/mcp-server.mjs');
    const { STATE_INSTRUCTION: instr } = await import('../packages/cli/src/state-label.mjs');
    // context/ so the per-read refresh + recall-log have a home.
    mkdirSync(join(sandbox, 'context', '.locks'), { recursive: true });
    seedObservation(db, { id: 'P-ENVCURR2', body: 'envelope current fact alpha' });
    seedObservation(db, { id: 'P-ENVSUPR2', body: 'envelope superseded fact alpha', superseded_by: 'P-ENVCURR2' });
    const server = buildMcpServer({ projectRoot: sandbox, userDir: join(sandbox, 'u'), db });
    const tools = server._registeredTools ?? {};

    const labeled = await tools.mk_search.handler({ query: 'envelope fact alpha' }, {});
    const labeledTexts = labeled.content.map((c) => c.text);
    expect(labeledTexts.some((t) => t === instr)).toBe(true);
    // The rows themselves carry the state (the JSON block).
    expect(labeledTexts[0]).toContain('"state": "superseded"');

    const clean = await tools.mk_search.handler({ query: 'envelope current alpha' }, {});
    // Only the current row matches → no instruction block (zero noise).
    expect(clean.content.map((c) => c.text).some((t) => t === instr)).toBe(false);
  });
});

describe('Task 209 — the snapshot labels superseded bullets (inject, no DB)', () => {
  const noSpawn = () => ({ spawned: false, reason: 'test' });

  function snapshotOf(projectRoot, userDir) {
    // injectContext's model-facing channel (design §5.1) — the snapshot text.
    return injectCtx({ cwd: projectRoot, userDir, testSpawnLazy: noSpawn }).snapshot;
  }
  let injectCtx;
  beforeEach(async () => {
    ({ injectContext: injectCtx } = await import('../packages/cli/src/inject-context.mjs'));
  });

  it('a MEMORY.md bullet whose provenance carries superseded_by injects WITH the label; siblings untouched', async () => {
    const { install } = await import('../packages/cli/src/install.mjs');
    const projectRoot = mkdtempSync(join(tmpdir(), 'cmk-statelabel-inj-'));
    const userDir = join(projectRoot, 'user-tier');
    try {
      install({ projectRoot, userDir, silent: true });
      const memPath = join(projectRoot, 'context', 'MEMORY.md');
      const seeded = readFileSync(memPath, 'utf8').replace(
        '## Active Threads',
        [
          '## Active Threads',
          '',
          '- (P-LVEBULL2) the merged current decision text',
          '  <!-- source: MEMORY.md, source_line: 5, sha1: ' + 'b'.repeat(40) + ', write: user-explicit, trust: high, at: 2026-07-01T10:00:00Z -->',
          '- (P-PREVBULL) the pre-merge older decision text',
          '  <!-- source: MEMORY.md, source_line: 6, sha1: ' + 'c'.repeat(40) + ', write: user-explicit, trust: high, at: 2026-06-01T10:00:00Z, superseded_by: P-LVEBULL2 -->',
        ].join('\n'),
      );
      writeFileSync(memPath, seeded, 'utf8');
      const text = snapshotOf(projectRoot, userDir);
      // The superseded bullet carries the label; the live sibling does not.
      const labeledLine = text.split('\n').find((l) => l.includes('P-PREVBULL'));
      expect(labeledLine).toContain('[superseded — kept for history]');
      const liveLine = text.split('\n').find((l) => l.includes('P-LVEBULL2'));
      expect(liveLine).not.toContain('[superseded');
      // The one-line envelope instruction ships with the snapshot when a label is present.
      expect(text).toContain(STATE_INSTRUCTION);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('a snapshot with NO stateful bullets carries NO labels and NO instruction (zero noise)', async () => {
    const { install } = await import('../packages/cli/src/install.mjs');
    const projectRoot = mkdtempSync(join(tmpdir(), 'cmk-statelabel-clean-'));
    const userDir = join(projectRoot, 'user-tier');
    try {
      install({ projectRoot, userDir, silent: true });
      const text = snapshotOf(projectRoot, userDir);
      expect(text).not.toContain('[superseded — kept for history]');
      expect(text).not.toContain(STATE_INSTRUCTION);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
