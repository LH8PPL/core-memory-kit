// query-state-view.mjs — the RULE-BASED query state-view profiler (Task 211;
// A-TMA arXiv 2607.01935's retrieval-level mechanism; D-308).
//
// Tags a search query's requested temporal view — current | historical |
// transition | neutral — from hint-word counting with a negation guard.
// EXPLICITLY not an LLM (A-TMA's own profiler is rule-based; that finding is
// what killed the §16.18 7-mode classifier deferral's cost premise for this
// 4-view cut): Poison_Guard-tier mechanism cost, pure, total, zero latency.
//
// The consumer (search.mjs) biases retrieval on the verdict:
//   current/neutral → today's behavior, byte-identical;
//   historical      → expired rows auto-included + stateful rows bucketed
//                     first (a deterministic PRE-RANK partition, never a
//                     score blend — §20.3 untouched);
//   transition      → expired rows auto-included, no reorder (the answer
//                     needs both states; Task 209's labels distinguish).
//
// The 7-mode + reranker version stays deferred on the original §16.18
// grounds; this is deliberately the cheap 4-view cut.

export const STATE_VIEWS = Object.freeze({
  CURRENT: 'current',
  HISTORICAL: 'historical',
  TRANSITION: 'transition',
  NEUTRAL: 'neutral',
});

export const VALID_STATE_VIEWS = new Set(Object.values(STATE_VIEWS));

// Hint catalogs. Phrases match with word boundaries on the lowercased query.
// Deliberately conservative: a hint must READ as a temporal request — broad
// single words that often appear non-temporally are left out; the fixture
// table in tests/cli-query-state-view.test.js is the behavioral contract.
const HISTORICAL_HINTS = [
  'used to',
  'before',
  'previously',
  'originally',
  'back when',
  'formerly',
  'in the past',
  'earlier',
  'at first',
  'reject', // "what did we reject" — the decision-history shape
  'rejected',
];

const TRANSITION_HINTS = [
  'change',
  'changed',
  'changing',
  'switch',
  'switched',
  'migrate',
  'migrated',
  'migrating',
  'moved from',
  'went from',
  'became',
  'become',
  'evolution',
  'evolved',
  'evolve',
  'history of',
];

const CURRENT_HINTS = [
  'now',
  'currently',
  'current',
  'today',
  'these days',
  'latest',
  'at the moment',
  'right now',
  'still',
];

// Negators for the guard: a negator within NEGATION_WINDOW tokens BEFORE a
// historical hint cancels it — and counts as a CURRENT hit instead ("not what
// we used before" asks for the present). The window is token-based so the
// guard stays scoped (a negator at the far end of a long query can't flip an
// unrelated hint).
const NEGATORS = new Set(['not', "don't", 'dont', "doesn't", 'doesnt', 'no', 'never', 'without']);
const NEGATION_WINDOW = 5;

function tokenize(q) {
  return q.split(/[^a-z0-9']+/).filter(Boolean);
}

// All match positions (token index of the hint's FIRST word) of a phrase hint
// in the token array.
function hintPositions(tokens, hint) {
  const hintTokens = hint.split(' ');
  const out = [];
  for (let i = 0; i + hintTokens.length <= tokens.length; i++) {
    let ok = true;
    for (let j = 0; j < hintTokens.length; j++) {
      if (tokens[i + j] !== hintTokens[j]) {
        ok = false;
        break;
      }
    }
    if (ok) out.push(i);
  }
  return out;
}

function negatedAt(tokens, pos) {
  for (let i = Math.max(0, pos - NEGATION_WINDOW); i < pos; i++) {
    if (NEGATORS.has(tokens[i])) return true;
  }
  return false;
}

/**
 * Classify a query's requested state view. Pure + total: any non-string or
 * hint-free input → neutral; never throws.
 *
 * Verdict precedence: transition hints win outright; past + present hints
 * TOGETHER also read as transition (a comparison question); then historical;
 * then current; else neutral. A negated historical hint converts to a
 * current hit (the negation guard).
 *
 * `contentQuery` is the query with every MATCHED hint phrase removed — the
 * hint is view METADATA the classifier just consumed, not subject content,
 * and FTS5's implicit-AND would otherwise require the literal hint word to
 * appear in fact bodies ("deploy target before" would match nothing). The
 * consumer feeds contentQuery to retrieval on the stateful views; on
 * current/neutral it equals the input (byte-identical pipeline).
 *
 * @param {string} query
 * @returns {{view: 'current'|'historical'|'transition'|'neutral',
 *            hits: {historical: number, transition: number, current: number},
 *            contentQuery: string}}
 */
export function classifyQueryStateView(query) {
  const neutral = {
    view: STATE_VIEWS.NEUTRAL,
    hits: { historical: 0, transition: 0, current: 0 },
    contentQuery: typeof query === 'string' ? query : '',
  };
  if (typeof query !== 'string' || query.trim() === '') return neutral;
  const tokens = tokenize(query.toLowerCase());
  if (tokens.length === 0) return neutral;

  let historical = 0;
  let current = 0;
  let transition = 0;
  const consumed = new Set(); // token indexes claimed by a matched hint

  for (const hint of HISTORICAL_HINTS) {
    const span = hint.split(' ').length;
    for (const pos of hintPositions(tokens, hint)) {
      if (negatedAt(tokens, pos)) current++;
      else historical++;
      for (let k = 0; k < span; k++) consumed.add(pos + k);
    }
  }
  for (const hint of TRANSITION_HINTS) {
    const span = hint.split(' ').length;
    for (const pos of hintPositions(tokens, hint)) {
      transition++;
      for (let k = 0; k < span; k++) consumed.add(pos + k);
    }
  }
  for (const hint of CURRENT_HINTS) {
    const span = hint.split(' ').length;
    for (const pos of hintPositions(tokens, hint)) {
      current++;
      for (let k = 0; k < span; k++) consumed.add(pos + k);
    }
  }

  let view = STATE_VIEWS.NEUTRAL;
  if (transition > 0) view = STATE_VIEWS.TRANSITION;
  else if (historical > 0 && current > 0) view = STATE_VIEWS.TRANSITION;
  else if (historical > 0) view = STATE_VIEWS.HISTORICAL;
  else if (current > 0) view = STATE_VIEWS.CURRENT;

  // Strip consumed hint tokens. Falls back to the original query if stripping
  // would empty it (a pure-hint query like "before" still needs SOMETHING to
  // search on).
  const remaining = tokens.filter((_, i) => !consumed.has(i));
  const contentQuery = remaining.length > 0 ? remaining.join(' ') : query;

  return { view, hits: { historical, transition, current }, contentQuery };
}
