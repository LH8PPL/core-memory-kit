// @doors: 1
// Door 2 N/A: the read cores are pure queries — they never write disk.
// Door 3 N/A: no subprocess at this boundary.
// Door 4 N/A: no NDJSON/audit-log surface (read path).
// Door 5 N/A: no message queue.
//
// Task 108b — unit coverage for the shared read cores (read-core.mjs). These
// back BOTH the MCP read tools (mk_get / mk_timeline / mk_cite /
// mk_recent_activity) AND the CLI read verbs (cmk get / timeline / cite /
// recent-activity), so they are the single source for read-result shape.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { install } from '../packages/cli/src/install.mjs';
import { openIndexDb } from '../packages/cli/src/index-db.mjs';
import {
  getObservations,
  citeLink,
  buildTimeline,
  recentActivity,
} from '../packages/cli/src/read-core.mjs';
import { writeFact } from '../packages/cli/src/write-fact.mjs';
import { forget } from '../packages/cli/src/forget.mjs';

let sandbox, projectRoot, db;

function seed(db, { id, body, created_at = Date.parse('2026-05-27T10:00:00Z') }) {
  db.prepare(`
    INSERT INTO observations
      (id, tier, source_file, source_line, source_sha1, heading_path, body,
       write_source, trust, created_at, superseded_by, deleted_at)
    VALUES (?, 'P', 'MEMORY.md', 1, ?, 'MEMORY.md > Active Threads', ?,
            'user-explicit', 'high', ?, null, null)
  `).run(id, 'a'.repeat(40), body, created_at);
}

beforeEach(async () => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-readcore-'));
  projectRoot = join(sandbox, 'proj');
  await install({ projectRoot, userTier: join(sandbox, 'user') });
  db = openIndexDb({ projectRoot });
});
afterEach(() => {
  db?.close();
  rmSync(sandbox, { recursive: true, force: true });
});

describe('read-core (108b shared read cores)', () => {
  it('getObservations: full row for a hit; {id,error} for missing + invalid', () => {
    seed(db, { id: 'P-AAAAAAAA', body: 'hello world' });
    const rows = getObservations(db, ['P-AAAAAAAA', 'P-BBBBBBBB', 'not-an-id']);
    expect(rows[0].body).toBe('hello world');
    expect(rows[0].trust).toBe('high');
    expect(rows[1]).toEqual({ id: 'P-BBBBBBBB', error: 'not found' });
    expect(rows[2]).toEqual({ id: 'not-an-id', error: 'invalid id format' });
  });

  // Task 155 (D-163) — opt-in tombstone recovery on `getObservations`. The
  // default stays live-only (a forgotten id → not found); ONLY an explicit
  // includeTombstoned + projectRoot reads context/memory/archive/tombstones/.
  // This is the HUMAN-only recovery path; MCP mk_get never passes the flag.
  describe('getObservations --include-tombstoned (Task 155 / D-163)', () => {
    // Write a real fact, then forget it (real chain → tombstone file + pruned row).
    function rememberThenForget(body, title) {
      const w = writeFact({
        projectRoot, tier: 'P', type: 'project', slug: title, title, body,
        writeSource: 'user-explicit', trust: 'high',
        sourceFile: 'MEMORY.md', sourceLine: 1, sourceSha1: 'a'.repeat(40),
        createdAt: '2026-05-27T10:00:00Z',
      });
      expect(w.action).not.toBe('error');
      const f = forget({ idOrQuery: w.id, projectRoot, userDir: join(sandbox, 'user'), yes: true });
      expect(f.action).toBe('tombstoned');
      return w.id;
    }

    it('default (no flag): a forgotten id returns {error:"not found"} — live-only', () => {
      const id = rememberThenForget('the deploy target is fly.io', 'deploy-target');
      const rows = getObservations(db, [id]); // no opts → default
      expect(rows[0]).toEqual({ id, error: 'not found' });
    });

    it('includeTombstoned + projectRoot: recovers the tombstoned body + deletion provenance', () => {
      const id = rememberThenForget('the deploy target is fly.io', 'deploy-target');
      const rows = getObservations(db, [id], { includeTombstoned: true, projectRoot });
      expect(rows[0].id).toBe(id);
      expect(rows[0].body).toContain('fly.io');
      expect(rows[0].tombstoned).toBe(true);        // flagged as recovered, not live
      expect(rows[0].deleted_at).toBeTruthy();       // deletion provenance carried
      expect(rows[0].error).toBeUndefined();
    });

    it('includeTombstoned does NOT resurrect a live fact path (a real live hit still wins)', () => {
      seed(db, { id: 'P-AAAAAAAA', body: 'a live fact' });
      const rows = getObservations(db, ['P-AAAAAAAA'], { includeTombstoned: true, projectRoot });
      expect(rows[0].body).toBe('a live fact');
      expect(rows[0].tombstoned).toBeUndefined();    // live → not flagged tombstoned
    });

    it('includeTombstoned with a genuinely-unknown id still returns not found', () => {
      const rows = getObservations(db, ['P-ZZZZZZZZ'], { includeTombstoned: true, projectRoot });
      expect(rows[0]).toEqual({ id: 'P-ZZZZZZZZ', error: 'not found' });
    });

    it('includeTombstoned WITHOUT projectRoot is a no-op (can’t locate the archive) → not found', () => {
      const id = rememberThenForget('secret recovery body', 'recover-me');
      const rows = getObservations(db, [id], { includeTombstoned: true }); // no projectRoot
      expect(rows[0]).toEqual({ id, error: 'not found' });
    });

    it('a malformed/frontmatter-less tombstone degrades gracefully (raw body, null provenance, no crash)', () => {
      // A human runs --include-tombstoned precisely when something went wrong;
      // a garbled tombstone must still surface its content, not throw.
      const id = 'P-MFA9NMBC';
      const tombDir = join(projectRoot, 'context', 'memory', 'archive', 'tombstones');
      mkdirSync(tombDir, { recursive: true });
      writeFileSync(join(tombDir, `${id}.md`), 'just raw text, no frontmatter at all', 'utf8');
      const rows = getObservations(db, [id], { includeTombstoned: true, projectRoot });
      expect(rows[0].tombstoned).toBe(true);
      expect(rows[0].body).toContain('just raw text');
      expect(rows[0].deleted_at).toBeNull(); // unknown provenance, honestly null
      expect(rows[0].error).toBeUndefined();
    });

    it('a path-traversal id is rejected by ID_PATTERN BEFORE any file read (no archive escape)', () => {
      // The validation-before-join order is the path-traversal defense. Lock it:
      // a crafted id must fail format-validation, never reach readTombstone.
      for (const evil of ['P-../../etc', 'P-AAAA/../x', '../../secret']) {
        const rows = getObservations(db, [evil], { includeTombstoned: true, projectRoot }); // validate-test-ids: ignore
        expect(rows[0]).toEqual({ id: evil, error: 'invalid id format' });
      }
    });
  });

  it('citeLink: canonical link for a valid id; ok:false for a bad one', () => {
    expect(citeLink('P-AAAAAAAA')).toEqual({
      ok: true,
      link: '[#P-AAAAAAAA](memkit://obs/P-AAAAAAAA)',
    });
    expect(citeLink('nope')).toEqual({ ok: false, error: 'id must match ID_PATTERN' });
  });

  it('buildTimeline: before + anchor + after by created_at; rejects bad/missing anchor', () => {
    seed(db, { id: 'P-AAAAAAAA', body: 'older', created_at: 1000 });
    seed(db, { id: 'P-BBBBBBBB', body: 'anchor', created_at: 2000 });
    seed(db, { id: 'P-CCCCCCCC', body: 'newer', created_at: 3000 });
    const r = buildTimeline(db, { anchor: 'P-BBBBBBBB', depthBefore: 5, depthAfter: 5 });
    expect(r.ok).toBe(true);
    expect(r.timeline.map((o) => o.id)).toEqual(['P-AAAAAAAA', 'P-BBBBBBBB', 'P-CCCCCCCC']);
    expect(buildTimeline(db, { anchor: 'bad' })).toEqual({ ok: false, error: 'anchor must be a valid kit ID' });
    expect(buildTimeline(db, { anchor: 'P-ZZZZZZZZ' })).toEqual({ ok: false, error: 'anchor not found' });
  });

  it('buildTimeline: depth bounds the window on each side', () => {
    seed(db, { id: 'P-AAAAAAAA', body: 'b2', created_at: 1000 });
    seed(db, { id: 'P-BBBBBBBB', body: 'b1', created_at: 1500 });
    seed(db, { id: 'P-CCCCCCCC', body: 'anchor', created_at: 2000 });
    seed(db, { id: 'P-DDDDDDDD', body: 'a1', created_at: 2500 });
    const r = buildTimeline(db, { anchor: 'P-CCCCCCCC', depthBefore: 1, depthAfter: 1 });
    expect(r.timeline.map((o) => o.id)).toEqual(['P-BBBBBBBB', 'P-CCCCCCCC', 'P-DDDDDDDD']);
  });

  it('recentActivity: window-filtered newest-first; rejects a bad window', () => {
    seed(db, { id: 'P-AAAAAAAA', body: 'recent', created_at: Date.now() - 60 * 1000 });
    seed(db, { id: 'P-BBBBBBBB', body: 'old', created_at: Date.now() - 8 * 24 * 60 * 60 * 1000 });
    const r = recentActivity(db, { window: '24h', limit: 20 });
    expect(r.ok).toBe(true);
    expect(r.rows.map((o) => o.id)).toEqual(['P-AAAAAAAA']);
    expect(recentActivity(db, { window: '99y' })).toEqual({ ok: false, error: 'window must be 1h|24h|7d' });
  });
});
