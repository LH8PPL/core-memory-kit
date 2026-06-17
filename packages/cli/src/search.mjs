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
//   semantic  the Layer-5b semantic backend (Task 65: sqlite-vec + local ONNX embedder; the embedded
//             vector backend is a future release; the DI seam below is the
//             drop-in point). Until then this mode errors with
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

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ERROR_CATEGORIES, errorResult } from './result-shapes.mjs';
import { VALID_TIERS } from './tier-paths.mjs';

export const SEARCH_MODES = Object.freeze({
  KEYWORD: 'keyword',
  SEMANTIC: 'semantic',
  HYBRID: 'hybrid',
});

export const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 1000;

// Task 104.2 (D-117) — search scopes. 'facts' = the curated observation
// index (L1, the default). 'transcripts' = the SEPARATE raw-transcript
// chunk index (the L3 last-resort tier) — reached ONLY when explicitly
// asked, so raw history never pollutes curated results.
// Task 156 (D-168) — 'decisions' = the append-only decision journal
// (context/DECISIONS.md). Deliberately NOT FTS-indexed (a derived view,
// skipped like INDEX.md), so this scope scans the markdown file directly. It
// is the recall path for decision-HISTORY / "what did we reject / why did X
// change" queries — the journal carries the retract/supersede trail the flat
// fact store no longer holds. Keyword-only (the journal is not embedded).
export const SEARCH_SCOPES = Object.freeze({
  FACTS: 'facts',
  TRANSCRIPTS: 'transcripts',
  DECISIONS: 'decisions',
});

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
  const scope = opts.scope ?? SEARCH_SCOPES.FACTS;
  if (
    scope !== SEARCH_SCOPES.FACTS &&
    scope !== SEARCH_SCOPES.TRANSCRIPTS &&
    scope !== SEARCH_SCOPES.DECISIONS
  ) {
    errors.push(`scope: must be one of facts/transcripts/decisions (got ${JSON.stringify(scope)})`);
  }
  if (scope === SEARCH_SCOPES.TRANSCRIPTS) {
    // Chunks carry no tier/trust/created_at — rejecting these is more honest
    // than silently ignoring them (the explicit-vs-configured asymmetry rule).
    for (const [key, label] of [
      ['tier', 'tier'],
      ['minTrust', 'minTrust'],
      ['since', 'since'],
    ]) {
      if (opts[key] !== undefined) {
        errors.push(`${label}: not supported under the transcripts scope (raw chunks carry no ${label})`);
      }
    }
  }
  if (scope === SEARCH_SCOPES.DECISIONS) {
    // The journal is a flat markdown file, not the index: it carries no
    // tier/trust/created_at columns and isn't embedded. Reject those filters +
    // semantic/hybrid modes (same explicit-vs-configured honesty as transcripts).
    for (const [key, label] of [
      ['tier', 'tier'],
      ['minTrust', 'minTrust'],
      ['since', 'since'],
    ]) {
      if (opts[key] !== undefined) {
        errors.push(`${label}: not supported under the decisions scope (journal entries carry no ${label})`);
      }
    }
    if (mode !== SEARCH_MODES.KEYWORD) {
      errors.push(`mode: only keyword is supported under the decisions scope (the journal is not embedded)`);
    }
    if (typeof opts.projectRoot !== 'string' || opts.projectRoot.length === 0) {
      errors.push('projectRoot: required for the decisions scope (to locate context/DECISIONS.md)');
    }
  }
  return { errors, mode, scope };
}

// --- FTS5 query sanitization (Task 153) -------------------------------
//
// FTS5's MATCH grammar (sqlite.org/fts5 §3) treats many characters a user
// would type in a natural query as operators or syntax errors:
//   - a bareword may ONLY contain letters / digits / underscore / non-ASCII;
//     a `.`, `-`, `:`, `+`, `^`, `(`, etc. in a bareword is a SYNTAX ERROR.
//   - `AND` / `OR` / `NOT` (case-sensitive) are reserved boolean operators.
// So `cmk search v0.3` crashed (`v0` then `.3` → `.` violates the bareword
// grammar), and `cmk search user-explicit` parsed `-` as a column-exclude.
//
// The SQLite-sanctioned fix is to double-quote the offending token: inside a
// quoted string the tokenizer treats `.`/`-`/`:` as separators, so `"v0.3"`
// tokenizes to `v0` + `3` and matches the literal content. We quote
// PER-TOKEN (not the whole query) so a plain multi-word query keeps its
// implicit-AND semantics (better recall) rather than collapsing to a strict
// adjacency phrase. A token the user already quoted is left untouched.
//
// Validated against the FTS5 spec AND basic-memory's real implementation
// (the kit's closest FTS5 + markdown-native design analog). Full rationale:
// docs/research/2026-06-15-fts5-query-preparation-cross-system.md.

// A bareword that FTS5 accepts as-is: letters, digits, underscore, non-ASCII.
// Anything else in the token means it must be quoted to be a literal.
const FTS5_BAREWORD_RE = /^[\p{L}\p{N}_]+$/u;
const FTS5_RESERVED_WORDS = new Set(['AND', 'OR', 'NOT']);

// Quote a single token for literal FTS5 matching, escaping embedded `"`
// SQL-style (double it) per the spec. Used only when the token isn't a safe
// bareword.
function quoteFtsToken(token) {
  return `"${token.replace(/"/g, '""')}"`;
}

/**
 * Transform a raw user query into an FTS5-safe MATCH string.
 *
 * Per-token: a safe bareword passes through untouched (preserving
 * implicit-AND between words); a token with FTS5-special characters or a
 * bare reserved word (AND/OR/NOT) is double-quoted (literal). A token the
 * user already wrapped in `"…"` is preserved verbatim — explicit phrase
 * search still works for power users.
 *
 * Exported for isolated unit testing (like reciprocalRankFusion).
 *
 * @param {string} raw the user's query
 * @returns {string} an FTS5-safe MATCH expression ('' for empty input)
 */
export function prepareFtsQuery(raw) {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (trimmed === '') return '';

  return tokenizeQuery(trimmed)
    .map((token) => {
      // Already a user-quoted phrase (`"…"`, possibly multi-word): leave it
      // exactly as typed — explicit phrase search still works for power users.
      if (token.length >= 2 && token.startsWith('"') && token.endsWith('"')) {
        return token;
      }
      // Safe bareword that isn't a reserved operator: pass through.
      if (FTS5_BAREWORD_RE.test(token) && !FTS5_RESERVED_WORDS.has(token)) {
        return token;
      }
      // Everything else (special chars, or a bare AND/OR/NOT): quote literal.
      return quoteFtsToken(token);
    })
    .join(' ');
}

// Split a query into tokens, keeping a double-quoted span (which may contain
// spaces, e.g. `"thin routes"`) as ONE token. A naive whitespace split would
// tear `"thin routes"` into `"thin` + `routes"` and corrupt the quoting.
// Unbalanced trailing quote: the final quoted run extends to end-of-string.
function tokenizeQuery(query) {
  const tokens = [];
  let i = 0;
  while (i < query.length) {
    if (/\s/.test(query[i])) {
      i += 1;
      continue;
    }
    if (query[i] === '"') {
      // A `"` at a token boundary opens a phrase span: consume up to and
      // including the closing quote (or end-of-string if unbalanced).
      let j = i + 1;
      while (j < query.length && query[j] !== '"') j += 1;
      const end = j < query.length ? j + 1 : query.length;
      tokens.push(query.slice(i, end));
      i = end;
    } else {
      // A run of non-space characters. A `"` that appears MID-run (e.g.
      // `he"llo`) is part of this token, NOT a phrase delimiter — it'll be
      // escaped + quoted as a literal by prepareFtsQuery. Only whitespace
      // ends the run.
      let j = i;
      while (j < query.length && !/\s/.test(query[j])) j += 1;
      tokens.push(query.slice(i, j));
      i = j;
    }
  }
  return tokens;
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
  const params = { query: prepareFtsQuery(opts.query) };
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

// --- Transcript-scope keyword backend (Task 104.2, the L3 raw tier) ----

const TRANSCRIPT_KEYWORD_SQL = `
SELECT
  t.source_file AS source_file,
  t.source_line AS source_line,
  t.heading AS heading,
  transcript_chunks_fts.rank AS score,
  snippet(transcript_chunks_fts, 0, '<b>', '</b>', '...', 16) AS snippet
FROM transcript_chunks_fts
JOIN transcript_chunks t ON t.rowid = transcript_chunks_fts.rowid
WHERE transcript_chunks_fts MATCH @query
ORDER BY transcript_chunks_fts.rank
LIMIT @limit
`;

// Synthetic, readable id for a raw chunk (chunks are locations, not curated
// facts — no [PUL]-XXXXXXXX identity). Also the RRF fusion key in hybrid
// mode and the drill-back handle the memory-search skill surfaces.
function transcriptHitId(row) {
  return `T:${row.source_file}:${row.source_line}`;
}

function runTranscriptKeywordSearch(db, opts) {
  let rows;
  try {
    rows = db
      .prepare(TRANSCRIPT_KEYWORD_SQL)
      .all({ query: prepareFtsQuery(opts.query), limit: opts.limit ?? DEFAULT_LIMIT });
  } catch (err) {
    if (err?.code === 'SQLITE_ERROR' || /fts5:|no such column:/i.test(err?.message ?? '')) {
      throw new FTS5ParseError(err, opts.query);
    }
    throw err;
  }
  return rows.map((r) => ({
    id: transcriptHitId(r),
    // Raw turns contain newlines (dialogue + Tools blocks) — flatten so the
    // one-line-per-hit output contract holds across scopes.
    snippet: flattenSnippet(r.snippet),
    source_file: r.source_file,
    source_line: r.source_line,
    heading: r.heading,
    score: r.score,
  }));
}

const TRANSCRIPT_SNIPPET_MAX = 240;

function flattenSnippet(s) {
  const flat = String(s ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > TRANSCRIPT_SNIPPET_MAX ? flat.slice(0, TRANSCRIPT_SNIPPET_MAX) + '…' : flat;
}

// --- Decisions-scope keyword backend (Task 156, the decision journal) ---

// The journal entry shape (decisions-journal.mjs buildDecisionEntry):
//   <!-- decision:P-XXXXXXXX -->
//   ### <title>                       (a retracted entry carries _(retracted DATE)_)
//   **When:** <date> · **Fact:** `<id>`
//   **Why:** <why>                    (optional)
// Entries are separated by the machine marker; we split on it, match the query
// as a case-insensitive substring over the entry text, and report the retract
// marker so recall can answer "did this change / what did we reject".
const DECISION_MARKER_RE = /<!--\s*decision:([PUL]-[^\s]+)\s*-->/g;
const DECISIONS_SNIPPET_MAX = 240;

function runDecisionsKeywordSearch(_db, opts) {
  const file = join(opts.projectRoot, 'context', 'DECISIONS.md');
  if (!existsSync(file)) return []; // no journal yet → empty, not an error
  const content = readFileSync(file, 'utf8');

  // Split the body into entry spans keyed by the decision marker. Each span runs
  // from its marker to the next marker (or EOF). A marker is an entry boundary
  // ONLY at line-start — the writer (buildDecisionEntry) always emits it first
  // on its own line, so a marker QUOTED inside a Why/body (a meta-decision about
  // the journal format, or a fact citing another's marker) does NOT false-split
  // the entry (skill-review I2). DECISION_MARKER_RE is module-level /g + reset
  // here; the function is fully synchronous (no await between reset and the
  // loop), so there is no shared-state re-entrancy hazard.
  const markers = [];
  let m;
  DECISION_MARKER_RE.lastIndex = 0;
  while ((m = DECISION_MARKER_RE.exec(content)) !== null) {
    const atLineStart = m.index === 0 || content[m.index - 1] === '\n';
    if (atLineStart) markers.push({ id: m[1], start: m.index });
  }

  const needle = opts.query.trim().toLowerCase();
  const hits = [];
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i].start;
    const end = i + 1 < markers.length ? markers[i + 1].start : content.length;
    const block = content.slice(start, end);
    // Strip the plumbing (the `<!-- decision:ID -->` marker + the `### ` heading
    // hashes) BEFORE matching, so the query matches the human signal (title /
    // When / Why) — NOT the literal word "decision" inside every marker comment
    // (the self-review false-positive: searching "decision" matched all entries
    // via their markers). Uses a FRESH regex (not the shared module-level
    // DECISION_MARKER_RE) so the loop's .exec lastIndex isn't clobbered.
    const cleaned = block
      .replace(/<!--\s*decision:[PUL]-[^\s]+\s*-->/g, '')
      .replace(/^#{1,6}\s+/gm, '');
    if (!cleaned.toLowerCase().includes(needle)) continue;

    // The line offset of the marker = source_line drill-back into DECISIONS.md.
    const sourceLine = content.slice(0, start).split('\n').length;
    // Retracted-tag detection mirrors the WRITER's contract: the tag sits on its
    // own line DIRECTLY after the `### ` heading (decisions-journal.mjs §2), so
    // scope the check there — NOT a raw-block substring, which would mislabel an
    // active entry whose Why merely MENTIONS "_(retracted" (skill-review I1).
    const headingIdx = block.indexOf('### ');
    const afterHeading =
      headingIdx === -1 ? '' : block.slice(block.indexOf('\n', headingIdx) + 1);
    const retracted = afterHeading.startsWith('_(retracted');
    hits.push({
      id: markers[i].id,
      snippet: flattenSnippet(cleaned).slice(0, DECISIONS_SNIPPET_MAX),
      source_file: 'context/DECISIONS.md',
      source_line: sourceLine,
      retracted,
      // `score` is POSITIONAL (the marker index), NOT an FTS relevance rank —
      // the journal is chronological, so a lower score = an earlier decision.
      // Don't fuse/sort this against the facts/transcripts scopes' rank scores.
      score: i,
    });
    // NB: `limit` is a CHRONOLOGICAL head, not a relevance top-N — it returns
    // the first N matches in journal (oldest→newest) order, so a strongly
    // relevant decision far down a long journal can be cut. Acceptable: the
    // journal is bounded and chronological by design (M1, deliberate).
    if (hits.length >= (opts.limit ?? DEFAULT_LIMIT)) break;
  }
  return hits;
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
  const { errors, mode, scope } = validateInput(opts);
  if (errors.length > 0) {
    return errorResult({ category: ERROR_CATEGORIES.SCHEMA, errors });
  }
  // Scope dispatch (Task 104.2): the transcripts scope swaps the keyword
  // backend; semantic/hybrid use the caller-prepared backend exactly like
  // the facts scope (prepareSemanticBackend({scope}) embeds the right table).
  let keywordBackend = runKeywordSearch;
  if (scope === SEARCH_SCOPES.TRANSCRIPTS) keywordBackend = runTranscriptKeywordSearch;
  else if (scope === SEARCH_SCOPES.DECISIONS) keywordBackend = runDecisionsKeywordSearch;

  // Semantic + hybrid require an injected backend. Production v0.1.0
  // passes undefined → error with the not-yet-shipped hint. A future
  // release wires the real Layer-5b backend via the semanticBackend seam.
  if (mode === SEARCH_MODES.SEMANTIC || mode === SEARCH_MODES.HYBRID) {
    if (typeof opts.semanticBackend !== 'function') {
      return errorResult({
        category: ERROR_CATEGORIES.SEMANTIC_UNAVAILABLE,
        errors: [
          'no semantic backend provided — semantic/hybrid need the embedded Layer-5b backend prepared by the caller ' +
            '(the CLI/MCP do this automatically when the optional @huggingface/transformers embedder is installed). ' +
            'Use --mode=keyword for the always-available FTS5 search.',
        ],
      });
    }
  }

  let results;
  try {
    if (mode === SEARCH_MODES.KEYWORD) {
      results = keywordBackend(opts.db, opts);
    } else if (mode === SEARCH_MODES.SEMANTIC) {
      // The semantic backend is an injected callable returning the same
      // shape as the scope's keyword backend (facts: {id, snippet,
      // source_file, source_line, tier, trust, score}; transcripts: the
      // synthetic-T:-id shape without tier/trust).
      results = opts.semanticBackend(opts);
    } else {
      // hybrid: run both backends + fuse.
      const keywordResults = keywordBackend(opts.db, opts);
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

  return { action: 'found', mode, scope, results };
}
