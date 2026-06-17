// Shared read cores (Task 108b / ADR-0014).
//
// The query logic behind the MCP read tools (mk_get / mk_timeline / mk_cite /
// mk_recent_activity), extracted so the CLI read verbs (cmk get / timeline /
// cite / recent-activity) call the SAME logic — identical results from both
// surfaces, one implementation. Pure (db + args in, plain data out); the MCP
// adapter wraps the result in a content envelope, the CLI adapter prints it.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ID_PATTERN } from './tier-paths.mjs';
import { parse as parseFrontmatter } from './frontmatter.mjs';

const GET_COLUMNS =
  'id, body, heading_path, source_file, source_line, tier, trust, ' +
  'write_source, created_at, superseded_by, deleted_at';

/**
 * Fetch full observation rows by id. An invalid-format or missing id becomes
 * a `{ id, error }` entry (the array stays positionally aligned with `ids`).
 *
 * Task 155 (D-163) — opt-in tombstone recovery. By DEFAULT this is live-only:
 * a forgotten id (its index row pruned by Task 110, the body moved to
 * `context/memory/archive/tombstones/<id>.md`) returns `not found`. The
 * automatic recall surfaces (the SessionStart snapshot, `mk_search`, `mk_get`)
 * MUST stay on this default — a deleted fact must remain invisible to the agent
 * (resurfacing it is the worst memory-product failure). ONLY an explicit
 * HUMAN-driven `cmk get --include-tombstoned` opts in, passing
 * `{ includeTombstoned: true, projectRoot }`; on a live miss it then reads the
 * tombstone file directly and returns its body marked `tombstoned: true`.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.includeTombstoned=false] human-only recovery opt-in
 * @param {string}  [opts.projectRoot] required when includeTombstoned (to find the archive)
 */
export function getObservations(db, ids, { includeTombstoned = false, projectRoot } = {}) {
  const stmt = db.prepare(`SELECT ${GET_COLUMNS} FROM observations WHERE id = ?`);
  return ids.map((id) => {
    if (!ID_PATTERN.test(id)) return { id, error: 'invalid id format' };
    const row = stmt.get(id);
    if (row) return row; // a LIVE hit always wins — recovery is a miss-only fallback
    // Live miss. Recovery is opt-in AND needs projectRoot to locate the archive.
    if (includeTombstoned && projectRoot) {
      const recovered = readTombstone(projectRoot, id);
      if (recovered) return recovered;
    }
    return { id, error: 'not found' };
  });
}

/**
 * Read a tombstoned fact's body + deletion provenance from
 * `<projectRoot>/context/memory/archive/tombstones/<id>.md`. Returns a row-like
 * object marked `tombstoned: true`, or null if no tombstone exists for the id.
 * Read-only; never un-tombstones (that would be a separate `restore` verb).
 */
function readTombstone(projectRoot, id) {
  const tombPath = join(
    projectRoot, 'context', 'memory', 'archive', 'tombstones', `${id}.md`,
  );
  if (!existsSync(tombPath)) return null;
  const { frontmatter, body } = parseFrontmatter(readFileSync(tombPath, 'utf8'));
  const fm = frontmatter ?? {};
  return {
    id,
    body: body ?? '',
    heading_path: fm.title ?? null,
    source_file: `context/memory/archive/tombstones/${id}.md`,
    source_line: 1,
    tier: fm.tier ?? null,
    trust: fm.trust ?? null,
    write_source: fm.write_source ?? null,
    created_at: fm.created_at ?? fm.at ?? null,
    superseded_by: fm.superseded_by ?? null,
    deleted_at: fm.deleted_at ?? null,
    deleted_reason: fm.deleted_reason ?? null,
    deleted_by: fm.deleted_by ?? null,
    tombstoned: true,
  };
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
