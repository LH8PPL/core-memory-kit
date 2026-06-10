// @doors: 1, 2
// Door 3 N/A: the embedder runs IN-PROCESS (ONNX via transformers.js) — no
//   subprocess is spawned anywhere in this module.
// Door 4 N/A: the backend emits no NDJSON logs; its observable surface is the
//   returned result rows + the db tables asserted here (Door 2). The CLI/MCP
//   error paths (actionable hint on absent embedder) are asserted in
//   cli-search.test.js / cli-mcp-server.test.js.
// Door 5 N/A: no message-queue interaction.
//
// Tests for Task 65 — the embedded semantic backend (semantic-backend.mjs).
// Boundary: ensureSemanticSchema / syncSemanticIndex / prepareSemanticBackend
// / rerankResults / parseTemporalHint. Integration cases use the REAL
// embedder with the SMALL model (Xenova/bge-small-en-v1.5, ~30 MB q8 — the
// test rung; production default is bge-base per the D-109 bake-off) and skip
// gracefully when the optional dep / network is unavailable (the live-Haiku
// skip pattern).

import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import {
  rerankResults,
  parseTemporalHint,
  syncSemanticIndex,
  prepareSemanticBackend,
} from '../packages/cli/src/semantic-backend.mjs';
import { INDEX_DB_SCHEMA } from '../packages/cli/src/index-db.mjs';

const TEST_MODEL = 'Xenova/bge-small-en-v1.5';

// Probe the optional embedder once; integration cases skip without it.
let embedderAvailable = process.env.CMK_SKIP_EMBEDDER === '1' ? false : null;
async function probeEmbedder() {
  if (embedderAvailable !== null) return embedderAvailable;
  try {
    await import('@huggingface/transformers');
    embedderAvailable = true;
  } catch {
    embedderAvailable = false;
  }
  return embedderAvailable;
}

function makeDb(rows = []) {
  const db = new Database(':memory:');
  db.exec(INDEX_DB_SCHEMA);
  const ins = db.prepare(
    `INSERT INTO observations (id, tier, source_file, source_line, source_sha1,
       heading_path, body, write_source, trust, created_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  rows.forEach((r, i) =>
    ins.run(
      r.id,
      r.tier ?? 'P',
      r.source_file ?? 'context/MEMORY.md',
      r.source_line ?? i + 1,
      'a'.repeat(40),
      null,
      r.body,
      'user-explicit',
      r.trust ?? 'high',
      r.created_at ?? Math.floor(Date.parse('2026-05-15T00:00:00Z') / 1000),
      r.deleted_at ?? null,
    ),
  );
  return db;
}

const ROWS = [
  { id: 'P-AAAA2222', body: 'Valkey is the caching layer for hot reads, 5ms p99 SLA.' },
  { id: 'P-BBBB3333', body: 'Deploys go through GitHub Actions to Fly.io on merge to main.' },
  {
    id: 'P-CCCC4444',
    body: 'Migrated the primary database to CockroachDB in late May.',
    created_at: Math.floor(Date.parse('2026-05-28T00:00:00Z') / 1000),
  },
];

describe('Task 65 — rerank stage (pure, Door 1)', () => {
  it('keyword-overlap boost lifts the result sharing query tokens', () => {
    const results = [
      { id: 'a', snippet: 'totally unrelated text here', score: 0.5 },
      { id: 'b', snippet: 'the caching layer uses valkey', score: 0.5 },
    ];
    const out = rerankResults(results, { query: 'caching layer choice' });
    expect(out[0].id).toBe('b');
  });

  it('temporal boost lifts the date-proximate result when the query carries a hint', () => {
    const now = Date.parse('2026-06-10T00:00:00Z');
    const mayTs = Math.floor(Date.parse('2026-05-25T00:00:00Z') / 1000);
    const aprTs = Math.floor(Date.parse('2026-03-01T00:00:00Z') / 1000);
    const results = [
      { id: 'old', snippet: 'database choice notes', score: 0.5, created_at: aprTs },
      { id: 'recent', snippet: 'database choice notes', score: 0.5, created_at: mayTs },
    ];
    const out = rerankResults(results, { query: 'what changed in late may', now });
    expect(out[0].id).toBe('recent');
  });

  it('no hint + no overlap → order preserved (stable)', () => {
    const results = [
      { id: 'x', snippet: 'alpha', score: 0.5 },
      { id: 'y', snippet: 'beta', score: 0.5 },
    ];
    const out = rerankResults(results, { query: 'zzz qqq' });
    expect(out.map((r) => r.id)).toEqual(['x', 'y']);
  });

  it('parseTemporalHint: "N weeks ago", month names with early/late, none', () => {
    const now = Date.parse('2026-06-10T00:00:00Z');
    expect(parseTemporalHint('what did we do 2 weeks ago', now)).toBe(
      now - 2 * 604_800_000,
    );
    expect(parseTemporalHint('the late may migration', now)).toBe(Date.UTC(2026, 4, 25));
    // A month AFTER "now" refers to last year.
    expect(parseTemporalHint('the december incident', now)).toBe(Date.UTC(2025, 11, 15));
    expect(parseTemporalHint('no dates here', now)).toBeNull();
  });
});

describe('Task 65 — sync + query (real embedder, small model; Doors 1+2)', () => {
  it('syncs, caches content-addressed, queries by meaning, excludes tombstones, honors filters', async () => {
    if (!(await probeEmbedder())) {
      console.log('embedder unavailable — integration cases skipped');
      return;
    }
    const db = makeDb([
      ...ROWS,
      {
        id: 'P-DDDD5555',
        body: 'A tombstoned secret note that must never surface.',
        deleted_at: 1,
      },
    ]);
    try {
      // Door 2 — first sync embeds the 3 live rows (tombstone excluded).
      const s1 = await syncSemanticIndex({ db, modelId: TEST_MODEL });
      expect(s1.ok).toBe(true);
      expect(s1.total).toBe(3);
      expect(s1.embedded).toBe(3);
      // Second sync: content-addressed cache → ZERO re-embeds (memweave
      // pattern), nothing dropped (over-mutation guard on the cache).
      const s2 = await syncSemanticIndex({ db, modelId: TEST_MODEL });
      expect(s2.embedded).toBe(0);
      expect(s2.dropped).toBe(0);
      expect(db.prepare('SELECT COUNT(*) AS n FROM embedding_cache').get().n).toBe(3);

      // Door 1 — the seam contract: paraphrase query finds the Valkey row.
      const prep = await prepareSemanticBackend({
        db,
        query: 'what is our key-value store choice',
        modelId: TEST_MODEL,
      });
      expect(prep.ok).toBe(true);
      const hits = prep.backend({ limit: 3 });
      expect(hits[0]).toMatchObject({
        id: 'P-AAAA2222',
        tier: 'P',
        trust: 'high',
        source_file: 'context/MEMORY.md',
      });
      expect(hits[0].score).toBeGreaterThan(0);
      expect(hits[0].score).toBeLessThanOrEqual(1);
      // Tombstone never surfaces.
      expect(hits.map((h) => h.id)).not.toContain('P-DDDD5555');
      // Filters compose: a tier filter that matches nothing → empty.
      expect(prep.backend({ limit: 3, tier: 'U' })).toEqual([]);
    } finally {
      db.close();
    }
  }, 240_000);

  it('model change drops + rebuilds the vec table (different vector space)', async () => {
    if (!(await probeEmbedder())) return;
    const db = makeDb(ROWS);
    try {
      await syncSemanticIndex({ db, modelId: TEST_MODEL });
      const before = db.prepare("SELECT value FROM vec_meta WHERE key = 'model'").get();
      expect(before.value).toBe(TEST_MODEL);
      // Re-sync with the same model: vec rows survive (no spurious rebuild).
      const again = await syncSemanticIndex({ db, modelId: TEST_MODEL });
      expect(again.embedded).toBe(0);
      expect(db.prepare('SELECT COUNT(*) AS n FROM vec_observations').get().n).toBe(3);
    } finally {
      db.close();
    }
  }, 240_000);

  it('deleting an observation drops its vec row on the next sync (§9.2.1 propagation)', async () => {
    if (!(await probeEmbedder())) return;
    const db = makeDb(ROWS);
    try {
      await syncSemanticIndex({ db, modelId: TEST_MODEL });
      db.prepare("UPDATE observations SET deleted_at = 1 WHERE id = 'P-BBBB3333'").run();
      const s = await syncSemanticIndex({ db, modelId: TEST_MODEL });
      expect(s.dropped).toBe(1);
      expect(db.prepare('SELECT COUNT(*) AS n FROM vec_observations').get().n).toBe(2);
      // Over-mutation guard: the other two rows are untouched.
      const prep = await prepareSemanticBackend({
        db,
        query: 'caching layer',
        modelId: TEST_MODEL,
      });
      expect(prep.backend({ limit: 5 }).map((h) => h.id)).toContain('P-AAAA2222');
    } finally {
      db.close();
    }
  }, 240_000);
});

// Task 104.2 — the transcripts scope: vec_transcripts beside vec_observations,
// the SHARED content-addressed embedding cache, synthetic T: ids matching the
// keyword backend's fusion keys.
describe('Task 104.2 — semantic over the transcripts scope (real embedder, small model)', () => {
  it('embeds transcript chunks, recalls by meaning, never leaks into the facts scope', async () => {
    if (!(await probeEmbedder())) return;
    const db = makeDb([]);
    try {
      db.prepare(
        'INSERT INTO transcript_chunks (source_file, chunk_idx, source_line, heading, body) VALUES (?, ?, ?, ?, ?)',
      ).run(
        'context/transcripts/2026-06-10.md', 0, 7,
        '## 2026-06-10T10:00:00Z — assistant',
        'We fixed the login failure by rotating the expired API credential.',
      );
      db.prepare(
        'INSERT INTO transcript_chunks (source_file, chunk_idx, source_line, heading, body) VALUES (?, ?, ?, ?, ?)',
      ).run(
        'context/transcripts/2026-06-09.md', 0, 3,
        '## 2026-06-09T09:00:00Z — assistant',
        'Refactored the CSS grid layout for the dashboard.',
      );

      const prep = await prepareSemanticBackend({
        db,
        query: 'why could users not sign in',
        modelId: TEST_MODEL,
        scope: 'transcripts',
      });
      expect(prep.ok).toBe(true);
      const hits = prep.backend({ limit: 2 });
      expect(hits.length).toBeGreaterThan(0);
      // Paraphrase recall: "sign in" finds the login-credential turn first.
      expect(hits[0].id).toBe('T:context/transcripts/2026-06-10.md:7');
      expect(hits[0].snippet).toContain('rotating the expired API credential');

      // Scope isolation: the FACTS scope sees nothing (no observations seeded).
      const factsPrep = await prepareSemanticBackend({
        db,
        query: 'why could users not sign in',
        modelId: TEST_MODEL,
        scope: 'facts',
      });
      expect(factsPrep.ok).toBe(true);
      expect(factsPrep.backend({ limit: 5 })).toHaveLength(0);
    } finally {
      db.close();
    }
  }, 240_000);
});
