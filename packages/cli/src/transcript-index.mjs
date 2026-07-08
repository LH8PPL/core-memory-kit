// Task 104.2 (D-117) — transcript chunking + index sync: the SEARCH half of
// the L3 raw tier (the capture half shipped in 104.1). Transcript files
// (context/transcripts/{date}.md — dialogue + per-turn Tools blocks) are
// chunked by `## ` turn headings and windowed to ≤1500 chars (the memsearch
// chunking rule Task 65 adopted), then synced into the SEPARATE
// transcript_chunks table (index-db.mjs) so `cmk search --scope transcripts`
// reaches them WITHOUT polluting L1 fact results (the MemPalace last-resort
// contract, D-70/D-72).
//
// Sync strategy mirrors the observation indexer: per-file mtime/sha1 rows in
// the shared `files` table (keyed with a 'transcript:' prefix so they never
// collide with observation sources) → unchanged files cost one stat.
//
// Public boundary:
//   chunkTranscript(text) → [{heading, body, sourceLine, chunkIdx}]  (pure)
//   syncTranscriptChunks({db, projectRoot, now?}) → {files, chunks}

import { hashContent } from './content-hash.mjs';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CHUNK_MAX_CHARS = 1500; // the Task-65 / memsearch chunking rule
const FILES_KEY_PREFIX = 'transcript:';

export function chunkTranscript(text) {
  if (typeof text !== 'string' || text.trim() === '') return [];
  const lines = text.split(/\r?\n/);
  // Locate turn headings (`## <ts> — speaker`, the capture-prompt/-turn shape).
  const headings = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) headings.push(i);
  }
  if (headings.length === 0) return [];

  const chunks = [];
  let chunkIdx = 0;
  for (let h = 0; h < headings.length; h++) {
    const start = headings[h];
    const end = h + 1 < headings.length ? headings[h + 1] : lines.length;
    const heading = lines[start].trim();
    const body = lines
      .slice(start + 1, end)
      .join('\n')
      .trim();
    if (body === '') continue;
    // Window oversized turns; every window keeps its turn heading so a hit
    // is always attributable to a specific turn.
    for (let off = 0; off < body.length; off += CHUNK_MAX_CHARS) {
      chunks.push({
        heading,
        body: body.slice(off, off + CHUNK_MAX_CHARS),
        sourceLine: start + 1, // 1-based heading line — the drill-back anchor
        chunkIdx: chunkIdx++,
      });
    }
  }
  return chunks;
}

// Transcript-chunk fingerprint for the `files`-table diff key (column name
// `sha1` kept for checkpoint back-compat; algorithm is SHA-256 via hashContent,
// D-149). Self-heals on the first post-upgrade boot like the observation index.
function sha1(text) {
  return hashContent(text);
}

// Task 126 (D-119) — the raw-tier scope covers BOTH halves of the session
// record: verbatim transcripts AND the Haiku-compressed sessions summaries
// (today-*.md / recent.md / archive.md — the middle tier that was otherwise
// a recall blind spot: discussed-but-never-graduated content). Exclusions:
// now.md (the volatile live buffer — already in context, and its constant
// truncation would churn the index) and non-.md observability files.
const RAW_TIER_DIRS = ['transcripts', 'sessions'];
const SESSIONS_EXCLUDE = new Set(['now.md']);

export function syncTranscriptChunks({ db, projectRoot, now = Date.now() } = {}) {
  let files = 0;
  let chunks = 0;

  const entries = []; // {abs, sourceFile}
  for (const sub of RAW_TIER_DIRS) {
    const dir = join(projectRoot, 'context', sub);
    if (!existsSync(dir)) continue;
    let names;
    try {
      names = readdirSync(dir).filter(
        (n) =>
          n.endsWith('.md') &&
          // Task 148.3 (design §6.10): the gitignored live buffer holds
          // UNSCREENED turns — it must never become searchable. Only the
          // promoted (screened) transcript indexes.
          !n.endsWith('.live.md') &&
          !(sub === 'sessions' && SESSIONS_EXCLUDE.has(n)),
      );
    } catch {
      continue;
    }
    for (const name of names) {
      entries.push({ abs: join(dir, name), sourceFile: `context/${sub}/${name}` });
    }
  }

  const getFileRow = db.prepare('SELECT mtime, sha1 FROM files WHERE path = ?');
  const upsertFileRow = db.prepare(
    'INSERT INTO files (path, mtime, sha1, indexed_at) VALUES (?, ?, ?, ?) ' +
      'ON CONFLICT(path) DO UPDATE SET mtime = excluded.mtime, sha1 = excluded.sha1, indexed_at = excluded.indexed_at',
  );
  const deleteChunks = db.prepare('DELETE FROM transcript_chunks WHERE source_file = ?');
  const insertChunk = db.prepare(
    'INSERT INTO transcript_chunks (source_file, chunk_idx, source_line, heading, body) VALUES (?, ?, ?, ?, ?)',
  );

  for (const { abs, sourceFile } of entries) {
    const filesKey = FILES_KEY_PREFIX + sourceFile;
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    const prev = getFileRow.get(filesKey);
    // NO mtime fast-path: two appends inside the filesystem's mtime
    // resolution would make the second invisible (caught as a flaky test —
    // rapid Stop hooks are the same shape in production). sha1 is the
    // authority; day-files are small and reindex reads its other sources
    // anyway, so the read cost is negligible.
    let text;
    try {
      text = readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    const digest = sha1(text);
    if (prev && prev.sha1 === digest) {
      continue; // content unchanged
    }

    const parsed = chunkTranscript(text);
    const replaceFile = db.transaction(() => {
      deleteChunks.run(sourceFile);
      for (const c of parsed) {
        insertChunk.run(sourceFile, c.chunkIdx, c.sourceLine, c.heading, c.body);
      }
      upsertFileRow.run(filesKey, Math.trunc(st.mtimeMs), digest, now);
    });
    replaceFile();
    files += 1;
    chunks += parsed.length;
  }

  // Orphan-prune for THIS scope: a deleted/rotated file (transcripts OR
  // sessions — weekly-curate rotates today-*.md into archive.md) leaves its
  // chunks + checkpoint behind otherwise. The observation indexer's prune
  // deliberately skips 'transcript:' rows (they are not observation sources)
  // — pruning them is this function's job, scoped by the key prefix.
  const live = new Set(entries.map((e) => FILES_KEY_PREFIX + e.sourceFile));
  const known = db
    .prepare("SELECT path FROM files WHERE path LIKE ?")
    .all(FILES_KEY_PREFIX + '%');
  const pruneTxn = db.transaction((filesKey) => {
    db.prepare('DELETE FROM transcript_chunks WHERE source_file = ?').run(
      filesKey.slice(FILES_KEY_PREFIX.length),
    );
    db.prepare('DELETE FROM files WHERE path = ?').run(filesKey);
  });
  for (const { path } of known) {
    if (!live.has(path)) pruneTxn(path);
  }

  return { files, chunks };
}
