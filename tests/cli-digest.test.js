// @doors: 1, 2
// Door 3 N/A: pure + fs only.
// Door 4 N/A: no message-queue.
// Door 5 N/A: digest emits to stdout/return; the journal sync is its own artifact.
//
// Task 147 — `cmk digest` render (regenerated) + the DECISIONS.md journal sync
// at the file-IO boundary (append-only). The digest is a CURRENT-knowledge
// snapshot (regenerated); DECISIONS.md is the permanent journal (append-only) —
// the two lifecycles tested together here at the disk boundary (D-161).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDigest, digest } from '../packages/cli/src/digest.mjs';
import { syncDecisionsJournal } from '../packages/cli/src/decisions-journal.mjs';
import { runSessionEndTasks } from '../packages/cli/src/session-end-tasks.mjs';

let sandbox;
let memDir;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-digest-test-'));
  memDir = join(sandbox, 'context', 'memory');
  mkdirSync(memDir, { recursive: true });
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

function seedFact({ id, type = 'project', title, createdAt = '2026-06-15T10:00:00Z', why }) {
  const fm = [
    '---',
    `id: ${id}`,
    `type: ${type}`,
    `title: ${title}`,
    `created_at: ${createdAt}`,
    'trust: high',
    '---',
    '',
    `Body of ${title}.`,
    why ? `\n**Why:** ${why}` : '',
    '',
  ].join('\n');
  writeFileSync(join(memDir, `${type}_${id}.md`), fm, 'utf8');
}

describe('buildDigest — render (pure)', () => {
  it('renders an empty-memory message when there are no facts', () => {
    const out = buildDigest([], { now: '2026-06-15T00:00:00Z' });
    expect(out).toMatch(/memory is empty/i);
  });

  it('groups facts by type with counts and lists titles', () => {
    const out = buildDigest(
      [
        { id: 'P-AAAAAAAA', type: 'project', title: 'A decision', trust: 'high', createdAt: '2026-06-15T10:00:00Z' },
        { id: 'P-BBBBBBBB', type: 'feedback', title: 'A preference', trust: 'medium', createdAt: '2026-06-15T11:00:00Z' },
      ],
      { now: '2026-06-15T12:00:00Z' },
    );
    expect(out).toContain('Decisions & project state (1)');
    expect(out).toContain('A decision');
    expect(out).toContain('Working-style & preferences (1)');
    expect(out).toContain('A preference');
    expect(out).toContain('P-AAAAAAAA');
  });
});

describe('digest — reads the project tier (Door 2: state read)', () => {
  it('renders facts that exist on disk', () => {
    seedFact({ id: 'P-AAAAAAAA', type: 'project', title: 'Use FTS5' });
    seedFact({ id: 'P-BBBBBBBB', type: 'feedback', title: 'Terse replies' });
    const out = digest({ projectRoot: sandbox, now: '2026-06-15T12:00:00Z' });
    expect(out).toContain('Use FTS5');
    expect(out).toContain('Terse replies');
  });
});

describe('syncDecisionsJournal — file-IO append-only writer (Door 2: disk state)', () => {
  it('creates context/DECISIONS.md from project decision facts', () => {
    seedFact({ id: 'P-AAAAAAAA', type: 'project', title: 'Use FTS5', why: 'markdown is truth' });
    const r = syncDecisionsJournal({ projectRoot: sandbox, now: '2026-06-15T12:00:00Z' });
    expect(r.written).toBe(true);
    const content = readFileSync(join(sandbox, 'context', 'DECISIONS.md'), 'utf8');
    expect(content).toContain('Use FTS5');
    expect(content).toContain('markdown is truth');
    expect(content).toContain('P-AAAAAAAA');
  });

  it('only journals project-type facts, not feedback/reference', () => {
    seedFact({ id: 'P-AAAAAAAA', type: 'project', title: 'A decision' });
    seedFact({ id: 'P-BBBBBBBB', type: 'feedback', title: 'A style note' });
    syncDecisionsJournal({ projectRoot: sandbox, now: '2026-06-15T12:00:00Z' });
    const content = readFileSync(join(sandbox, 'context', 'DECISIONS.md'), 'utf8');
    expect(content).toContain('A decision');
    expect(content).not.toContain('A style note');
  });

  it('is idempotent — a second sync with no changes does not rewrite', () => {
    seedFact({ id: 'P-AAAAAAAA', type: 'project', title: 'A decision' });
    syncDecisionsJournal({ projectRoot: sandbox, now: '2026-06-15T12:00:00Z' });
    const r2 = syncDecisionsJournal({ projectRoot: sandbox, now: '2026-06-15T13:00:00Z' });
    expect(r2.written).toBe(false);
  });

  it('marks an entry retracted when the fact is tombstoned, never removing it (Door 2 + over-mutation)', () => {
    seedFact({ id: 'P-AAAAAAAA', type: 'project', title: 'A decision' });
    seedFact({ id: 'P-BBBBBBBB', type: 'project', title: 'Another decision' });
    syncDecisionsJournal({ projectRoot: sandbox, now: '2026-06-15T12:00:00Z' });

    // Forget P-AAAAAAAA: remove its live fact + drop a tombstone.
    rmSync(join(memDir, 'project_P-AAAAAAAA.md'));
    const tombDir = join(memDir, 'archive', 'tombstones');
    mkdirSync(tombDir, { recursive: true });
    writeFileSync(join(tombDir, 'P-AAAAAAAA.md'), 'tombstoned', 'utf8');

    syncDecisionsJournal({ projectRoot: sandbox, now: '2026-06-20T08:00:00Z' });
    const content = readFileSync(join(sandbox, 'context', 'DECISIONS.md'), 'utf8');
    // The retracted entry SURVIVES + is marked; the other is untouched.
    expect(content).toContain('A decision');
    expect(content).toMatch(/retracted/i);
    expect(content).toContain('Another decision');
  });

  it('the journal marker survives a forget scrub (composition: forget must not strip DECISIONS.md)', async () => {
    // Regression for the D-161 composition bug: forget's scrubAllScratchpads
    // walked every context/*.md and deleted the journal's `<!-- decision:ID -->`
    // marker (it matches the HTML-comment branch), breaking retract-in-place.
    // DECISIONS.md is now excluded like INDEX.md.
    const { forget } = await import('../packages/cli/src/forget.mjs');
    seedFact({ id: 'P-AAAAAAAA', type: 'project', title: 'A decision', why: 'because' });
    syncDecisionsJournal({ projectRoot: sandbox, now: '2026-06-15T12:00:00Z' });
    const before = readFileSync(join(sandbox, 'context', 'DECISIONS.md'), 'utf8');
    expect(before).toContain('<!-- decision:P-AAAAAAAA -->');

    forget({ idOrQuery: 'P-AAAAAAAA', projectRoot: sandbox, userDir: join(sandbox, '.user'), yes: true });

    const after = readFileSync(join(sandbox, 'context', 'DECISIONS.md'), 'utf8');
    // The marker (and the whole entry) must survive forget's scrub.
    expect(after).toContain('<!-- decision:P-AAAAAAAA -->');
    expect(after).toContain('A decision');
  });

  it('returns a soft error (never throws) when projectRoot is unwritable/missing', () => {
    const r = syncDecisionsJournal({ projectRoot: join(sandbox, 'does-not-exist', 'x') });
    // No memory dir → no facts → empty journal write OR a soft error; either
    // way it must not throw. (Empty facts → header-only write is acceptable.)
    expect(r).toBeTypeOf('object');
  });
});

describe('Task 159 — the SESSION-END path populates DECISIONS.md with NO `cmk digest` (D-169 automatic-path, integration)', () => {
  // The load-bearing automatic-path test (the D-169 done-criteria rule): this
  // drives the REAL runSessionEndTasks (no mocks of the journal) against a real
  // fact corpus and asserts DECISIONS.md renders — WITHOUT ANY `cmk digest` /
  // syncDecisionsJournal call in the test setup. A test that ran the populating
  // command first would structurally mask "nobody runs it automatically" — so
  // there is deliberately no such setup here.
  it('renders the journal from the session-end hook alone', async () => {
    seedFact({ id: 'P-AAAAAAAA', type: 'project', title: 'Adopt id-keyed replacement', why: 'archive beats scratchpad' });
    seedFact({ id: 'P-BBBBBBBB', type: 'project', title: 'Session-end auto-sync the journal', why: 'D-164 automatic-or-not-shipped' });
    const journalPath = join(sandbox, 'context', 'DECISIONS.md');
    expect(existsSync(journalPath)).toBe(false); // precondition: no journal yet, no digest ever run

    // No-op backend: compress + persona are best-effort (allSettled) and have no
    // sessions/ tree here, so they skip; the journal step is what we're proving.
    const makeBackend = () => ({ compress: async () => ({ output: '' }) });
    const { journalOutcome } = await runSessionEndTasks({
      projectRoot: sandbox,
      userDir: join(sandbox, 'user'),
      makeBackend,
      now: '2026-06-18T12:00:00Z',
    });

    expect(journalOutcome.status).toBe('fulfilled');
    expect(journalOutcome.value.written).toBe(true);
    // Door 2: the real file exists on disk and lists BOTH decisions.
    expect(existsSync(journalPath)).toBe(true);
    const body = readFileSync(journalPath, 'utf8');
    expect(body).toContain('Adopt id-keyed replacement');
    expect(body).toContain('Session-end auto-sync the journal');
    expect(body).toContain('P-AAAAAAAA');
    expect(body).toContain('P-BBBBBBBB');
  });
});
