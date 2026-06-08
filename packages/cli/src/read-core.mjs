// Shared read cores (Task 108b / ADR-0014).
//
// The query logic behind the MCP read tools (mk_get / mk_timeline / mk_cite /
// mk_recent_activity), extracted so the CLI read verbs (cmk get / timeline /
// cite / recent-activity) call the SAME logic — identical results from both
// surfaces, one implementation. Pure (db + args in, plain data out); the MCP
// adapter wraps the result in a content envelope, the CLI adapter prints it.

import { ID_PATTERN } from './tier-paths.mjs';

const GET_COLUMNS =
  'id, body, heading_path, source_file, source_line, tier, trust, ' +
  'write_source, created_at, superseded_by, deleted_at';

/**
 * Fetch full observation rows by id. An invalid-format or missing id becomes
 * a `{ id, error }` entry (the array stays positionally aligned with `ids`).
 */
export function getObservations(db, ids) {
  const stmt = db.prepare(`SELECT ${GET_COLUMNS} FROM observations WHERE id = ?`);
  return ids.map((id) => {
    if (!ID_PATTERN.test(id)) return { id, error: 'invalid id format' };
    const row = stmt.get(id);
    if (!row) return { id, error: 'not found' };
    return row;
  });
}

/** The canonical Markdown citation link for an id. Pure (no DB). */
export function citeLink(id) {
  if (!ID_PATTERN.test(id)) return { ok: false, error: 'id must match ID_PATTERN' };
  return { ok: true, link: `[#${id}](memkit://obs/${id})` };
}

const TIMELINE_COLUMNS = 'id, body, source_file, source_line, tier, trust, created_at';

/**
 * Sequential context: N observations before the anchor + the anchor + N after,
 * by created_at (id as the tiebreaker so same-millisecond rows stay
 * deterministic). Returns `{ ok:false, error }` for a bad / missing anchor.
 */
export function buildTimeline(db, { anchor, depthBefore = 5, depthAfter = 5 } = {}) {
  if (!ID_PATTERN.test(anchor)) return { ok: false, error: 'anchor must be a valid kit ID' };
  const anchorRow = db
    .prepare('SELECT created_at, tier FROM observations WHERE id = ?')
    .get(anchor);
  if (!anchorRow) return { ok: false, error: 'anchor not found' };
  const beforeRows = db
    .prepare(`
      SELECT ${TIMELINE_COLUMNS} FROM observations
      WHERE created_at < ? AND deleted_at IS NULL
      ORDER BY created_at DESC, id DESC LIMIT ?
    `)
    .all(anchorRow.created_at, depthBefore);
  const anchorFull = db
    .prepare(`SELECT ${TIMELINE_COLUMNS} FROM observations WHERE id = ?`)
    .get(anchor);
  const afterRows = db
    .prepare(`
      SELECT ${TIMELINE_COLUMNS} FROM observations
      WHERE created_at > ? AND deleted_at IS NULL
      ORDER BY created_at ASC, id ASC LIMIT ?
    `)
    .all(anchorRow.created_at, depthAfter);
  return { ok: true, timeline: [...beforeRows.reverse(), anchorFull, ...afterRows] };
}

export const RECENT_WINDOWS = Object.freeze({
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
});

/** Observations changed within a time window, newest first. */
export function recentActivity(db, { window = '24h', limit = 20 } = {}) {
  if (!RECENT_WINDOWS[window]) return { ok: false, error: 'window must be 1h|24h|7d' };
  const cutoff = Date.now() - RECENT_WINDOWS[window];
  const rows = db
    .prepare(`
      SELECT id, body, source_file, source_line, tier, trust, created_at
      FROM observations
      WHERE created_at >= ? AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT ?
    `)
    .all(cutoff, limit);
  return { ok: true, rows };
}
