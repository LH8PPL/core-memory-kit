// Task 190 — the RECALL-LOG: which memory IDs surfaced each turn (ADR-0017
// Phase 1a; D-252). The learn-loop's attribution primitive: without "which
// memories were injected/searched this turn," no outcome signal (Task 192)
// can find its target memory.
//
// Boundary under test: recall-log.mjs public contract (appendRecallEntry /
// readRecallLog) + the two production wire-sites — injectContext (the
// snapshot's fact ids, source:'inject') and search() (the returned ids,
// source:'search'). The log is an NDJSON local diagnostic at
// context/.locks/recall.log — the .locks tier is already gitignored.
//
// @doors: 1,2,4
// Door 3 N/A: no subprocess — pure file append + read.
// Door 5 N/A: no message queue.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  appendRecallEntry,
  readRecallLog,
  recallLogPath,
} from '../packages/cli/src/recall-log.mjs';
import { injectContext } from '../packages/cli/src/inject-context.mjs';
import { openIndexDb } from '../packages/cli/src/index-db.mjs';
import { search } from '../packages/cli/src/search.mjs';
import { ID_PATTERN } from '../packages/cli/src/tier-paths.mjs';

let sandbox;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-recall-log-test-'));
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

function writeFile(absPath, content) {
  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, content, 'utf8');
}

describe('Task 190 — recall-log module boundary', () => {
  it('appendRecallEntry writes one NDJSON line with session/ts/source/ids and creates .locks', () => {
    const projectRoot = join(sandbox, 'proj');
    mkdirSync(projectRoot, { recursive: true });

    // Door 1 (response): append reports ok.
    const r = appendRecallEntry(projectRoot, {
      session: 'sess-a',
      source: 'inject',
      ids: ['P-9LXBA3ZK', 'U-CVGYFKW2'],
    });
    expect(r.ok).toBe(true);

    // Door 2 (state): exactly one NDJSON line at the canonical path.
    const raw = readFileSync(recallLogPath(projectRoot), 'utf8');
    const lines = raw.trim().split('\n');
    expect(lines).toHaveLength(1);

    // Door 4 (observability): the entry shape is the attribution record.
    const entry = JSON.parse(lines[0]);
    expect(entry.session).toBe('sess-a');
    expect(entry.source).toBe('inject');
    expect(entry.ids).toEqual(['P-9LXBA3ZK', 'U-CVGYFKW2']);
    expect(typeof entry.ts).toBe('string');
    expect(Number.isNaN(Date.parse(entry.ts))).toBe(false);
  });

  it('search entries carry the query; ids-only content (no fact bodies)', () => {
    const projectRoot = join(sandbox, 'proj');
    mkdirSync(projectRoot, { recursive: true });

    appendRecallEntry(projectRoot, {
      session: null,
      source: 'search',
      query: 'python formatter',
      ids: ['P-9LXBA3ZK'],
    });

    const [entry] = readRecallLog(projectRoot);
    expect(entry.source).toBe('search');
    expect(entry.query).toBe('python formatter');
    expect(entry.ids).toEqual(['P-9LXBA3ZK']);
    // Screened: the entry has no body/content field — ids + query only.
    expect(entry.body).toBeUndefined();
    expect(entry.content).toBeUndefined();
  });

  it('readRecallLog filters by session WITHOUT touching other sessions (over-mutation guard)', () => {
    const projectRoot = join(sandbox, 'proj');
    mkdirSync(projectRoot, { recursive: true });

    appendRecallEntry(projectRoot, { session: 'sess-a', source: 'inject', ids: ['P-9LXBA3ZK'] });
    appendRecallEntry(projectRoot, { session: 'sess-a', source: 'search', query: 'q', ids: [] });
    appendRecallEntry(projectRoot, { session: 'sess-b', source: 'inject', ids: ['U-CVGYFKW2'] });

    // Filtered read returns only the asked-for session…
    const a = readRecallLog(projectRoot, { session: 'sess-a' });
    expect(a).toHaveLength(2);
    // …and the OTHER session's entry is untouched on disk (N-1 remain).
    const all = readRecallLog(projectRoot);
    expect(all).toHaveLength(3);
    expect(all.filter((e) => e.session === 'sess-b')).toHaveLength(1);
  });

  it('append is best-effort — an unwritable root reports ok:false, never throws (hook safety)', () => {
    // A FILE where the project root should be → mkdir of context/.locks fails.
    const bogusRoot = join(sandbox, 'not-a-dir');
    writeFileSync(bogusRoot, 'occupied', 'utf8');

    expect(() => {
      const r = appendRecallEntry(bogusRoot, { session: null, source: 'inject', ids: ['P-9LXBA3ZK'] });
      expect(r.ok).toBe(false);
    }).not.toThrow();
  });

  it('reader tolerates corrupt lines (skips them, returns the valid ones)', () => {
    const projectRoot = join(sandbox, 'proj');
    mkdirSync(projectRoot, { recursive: true });
    appendRecallEntry(projectRoot, { session: 's', source: 'inject', ids: ['P-9LXBA3ZK'] });
    appendFileSync(recallLogPath(projectRoot), 'not-json-garbage\n', 'utf8');
    appendRecallEntry(projectRoot, { session: 's', source: 'search', query: 'q', ids: [] });

    const entries = readRecallLog(projectRoot);
    expect(entries).toHaveLength(2);
  });

  it('readRecallLog on a project with no log returns []', () => {
    const projectRoot = join(sandbox, 'empty-proj');
    mkdirSync(projectRoot, { recursive: true });
    expect(readRecallLog(projectRoot)).toEqual([]);
  });
});

describe('Task 190 — inject wire-site (the automatic path: hook-driven, no manual command)', () => {
  it('injectContext appends a source:inject entry with the snapshot citation ids', () => {
    const projectRoot = join(sandbox, 'proj');
    const userDir = join(sandbox, 'user');
    // A scratchpad bullet carrying a citation id that will survive into the snapshot.
    writeFile(
      join(projectRoot, 'context', 'MEMORY.md'),
      '# MEMORY\n\n## Active Threads\n- (P-9LXBA3ZK) prefers Black for Python formatting\n',
    );

    const r = injectContext({ cwd: projectRoot, userDir, sessionId: 'sess-inject-1' });
    expect(r.snapshot).toContain('P-9LXBA3ZK');

    // The recall log was appended by the injection itself — NO cmk command ran.
    const entries = readRecallLog(projectRoot, { session: 'sess-inject-1' });
    expect(entries).toHaveLength(1);
    expect(entries[0].source).toBe('inject');
    expect(entries[0].ids).toContain('P-9LXBA3ZK');
  });

  it('inject ids are deduped and id-shaped only (no prose leaks into ids)', () => {
    const projectRoot = join(sandbox, 'proj');
    const userDir = join(sandbox, 'user');
    writeFile(
      join(projectRoot, 'context', 'MEMORY.md'),
      '# MEMORY\n\n## Active Threads\n- (P-9LXBA3ZK) first mention\n- (P-9LXBA3ZK) same id again\n',
    );

    injectContext({ cwd: projectRoot, userDir, sessionId: 'sess-dedupe' });
    const [entry] = readRecallLog(projectRoot, { session: 'sess-dedupe' });
    const occurrences = entry.ids.filter((id) => id === 'P-9LXBA3ZK');
    expect(occurrences).toHaveLength(1);
    for (const id of entry.ids) {
      // The CANONICAL id shape — the extraction must reject anything the kit's
      // own alphabet rejects (no re-rolled pattern in the assertion either).
      expect(id).toMatch(ID_PATTERN);
    }
  });
});

describe('Task 190 — search wire-site', () => {
  it('search({projectRoot}) appends a source:search entry with the returned ids + query', () => {
    const projectRoot = join(sandbox, 'proj');
    mkdirSync(projectRoot, { recursive: true });
    const db = openIndexDb({ projectRoot, dbPath: join(sandbox, 'memory.db') });
    db.prepare(`
      INSERT INTO observations
        (id, tier, source_file, source_line, source_sha1, heading_path, body,
         write_source, trust, created_at, superseded_by, deleted_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'P-9LXBA3ZK', 'P', 'MEMORY.md', 1, 'a'.repeat(40),
      'MEMORY.md > Active Threads', 'prefers Black for Python formatting',
      'user-explicit', 'high', Date.parse('2026-07-01T10:00:00Z'), null, null, null,
    );

    const r = search({ db, query: 'Black formatting', projectRoot, sessionId: 'sess-search-1' });
    expect(r.action).toBe('found');
    db.close();

    const entries = readRecallLog(projectRoot, { session: 'sess-search-1' });
    expect(entries).toHaveLength(1);
    expect(entries[0].source).toBe('search');
    expect(entries[0].query).toBe('Black formatting');
    expect(entries[0].ids).toContain('P-9LXBA3ZK');
  });

  it('search WITHOUT projectRoot stays pure — no log write anywhere (back-compat)', () => {
    const projectRoot = join(sandbox, 'proj');
    mkdirSync(projectRoot, { recursive: true });
    const db = openIndexDb({ projectRoot, dbPath: join(sandbox, 'memory.db') });
    const r = search({ db, query: 'anything' });
    expect(['found', 'error']).toContain(r.action);
    db.close();
    expect(existsSync(recallLogPath(projectRoot))).toBe(false);
  });
});
