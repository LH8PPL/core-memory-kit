// Layer 5b — the embedded semantic backend (Task 65, design §9.3.1 resolved).
//
// Architecture (the D-72 recipe on our stack):
//   - Vectors live INSIDE the kit's existing SQLite index (sqlite-vec vec0
//     virtual table) — one store, no server, no second index to sync.
//   - The embedder is a LOCAL ONNX model via @huggingface/transformers
//     (Node-native; Anthropic has no embeddings API). The dependency is
//     OPTIONAL (~258 MB with onnxruntime): this module lazy-imports it and
//     degrades to a clear "not installed" reason — keyword FTS5 stays the
//     always-available default (claude-mem precedent, §9.3.1).
//   - Embeddings are CONTENT-ADDRESSED (memweave pattern): sha256(model +
//     body) → vector in `embedding_cache`; re-syncs embed only new/changed
//     observations. The vec table mirrors `observations` rowids, so the
//     §9.2.1 mutation propagation (reindexBoot before every search) flows
//     straight into `syncSemanticIndex` — changed rows re-embed, deleted/
//     tombstoned rows drop out of the vec table.
//
// Async boundary (deliberate): `search()` is synchronous and its
// `semanticBackend` DI seam is a SYNC function (Task 120 kept it that way on
// purpose). Embedding a query is async. So the async work happens in
// `prepareSemanticBackend()` — it embeds the QUERY up front and returns a
// sync closure over the query vector for the seam. `search()`'s public
// contract is untouched.
//
// Observation granularity = embedding granularity: kit observations are
// already small (bullets ≤200 chars, fact bodies ≤1500) — each indexed row
// is one embedding; no further chunking needed at kit scale (the memsearch
// ≤1500-char chunking rule is satisfied by construction).

import { createHash } from 'node:crypto';

// The D-105 ladder's WINNER (bake-off 2026-06-10, bench:recall on the Task-99
// corpus): bge-base-en-v1.5 — R@5 0.941 / paraphrase 1.000 in semantic mode,
// vs bge-small 0.824/0.900 and bge-m3 0.765/0.800 (the multilingual giant
// LOSES to the English-tuned base on short memory facts — the ladder found
// its ceiling at rung 2). 768-dim, ~110 MB q8 ONNX download on first use,
// cached by transformers.js. Dims are model-derived at sync time.
export const DEFAULT_MODEL_ID = 'Xenova/bge-base-en-v1.5';
export const DEFAULT_DIMS = 768;

// Module-level extractor cache: the ONNX session costs ~seconds to build;
// one per (process, model).
const extractorCache = new Map();

async function loadExtractor(modelId) {
  if (extractorCache.has(modelId)) return extractorCache.get(modelId);
  // Lazy optional import — the kit does NOT declare this dependency
  // (install weight; §9.3.1 vector-optional). Resolution order: the
  // project's node_modules, then global. Failure → a typed reason.
  let pipeline;
  try {
    ({ pipeline } = await import('@huggingface/transformers'));
  } catch {
    return null;
  }
  const extractor = await pipeline('feature-extraction', modelId, { dtype: 'q8' });
  extractorCache.set(modelId, extractor);
  return extractor;
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function toBlob(floatArray) {
  return Buffer.from(new Float32Array(floatArray).buffer);
}

export function ensureSemanticSchema(db, { dims = DEFAULT_DIMS } = {}) {
  // sqlite-vec is a tiny prebuilt extension (regular dependency).
  // Loading twice is a no-op-safe guard via function probe.
  try {
    db.prepare('SELECT vec_version() AS v').get();
  } catch {
    throw new SqliteVecNotLoadedError();
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS embedding_cache (
      content_sha TEXT PRIMARY KEY,
      model TEXT NOT NULL,
      vector BLOB NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_observations USING vec0(
      embedding float[${dims}]
    );
    CREATE TABLE IF NOT EXISTS vec_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

export class SqliteVecNotLoadedError extends Error {
  constructor() {
    super('sqlite-vec extension is not loaded on this db connection');
  }
}

export function loadSqliteVec(db) {
  // Separate from ensureSemanticSchema so callers that only READ can skip
  // schema DDL. sqlite-vec ships per-platform prebuilds; load() picks one.
  // Idempotent: probe before loading (loading twice on one connection
  // would re-register the extension).
  try {
    db.prepare('SELECT vec_version() AS v').get();
    return Promise.resolve(true);
  } catch {
    // not loaded yet — fall through to the real load
  }
  return import('sqlite-vec').then((m) => {
    m.load(db);
    return true;
  }).catch(() => false);
}

/**
 * Incrementally sync the vec table against `observations`. Embeds only
 * rows whose content hash misses the cache (content-addressed); removes
 * vec rows for deleted/tombstoned observations. Returns counts.
 */
export async function syncSemanticIndex({ db, modelId = DEFAULT_MODEL_ID, dims = null }) {
  // Public boundary in its own right — load the vec extension if this
  // connection doesn't have it yet (prepareSemanticBackend also loads it;
  // both entries must be self-sufficient).
  const vecLoaded = await loadSqliteVec(db);
  if (!vecLoaded) {
    return { ok: false, reason: 'sqlite-vec-unavailable' };
  }
  const extractor = await loadExtractor(modelId);
  if (!extractor) {
    return { ok: false, reason: 'embedder-not-installed' };
  }
  // Dims are MODEL-DERIVED (bge-small 384, bge-base 768, bge-m3 1024 — the
  // D-105 ladder changes models, and a vec0 table's dims are fixed at
  // creation). Probe once per sync; recreate the vec table when the model
  // OR its dims change (different vector space either way).
  if (dims == null) {
    const probe = await extractor('dims probe', { pooling: 'mean', normalize: true });
    dims = probe.tolist()[0].length;
  }
  ensureSemanticSchema(db, { dims });

  // Model/dims change invalidates the vec table (different space).
  const meta = db.prepare("SELECT value FROM vec_meta WHERE key = 'model'").get();
  const dimsMeta = db.prepare("SELECT value FROM vec_meta WHERE key = 'dims'").get();
  if ((meta && meta.value !== modelId) || (dimsMeta && Number(dimsMeta.value) !== dims)) {
    db.exec('DROP TABLE IF EXISTS vec_observations;');
    ensureSemanticSchema(db, { dims });
  }
  const putMeta = db.prepare(
    'INSERT INTO vec_meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );
  putMeta.run('model', modelId);
  putMeta.run('dims', String(dims));

  const live = db
    .prepare(
      'SELECT rowid, body FROM observations WHERE deleted_at IS NULL AND superseded_by IS NULL',
    )
    .all();

  // Drop vec rows that no longer correspond to live observations.
  const liveRowids = new Set(live.map((r) => BigInt(r.rowid)));
  const vecRows = db.prepare('SELECT rowid FROM vec_observations').all();
  const dropStmt = db.prepare('DELETE FROM vec_observations WHERE rowid = ?');
  let dropped = 0;
  for (const r of vecRows) {
    if (!liveRowids.has(BigInt(r.rowid))) {
      dropStmt.run(BigInt(r.rowid));
      dropped += 1;
    }
  }

  // Content-addressed embed: only rows whose (model+body) hash is uncached
  // OR whose vec row is missing/stale get (re)embedded/(re)inserted.
  const cacheGet = db.prepare('SELECT vector FROM embedding_cache WHERE content_sha = ?');
  const cachePut = db.prepare(
    'INSERT OR REPLACE INTO embedding_cache(content_sha, model, vector) VALUES (?, ?, ?)',
  );
  const vecGet = db.prepare('SELECT rowid FROM vec_observations WHERE rowid = ?');
  const vecDel = db.prepare('DELETE FROM vec_observations WHERE rowid = ?');
  const vecPut = db.prepare('INSERT INTO vec_observations(rowid, embedding) VALUES (?, ?)');

  const toEmbed = [];
  const plans = []; // {rowid, sha, cached?}
  for (const row of live) {
    const sha = sha256(`${modelId}\n${row.body}`);
    const cached = cacheGet.get(sha);
    plans.push({ rowid: BigInt(row.rowid), sha, cached: cached?.vector ?? null, body: row.body });
    if (!cached) toEmbed.push(row.body);
  }

  let embedded = 0;
  let vectorsBySha = new Map();
  if (toEmbed.length > 0) {
    // ONE batched extractor call (transformers.js batches in a single
    // forward pass — the dominant cost is per-call, not per-text).
    const out = await extractor(toEmbed, { pooling: 'mean', normalize: true });
    const list = out.tolist();
    let i = 0;
    for (const plan of plans) {
      if (plan.cached) continue;
      const vec = list[i++];
      const blob = toBlob(vec);
      cachePut.run(plan.sha, modelId, blob);
      vectorsBySha.set(plan.sha, blob);
      embedded += 1;
    }
  }

  let upserted = 0;
  for (const plan of plans) {
    const blob = plan.cached ?? vectorsBySha.get(plan.sha);
    if (!blob) continue;
    // vec0 has no UPSERT; delete+insert only when absent or content changed.
    // Cheap presence probe; content change implies a NEW sha (content-
    // addressed), which implies the row was just embedded → refresh it.
    const present = vecGet.get(plan.rowid);
    if (present && plan.cached) {
      continue; // unchanged + already in the vec table
    }
    if (present) vecDel.run(plan.rowid);
    vecPut.run(plan.rowid, blob);
    upserted += 1;
  }

  return { ok: true, embedded, upserted, dropped, total: live.length };
}

/**
 * The async entry the CLI/MCP callers use. Embeds the QUERY, syncs the vec
 * index, and returns a SYNC `backend` function matching the search() DI
 * seam contract: (opts) => [{id, snippet, source_file, source_line, tier,
 * trust, score}] — score in [0,1], higher = closer.
 */
export async function prepareSemanticBackend({
  db,
  query,
  modelId = DEFAULT_MODEL_ID,
  dims = null,
  overFetch = 3,
}) {
  // User control: force-disable the semantic layer (e.g. block the one-time
  // model download on a metered machine, or pin keyword-only behavior).
  // Also the deterministic test hook for the absent-backend error contract.
  if (process.env.CMK_DISABLE_SEMANTIC === '1') {
    return {
      ok: false,
      reason: 'disabled-by-env',
      hint: 'CMK_DISABLE_SEMANTIC=1 is set — unset it to enable semantic/hybrid search.',
    };
  }
  const vecLoaded = await loadSqliteVec(db).catch(() => false);
  if (!vecLoaded) {
    return { ok: false, reason: 'sqlite-vec-unavailable' };
  }
  const extractor = await loadExtractor(modelId);
  if (!extractor) {
    return {
      ok: false,
      reason: 'embedder-not-installed',
      hint:
        'semantic search needs the optional local embedder — install it with: npm install -g @huggingface/transformers ' +
        '(~260 MB incl. ONNX runtime; the model itself downloads once on first use). Keyword search works without it.',
    };
  }
  const sync = await syncSemanticIndex({ db, modelId, dims });
  if (!sync.ok) return { ok: false, reason: sync.reason };

  const qOut = await extractor(query, { pooling: 'mean', normalize: true });
  const qBlob = toBlob(qOut.tolist()[0]);

  const backend = (opts = {}) => {
    const limit = opts.limit ?? 20;
    // Over-fetch (D-72: ~3×) so post-filters (tier/trust/since) don't
    // starve the result list.
    const k = Math.max(limit * overFetch, limit);
    // KNN subquery FIRST (sqlite-vec needs MATCH + LIMIT pushed into the
    // virtual-table scan), then join observation metadata.
    const rows = db
      .prepare(
        `SELECT m.rowid AS rowid, m.distance AS distance,
                o.id, o.body, o.source_file, o.source_line, o.tier, o.trust,
                o.created_at, o.deleted_at
           FROM (SELECT rowid, distance FROM vec_observations
                  WHERE embedding MATCH ? ORDER BY distance LIMIT ?) m
           JOIN observations o ON o.rowid = m.rowid
          ORDER BY m.distance`,
      )
      .all(qBlob, k);

    const minTrustRank = { low: 0, medium: 1, high: 2 };
    const filtered = rows.filter((r) => {
      if (!opts.includeTombstoned && r.deleted_at != null) return false;
      if (opts.tier && r.tier !== opts.tier) return false;
      if (opts.minTrust && minTrustRank[r.trust] < minTrustRank[opts.minTrust]) return false;
      if (opts.since) {
        const sinceMs = Date.parse(opts.since);
        if (Number.isFinite(sinceMs) && r.created_at * 1000 < sinceMs) return false;
      }
      return true;
    });

    return filtered.slice(0, limit).map((r) => ({
      id: r.id,
      snippet: r.body,
      source_file: r.source_file,
      source_line: r.source_line,
      tier: r.tier,
      trust: r.trust,
      // cosine distance (normalized vectors) ∈ [0,2] → similarity ∈ [0,1].
      score: Math.max(0, 1 - r.distance / 2),
      created_at: r.created_at,
    }));
  };

  return { ok: true, backend, sync };
}

// --- Post-fusion rerank (D-72: keyword-overlap 0.30 + temporal 0.40) -------

const RERANK_STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'be', 'do', 'for', 'how', 'in', 'is', 'it', 'of',
  'on', 'or', 'our', 'the', 'this', 'to', 'we', 'what', 'when', 'where',
  'which', 'with',
]);

function contentTokens(text) {
  return new Set(
    (text ?? '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2 && !RERANK_STOPWORDS.has(t)),
  );
}

// Parse "in late May", "~2 weeks ago", "early June" style hints → a target
// epoch-ms, or null. Deliberately heuristic: the date boost should help
// temporal questions without an LLM call (MemPalace's pattern).
export function parseTemporalHint(query, now = Date.now()) {
  const q = query.toLowerCase();
  const ago = q.match(/(\d+)\s*(day|week|month)s?\s*ago/);
  if (ago) {
    const n = Number(ago[1]);
    const unitMs = { day: 86_400_000, week: 604_800_000, month: 2_592_000_000 }[ago[2]];
    return now - n * unitMs;
  }
  const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  for (let m = 0; m < 12; m++) {
    if (q.includes(months[m])) {
      const d = new Date(now);
      let year = d.getUTCFullYear();
      // A month later than "now" almost certainly refers to LAST year's.
      if (m > d.getUTCMonth()) year -= 1;
      let day = 15;
      if (q.includes(`early ${months[m]}`)) day = 5;
      if (q.includes(`late ${months[m]}`)) day = 25;
      return Date.UTC(year, m, day);
    }
  }
  return null;
}

/**
 * Rerank fused results: keyword-overlap boost (weight 0.30) + temporal-
 * proximity boost (weight 0.40, only when the query carries a date hint
 * and the result carries created_at). Pure + deterministic (zero API) —
 * the D-72 "~98% without LLM" stage. Results without created_at simply
 * skip the temporal term.
 */
export function rerankResults(results, { query, now = Date.now(), temporalWindowMs = 45 * 86_400_000 } = {}) {
  const qTokens = contentTokens(query);
  const target = parseTemporalHint(query, now);
  const scored = results.map((r, i) => {
    let s = r.score ?? 0;
    if (qTokens.size > 0) {
      const rTokens = contentTokens(r.snippet);
      let overlap = 0;
      for (const t of qTokens) if (rTokens.has(t)) overlap += 1;
      s *= 1 + 0.3 * (overlap / qTokens.size);
    }
    if (target != null && r.created_at != null) {
      const diff = Math.abs(r.created_at * 1000 - target);
      const boost = Math.max(0, 0.4 * (1 - diff / temporalWindowMs));
      s *= 1 + boost;
    }
    return { ...r, score: s, _i: i };
  });
  scored.sort((a, b) => b.score - a.score || a._i - b._i);
  return scored.map(({ _i, ...r }) => r);
}
