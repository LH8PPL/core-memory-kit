// recall-log.mjs — which memory IDs surfaced each turn (Task 190, ADR-0017
// Phase 1a, D-252). The learn-loop's ATTRIBUTION primitive: every downstream
// signal (Task 192's tool-result ±, user-correction −, re-ask −) needs to know
// which memories were in play before it can credit or blame one. Precedent:
// memclaw's `related_ids` (the 2026-07-01 learn-loop survey).
//
// Shape: an NDJSON log at <projectRoot>/context/.locks/recall.log — the
// .locks tier is already gitignored (run-time transient state, same class as
// audit.log). One line per surfacing event:
//
//   { session, ts, source: 'inject'|'search', ids: [...], query? }
//
// IDs + query only — never fact bodies (the log is attribution plumbing, not
// a memory tier; nothing here needs Poison_Guard because nothing here is
// content). Append is BEST-EFFORT: it runs inside the SessionStart hook and
// the search hot path, so it must never throw (a broken diagnostic must not
// break injection — the same posture as audit-log.mjs).
//
// Writers: injectContext (source:'inject', the snapshot's surviving citation
// ids) and search() (source:'search', the returned ids — gated on the caller
// passing projectRoot, so bare/legacy calls stay pure).
// Reader: readRecallLog — Task 191/192 resolve expectations against it.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function recallLogPath(projectRoot) {
  return join(projectRoot, 'context', '.locks', 'recall.log');
}

/**
 * Append one surfacing event. Best-effort: returns { ok:false } on any
 * filesystem failure instead of throwing (hook-path safety).
 *
 * @param {string} projectRoot
 * @param {object} entry
 * @param {string|null} [entry.session] - hook payload session_id when known.
 * @param {string} entry.source - 'inject' | 'search'.
 * @param {string[]} [entry.ids] - the observation ids that surfaced.
 * @param {string} [entry.query] - the search query (search source only).
 * @returns {{ ok: boolean }}
 */
export function appendRecallEntry(projectRoot, { session = null, source, ids = [], query } = {}) {
  try {
    const line = {
      session,
      ts: new Date().toISOString(),
      source,
      ids,
    };
    if (query !== undefined) line.query = query;
    const path = recallLogPath(projectRoot);
    mkdirSync(join(projectRoot, 'context', '.locks'), { recursive: true });
    appendFileSync(path, `${JSON.stringify(line)}\n`, 'utf8');
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/**
 * Read the log back, oldest first. Corrupt lines are skipped (an interrupted
 * append must not poison the whole log). Optional session filter.
 *
 * @param {string} projectRoot
 * @param {object} [opts]
 * @param {string} [opts.session] - return only this session's entries.
 * @returns {Array<object>}
 */
export function readRecallLog(projectRoot, { session } = {}) {
  const path = recallLogPath(projectRoot);
  if (!existsSync(path)) return [];
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  const entries = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed));
    } catch {
      // corrupt/partial line — skip, keep reading.
    }
  }
  if (session !== undefined) return entries.filter((e) => e.session === session);
  return entries;
}
