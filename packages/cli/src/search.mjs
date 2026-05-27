// `cmk search` query engine (Task 30, T-026).
//
// Composes on top of:
//   - index-db.mjs       (Task 28) — observations + observations_fts schema
//   - index-rebuild.mjs  (Task 29) — populates the index
//   - result-shapes.mjs  — ERROR_CATEGORIES, errorResult
//
// Three search modes per design §9.3:
//
//   keyword   FTS5 BM25 over the body / heading_path / write_source columns.
//             ~100ms for 10k bullets. Always available — the keyword
//             backend ships in v0.1.0 with no extra install.
//
//   semantic  memsearch + Milvus (Layer 5b — optional install). The kit
//             does NOT ship memsearch in v0.1.0; this mode errors with
//             ERROR_CATEGORIES.SEMANTIC_UNAVAILABLE when the caller
//             requests it without injecting a semantic backend. NO silent
//             fallback to keyword — design §9.3's explicit "exit 2 when
//             not installed" contract.
//
//   hybrid    Reciprocal-rank fusion of keyword + semantic, 0.5/0.5
//             weight per design §9.3. Requires the semantic backend.
//             Errors the same way when semantic is unavailable.
//
// Filter flags (per tasks.md 30.4):
//   minTrust:           'low' | 'medium' | 'high'  — uses ordinal compare
//   tier:               'U' | 'P' | 'L'            — exact match
//   since:              ISO 8601 string             — `created_at >= since`
//   limit:              positive integer            — default 20
//   includeTombstoned:  boolean                     — default false
//                       (default WHERE excludes rows with deleted_at IS NOT NULL)
//
// Public boundary:
//   search({db, query, mode?, minTrust?, tier?, since?, limit?,
//           includeTombstoned?, semanticBackend?})
//   → { action: 'found', mode, results: [{id, snippet, source_file,
//                                          source_line, trust, score}] }
//   → errorResult({category, errors}) on semantic-unavailable / schema-error
//
// `semanticBackend` is a dependency-injection hook for testing the
// hybrid + semantic paths. Production callers (the `cmk search` CLI in
// subcommands.mjs) pass undefined; v0.1.x lands the real backend.

import { ERROR_CATEGORIES, errorResult } from './result-shapes.mjs';
import { VALID_TIERS } from './tier-paths.mjs';

export const SEARCH_MODES = Object.freeze({
  KEYWORD: 'keyword',
  SEMANTIC: 'semantic',
  HYBRID: 'hybrid',
});

export const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 1000;

const TRUST_ORDINAL = Object.freeze({
  low: 1,
  medium: 2,
  high: 3,
});

// Reciprocal-rank fusion constant per design §9.3 (k=60 is the
// standard RRF default from the IR literature; smaller k weights the
// top results more heavily).
const RRF_K = 60;

// --- Validation -------------------------------------------------------

function validateInput(opts) {
  const errors = [];
  if (!opts.db || typeof opts.db.prepare !== 'function') {
    errors.push('db: required, better-sqlite3 Database instance');
  }
  if (
    typeof opts.query !== 'string' ||
    opts.query.trim().length === 0
  ) {
    errors.push('query: required, non-empty string');
  }
  const mode = opts.mode ?? SEARCH_MODES.KEYWORD;
  if (
    mode !== SEARCH_MODES.KEYWORD &&
    mode !== SEARCH_MODES.SEMANTIC &&
    mode !== SEARCH_MODES.HYBRID
  ) {
    errors.push(`mode: must be one of keyword/semantic/hybrid (got ${JSON.stringify(mode)})`);
  }
  if (opts.minTrust !== undefined && !TRUST_ORDINAL[opts.minTrust]) {
    errors.push(`minTrust: must be one of low/medium/high (got ${JSON.stringify(opts.minTrust)})`);
  }
  if (opts.tier !== undefined && !VALID_TIERS.has(opts.tier)) {
    errors.push(`tier: must be one of U/P/L (got ${JSON.stringify(opts.tier)})`);
  }
  if (opts.since !== undefined) {
    const t = Date.parse(opts.since);
    if (!Number.isFinite(t)) {
      errors.push(`since: must be an ISO 8601 date string (got ${JSON.stringify(opts.since)})`);
    }
  }
  if (opts.limit !== undefined) {
    if (
      !Number.isInteger(opts.limit) ||
      opts.limit <= 0 ||
      opts.limit > MAX_LIMIT
    ) {
      errors.push(`limit: must be a positive integer ≤ ${MAX_LIMIT}`);
    }
  }
  return { errors, mode };
}

// --- Keyword (FTS5 BM25) backend --------------------------------------

const KEYWORD_BASE_SQL = `
SELECT
  o.id AS id,
  o.body AS body,
  o.heading_path AS heading_path,
  o.source_file AS source_file,
  o.source_line AS source_line,
  o.tier AS tier,
  o.trust AS trust,
  o.created_at AS created_at,
  o.deleted_at AS deleted_at,
  observations_fts.rank AS score,
  snippet(observations_fts, 0, '<b>', '</b>', '...', 16) AS snippet
FROM observations_fts
JOIN observations o ON o.rowid = observations_fts.rowid
WHERE observations_fts MATCH @query
`;

function buildKeywordSql(opts) {
  const clauses = [];
  const params = { query: opts.query };
  if (opts.tier !== undefined) {
    clauses.push('o.tier = @tier');
    params.tier = opts.tier;
  }
  if (opts.minTrust !== undefined) {
    // SQLite has no enum-ordinal builtin; CASE WHEN translates the
    // string trust to its numeric rank, then compares.
    clauses.push(`
      CASE o.trust
        WHEN 'high' THEN 3
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 1
        ELSE 0
      END >= @min_trust_ord
    `);
    params.min_trust_ord = TRUST_ORDINAL[opts.minTrust];
  }
  if (opts.since !== undefined) {
    clauses.push('o.created_at >= @since_ms');
    params.since_ms = Date.parse(opts.since);
  }
  if (!opts.includeTombstoned) {
    clauses.push('o.deleted_at IS NULL');
  }
  const where = clauses.length > 0 ? ' AND ' + clauses.join(' AND ') : '';
  const sql =
    KEYWORD_BASE_SQL + where + ' ORDER BY observations_fts.rank LIMIT @limit';
  params.limit = opts.limit ?? DEFAULT_LIMIT;
  return { sql, params };
}

// FTS5 parse errors aren't validation errors — they're query-syntax
// errors thrown by SQLite when the user's query violates FTS5 grammar
// (e.g., `"user-explicit"` parses as `user AND NOT explicit` because
// `-` is the NOT operator; `"AND"` / `"OR"` are reserved; `"foo:bar"`
// treats `foo` as a column name and crashes if no such column exists).
// The kit's `cmk search "user-explicit"` is a realistic user query —
// the kit's own `write_source` enum value uses that exact string —
// so the error must surface as a clean schema-error result, NOT as an
// uncaught SqliteError stack trace. Surfaced by the Task 30 code-review
// as Important finding I1.
class FTS5ParseError extends Error {
  constructor(originalError, query) {
    super(`FTS5 parse error on query ${JSON.stringify(query)}: ${originalError.message}`);
    this.name = 'FTS5ParseError';
    this.originalError = originalError;
  }
}

function runKeywordSearch(db, opts) {
  const { sql, params } = buildKeywordSql(opts);
  let rows;
  try {
    rows = db.prepare(sql).all(params);
  } catch (err) {
    // FTS5's parser surfaces grammar violations as SqliteError. Recognize
    // the documented FTS5-specific messages and re-throw as our typed
    // class so the caller (`search()`) can translate to a schema-error
    // result with a user-friendly hint.
    if (
      err?.code === 'SQLITE_ERROR' ||
      /fts5:|no such column:/i.test(err?.message ?? '')
    ) {
      throw new FTS5ParseError(err, opts.query);
    }
    throw err;
  }
  return rows.map((r) => ({
    id: r.id,
    snippet: r.snippet ?? r.body,
    source_file: r.source_file,
    source_line: r.source_line,
    tier: r.tier,
    trust: r.trust,
    score: r.score,
  }));
}

// --- Reciprocal-rank fusion (hybrid mode) -----------------------------

/**
 * Reciprocal-rank fusion of two ranked result lists into one. Design
 * §9.3 specifies 0.5/0.5 weight; standard RRF formula is
 *   fused_score(d) = sum over backends b of: weight_b / (k + rank_b(d))
 * where rank starts at 1 for the top hit. Documents missing from one
 * backend contribute 0 from that backend.
 *
 * Exported for direct unit-test in isolation (the production search()
 * call composes this with the keyword + semantic backends).
 */
export function reciprocalRankFusion({
  keywordResults,
  semanticResults,
  keywordWeight = 0.5,
  semanticWeight = 0.5,
  k = RRF_K,
}) {
  const scores = new Map(); // id → fused score
  const byId = new Map(); // id → result object (first-seen wins for snippet/source)

  keywordResults.forEach((r, i) => {
    const rank = i + 1;
    const inc = keywordWeight / (k + rank);
    scores.set(r.id, (scores.get(r.id) ?? 0) + inc);
    if (!byId.has(r.id)) byId.set(r.id, r);
  });
  semanticResults.forEach((r, i) => {
    const rank = i + 1;
    const inc = semanticWeight / (k + rank);
    scores.set(r.id, (scores.get(r.id) ?? 0) + inc);
    if (!byId.has(r.id)) byId.set(r.id, r);
  });

  const fused = [...scores.entries()]
    .map(([id, score]) => ({ ...byId.get(id), score }))
    .sort((a, b) => b.score - a.score);
  return fused;
}

// --- Public boundary --------------------------------------------------

export function search(opts = {}) {
  const { errors, mode } = validateInput(opts);
  if (errors.length > 0) {
    return errorResult({ category: ERROR_CATEGORIES.SCHEMA, errors });
  }

  // Semantic + hybrid require an injected backend. Production v0.1.0
  // passes undefined → error with the install-memsearch hint. v0.1.x
  // wires the real backend.
  if (mode === SEARCH_MODES.SEMANTIC || mode === SEARCH_MODES.HYBRID) {
    if (typeof opts.semanticBackend !== 'function') {
      return errorResult({
        category: ERROR_CATEGORIES.SEMANTIC_UNAVAILABLE,
        errors: [
          'memsearch not installed — install via the Layer 5b install path. ' +
            'Use --mode=keyword for the always-available FTS5 search.',
        ],
      });
    }
  }

  let results;
  try {
    if (mode === SEARCH_MODES.KEYWORD) {
      results = runKeywordSearch(opts.db, opts);
    } else if (mode === SEARCH_MODES.SEMANTIC) {
      // The semantic backend is an injected callable returning the same
      // shape as runKeywordSearch (array of {id, snippet, source_file,
      // source_line, tier, trust, score}).
      results = opts.semanticBackend(opts);
    } else {
      // hybrid: run both backends + fuse.
      const keywordResults = runKeywordSearch(opts.db, opts);
      const semanticResults = opts.semanticBackend(opts);
      const fused = reciprocalRankFusion({
        keywordResults,
        semanticResults,
      });
      results = fused.slice(0, opts.limit ?? DEFAULT_LIMIT);
    }
  } catch (err) {
    if (err instanceof FTS5ParseError) {
      return errorResult({
        category: ERROR_CATEGORIES.SCHEMA,
        errors: [
          `query: FTS5 parse error — ${err.originalError.message}. ` +
            'Try wrapping the query in double quotes for phrase mode ' +
            '(e.g., `cmk search \'"user-explicit"\'`).',
        ],
      });
    }
    throw err;
  }

  return { action: 'found', mode, results };
}
