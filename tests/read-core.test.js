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
import { mkdtempSync, rmSync } from 'node:fs';
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
