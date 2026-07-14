// memory-stats.mjs — the memory-health BEHAVIORAL dashboard (Task 212;
// AutoMem arXiv 2607.01224's Figure-4 indicator set; D-308).
//
// AutoMem's finding: a small set of PROCESS metrics — not task success — is
// what makes a memory system's quality observable and improvable (their
// optimized agents: writes-per-search −54–72%, redundant writes −68–83%,
// empty searches −13–50%). The kit's raw data ALREADY EXISTS; this module is
// AGGREGATION + a surface, no new capture:
//
//   recall.log     (Task 190) — every search + its result ids (zero-result
//                   queries logged BY DESIGN — a MISS is a signal)
//   audit.log      — every write/merge/queue-route/supersede mutation
//   truncation.log (Task 93)  — snapshot cap-overflow events
//
// REPORT-ONLY in v1 (the D-169 no-ritual line: observe before alarming) —
// no thresholds, no HC failures, no exit-code effect. These numbers are the
// Task-194 blend's tuning instrumentation: empty-search + redundant-write
// are its before/after measurements.
//
// DISTINCT from memory-health.mjs (Task 144): that is CONTENT quality over
// the fact archive (stale/duplicates/queues, a doctor section); this is
// PROCESS behavior over the activity logs (`cmk stats memory-health`).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_DAYS = 7;

// The audit actions that count as a WRITE (a fact/bullet landing): the
// scratchpad append, the granular fact create, and the replace re-write.
const WRITE_ACTIONS = new Set(['appended', 'created', 'replaced']);

// The audit actions that mark a write as REDUNDANT after the fact — the
// AutoMem "redundant write" analog: a restatement the dedup caught
// (`recurrence`), a conflict-queue route (`queued`), a dedup merge
// (`merged`), and a temporal supersession (`temporal_supersede`).
const REDUNDANT_ACTIONS = new Set(['recurrence', 'queued', 'merged', 'temporal_supersede']);

// An empty search counts as RECOVERED when a later search within this window
// returned results — the "same-session retry hit" split (recall.log search
// entries carry session:null in production, so the join is time-based).
const RETRY_WINDOW_MS = 10 * 60 * 1000;

function readNdjson(path) {
  if (!existsSync(path)) return [];
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  const out = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t));
    } catch {
      // corrupt/partial line — skip, keep reading (the log-reader posture).
    }
  }
  return out;
}

function tsOf(entry) {
  const t = Date.parse(entry?.ts ?? '');
  return Number.isFinite(t) ? t : null;
}

function inWindow(t, from, to) {
  return t !== null && t > from && t <= to;
}

function rate(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function windowMetrics({ recall, audit, truncation, from, to }) {
  const searches = recall.filter(
    (e) => e.source === 'search' && inWindow(tsOf(e), from, to),
  );
  const emptySearches = searches.filter((e) => !Array.isArray(e.ids) || e.ids.length === 0);
  // Retry-recovered: a later non-empty search within RETRY_WINDOW_MS.
  const emptySearchesRecovered = emptySearches.filter((empty) => {
    const t0 = tsOf(empty);
    return searches.some((later) => {
      const t1 = tsOf(later);
      return (
        t1 !== null && t0 !== null && t1 > t0 && t1 - t0 <= RETRY_WINDOW_MS &&
        Array.isArray(later.ids) && later.ids.length > 0
      );
    });
  }).length;
  // Repeated identical search: normalized query text seen more than once —
  // the "stuck" analog (the snapshot/search isn't surfacing what's needed).
  const queryCounts = new Map();
  for (const s of searches) {
    const q = String(s.query ?? '').trim().toLowerCase();
    if (!q) continue;
    queryCounts.set(q, (queryCounts.get(q) ?? 0) + 1);
  }
  const repeatedSearches = [...queryCounts.values()].filter((n) => n > 1).length;

  const auditInWindow = audit.filter((e) => inWindow(tsOf(e), from, to));
  const writes = auditInWindow.filter((e) => WRITE_ACTIONS.has(e.action)).length;
  const redundantEvents = auditInWindow.filter((e) => REDUNDANT_ACTIONS.has(e.action)).length;

  const truncs = truncation.filter(
    (e) => e.event === 'tier_truncated_to_budget' && inWindow(tsOf(e), from, to),
  );
  const droppedSections = truncs.reduce(
    (n, e) => n + (Array.isArray(e.dropped_sections) ? e.dropped_sections.length : 0),
    0,
  );

  return {
    searches: searches.length,
    emptySearches: emptySearches.length,
    emptySearchesRecovered,
    emptySearchRate: rate(emptySearches.length, searches.length),
    repeatedSearches,
    writes,
    writesPerSearch: rate(writes, searches.length),
    redundantEvents,
    redundantWriteRate: rate(redundantEvents, writes),
    truncationEvents: truncs.length,
    droppedSections,
  };
}

// 'down' | 'up' | 'flat' — a plain comparison with a small epsilon so float
// noise doesn't fabricate movement. The RENDERER decides which direction is
// good per metric (lower is better for all three rates).
function trendOf(current, previous) {
  const eps = 1e-9;
  if (current > previous + eps) return 'up';
  if (current < previous - eps) return 'down';
  return 'flat';
}

/**
 * Compute the v1 behavioral metric set over the current window vs the
 * previous window of the same length. Pure reads; never mutates a log.
 *
 * @param {object} o
 * @param {string} o.projectRoot
 * @param {number|string} [o.now]      clock injection (tests); default wall clock
 * @param {number} [o.windowDays=7]    the window length (the spec's 7/30 knob)
 */
export function computeMemoryStats({ projectRoot, now, windowDays = DEFAULT_WINDOW_DAYS } = {}) {
  const locks = join(projectRoot, 'context', '.locks');
  const recall = readNdjson(join(locks, 'recall.log'));
  const audit = readNdjson(join(locks, 'audit.log'));
  const truncation = readNdjson(join(locks, 'truncation.log'));

  const nowMs = (() => {
    const t = typeof now === 'number' ? now : Date.parse(now ?? '');
    return Number.isFinite(t) ? t : Date.now();
  })();
  const windowMs = windowDays * DAY_MS;

  const current = windowMetrics({
    recall, audit, truncation,
    from: nowMs - windowMs,
    to: nowMs,
  });
  const previous = windowMetrics({
    recall, audit, truncation,
    from: nowMs - 2 * windowMs,
    to: nowMs - windowMs,
  });

  return {
    windowDays,
    current,
    previous,
    trends: {
      writesPerSearch: trendOf(current.writesPerSearch, previous.writesPerSearch),
      emptySearchRate: trendOf(current.emptySearchRate, previous.emptySearchRate),
      redundantWriteRate: trendOf(current.redundantWriteRate, previous.redundantWriteRate),
      repeatedSearches: trendOf(current.repeatedSearches, previous.repeatedSearches),
      droppedSections: trendOf(current.droppedSections, previous.droppedSections),
    },
  };
}

const ARROWS = { up: '↑', down: '↓', flat: '→' };

function pct(x) {
  return `${Math.round(x * 100)}%`;
}

function ratio(x) {
  return (Math.round(x * 100) / 100).toString();
}

/**
 * Render the report as printable lines. REPORT-ONLY: descriptive lines +
 * trend arrows, no PASS/FAIL verdicts (v1 observes before alarming). For the
 * three lower-is-better rates the arrow's meaning is annotated inline so the
 * reader doesn't have to remember polarity.
 */
export function renderMemoryStats(report) {
  const { windowDays, current: c, previous: p, trends: t } = report;
  const arrow = (k) => ARROWS[t[k]] ?? '→';
  const better = (k) => (t[k] === 'down' ? ' (improving)' : t[k] === 'up' ? ' (rising)' : '');
  return [
    `memory-health — process behavior, last ${windowDays}d vs the ${windowDays}d before (report-only; content quality lives in \`cmk doctor\`)`,
    '',
    `  writes-per-search      ${ratio(c.writesPerSearch)} ${arrow('writesPerSearch')}${better('writesPerSearch')}  (${c.writes} writes / ${c.searches} searches; prior: ${ratio(p.writesPerSearch)})`,
    `  empty-search rate      ${pct(c.emptySearchRate)} ${arrow('emptySearchRate')}${better('emptySearchRate')}  (${c.emptySearches} of ${c.searches}; ${c.emptySearchesRecovered} recovered by a retry; prior: ${pct(p.emptySearchRate)})`,
    `  redundant-write rate   ${pct(c.redundantWriteRate)} ${arrow('redundantWriteRate')}${better('redundantWriteRate')}  (${c.redundantEvents} dedup/conflict/supersede events / ${c.writes} writes; prior: ${pct(p.redundantWriteRate)})`,
    `  repeated identical search  ${c.repeatedSearches} ${arrow('repeatedSearches')}  (queries asked more than once; prior: ${p.repeatedSearches})`,
    `  snapshot cap pressure  ${c.truncationEvents} truncation(s), ${c.droppedSections} section(s) dropped ${arrow('droppedSections')}  (prior: ${p.truncationEvents}/${p.droppedSections})`,
  ];
}
