// @doors: 1, 2
// Door 3 N/A: pure parsing + in-process DB sync; no subprocess.
// Door 4 N/A: reindex observability is owned by the reindex suites; the
//   chunk sync is a sub-step of the same pass.
// Door 5 N/A: no message queue.

// Tests for Task 104.2 — transcript chunking + the transcript_chunks index
// (the L3 raw tier's SEARCH half; the capture half shipped in 104.1).
// Chunk contract: split by `## ` turn headings, then ≤1500-char windows
// (the memsearch chunking rule Task 65 adopted); each chunk carries its
// source line for drill-back.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chunkTranscript, syncTranscriptChunks } from '../packages/cli/src/transcript-index.mjs';
import { openIndexDb } from '../packages/cli/src/index-db.mjs';

describe('Task 104.2 — chunkTranscript (pure)', () => {
  it('splits by ## turn headings, carrying heading + source line', () => {
    const text = [
      '## 2026-06-10T10:00:00Z — user',
      '',
      'what did we decide about the deploy target?',
      '',
      '## 2026-06-10T10:00:05Z — assistant',
      '',
      'We deploy with Kamal to Hetzner.',
      '',
      '**Tools:**',
      '',
      '- Bash(git log) → recent commits',
      '',
    ].join('\n');
    const chunks = chunkTranscript(text);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].heading).toContain('— user');
    expect(chunks[0].body).toContain('deploy target');
    expect(chunks[0].sourceLine).toBe(1);
    expect(chunks[1].heading).toContain('— assistant');
    expect(chunks[1].body).toContain('Kamal to Hetzner');
    expect(chunks[1].body).toContain('Bash(git log)'); // tool activity is searchable
    expect(chunks[1].sourceLine).toBe(5);
  });

  it('windows an oversized turn into ≤1500-char chunks (the Task-65 chunking rule)', () => {
    const text = `## 2026-06-10T10:00:00Z — assistant\n\n${'word '.repeat(800)}`;
    const chunks = chunkTranscript(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.body.length).toBeLessThanOrEqual(1500);
      expect(c.heading).toContain('— assistant'); // every window keeps its turn heading
    }
  });

  it('returns [] for empty/heading-less text (never throws)', () => {
    expect(chunkTranscript('')).toEqual([]);
    expect(chunkTranscript('no headings here, just prose')).toEqual([]);
    expect(chunkTranscript(null)).toEqual([]);
  });
});

describe('Task 104.2 — syncTranscriptChunks (DB state)', () => {
  let sandbox, projectRoot, db;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'cmk-tindex-'));
    projectRoot = join(sandbox, 'proj');
    mkdirSync(join(projectRoot, 'context', 'transcripts'), { recursive: true });
    db = openIndexDb({ projectRoot });
  });
  afterEach(() => {
    db?.close();
    rmSync(sandbox, { recursive: true, force: true });
  });

  const writeDay = (date, body) =>
    writeFileSync(join(projectRoot, 'context', 'transcripts', `${date}.md`), body, 'utf8');

  const turn = (ts, speaker, text) => `## ${ts} — ${speaker}\n\n${text}\n\n`;

  it('indexes transcript files into transcript_chunks + FTS (Door 2)', () => {
    writeDay('2026-06-09', turn('2026-06-09T09:00:00Z', 'assistant', 'We chose Valkey for caching.'));
    writeDay('2026-06-10', turn('2026-06-10T10:00:00Z', 'assistant', 'Deploys go out via tag push.'));
    const r = syncTranscriptChunks({ db, projectRoot });
    expect(r.files).toBe(2);
    expect(r.chunks).toBe(2);
    const rows = db.prepare('SELECT source_file, body FROM transcript_chunks ORDER BY source_file').all();
    expect(rows).toHaveLength(2);
    expect(rows[0].source_file).toMatch(/transcripts[/\\]2026-06-09\.md$/);
    const fts = db
      .prepare("SELECT count(*) AS n FROM transcript_chunks_fts WHERE transcript_chunks_fts MATCH 'valkey'")
      .get();
    expect(fts.n).toBe(1);
  });

  it('re-sync after append replaces the file rows; other files untouched (over-mutation guard)', () => {
    writeDay('2026-06-09', turn('2026-06-09T09:00:00Z', 'assistant', 'Old day content.'));
    writeDay('2026-06-10', turn('2026-06-10T10:00:00Z', 'assistant', 'First entry.'));
    syncTranscriptChunks({ db, projectRoot });
    // Append a new turn to today's file (the live shape: capture-turn appends).
    writeDay(
      '2026-06-10',
      turn('2026-06-10T10:00:00Z', 'assistant', 'First entry.') +
        turn('2026-06-10T11:00:00Z', 'assistant', 'Second entry about pnpm.'),
    );
    const r = syncTranscriptChunks({ db, projectRoot });
    const rows = db.prepare('SELECT body FROM transcript_chunks').all().map((x) => x.body);
    expect(rows.some((b) => b.includes('Second entry'))).toBe(true);
    expect(rows.some((b) => b.includes('First entry'))).toBe(true);
    expect(rows.filter((b) => b.includes('First entry'))).toHaveLength(1); // replaced, not duplicated
    expect(rows.some((b) => b.includes('Old day content'))).toBe(true); // untouched file survives
    expect(r.chunks).toBeGreaterThanOrEqual(2);
  });

  it('no transcripts dir → zero work, no throw', () => {
    rmSync(join(projectRoot, 'context', 'transcripts'), { recursive: true, force: true });
    const r = syncTranscriptChunks({ db, projectRoot });
    expect(r.files).toBe(0);
    expect(r.chunks).toBe(0);
  });

  it('a deleted transcript file is pruned (chunks + checkpoint); survivors untouched', () => {
    writeDay('2026-06-09', turn('2026-06-09T09:00:00Z', 'assistant', 'Keep me.'));
    writeDay('2026-06-10', turn('2026-06-10T10:00:00Z', 'assistant', 'Delete me.'));
    syncTranscriptChunks({ db, projectRoot });
    rmSync(join(projectRoot, 'context', 'transcripts', '2026-06-10.md'));
    syncTranscriptChunks({ db, projectRoot });
    const bodies = db.prepare('SELECT body FROM transcript_chunks').all().map((x) => x.body);
    expect(bodies.some((b) => b.includes('Keep me'))).toBe(true);
    expect(bodies.some((b) => b.includes('Delete me'))).toBe(false);
    const keys = db.prepare("SELECT path FROM files WHERE path LIKE 'transcript:%'").all();
    expect(keys).toHaveLength(1);
  });
});

describe('Task 104.2 — composition with reindexBoot (the shared files table)', () => {
  let sandbox, projectRoot, userDir, db;

  beforeEach(async () => {
    sandbox = mkdtempSync(join(tmpdir(), 'cmk-tindex-boot-'));
    projectRoot = join(sandbox, 'proj');
    userDir = join(sandbox, 'user');
    const { install } = await import('../packages/cli/src/install.mjs');
    await install({ projectRoot, userTier: userDir, noHooks: true });
    db = openIndexDb({ projectRoot });
  });
  afterEach(() => {
    db?.close();
    rmSync(sandbox, { recursive: true, force: true });
  });

  it("reindexBoot indexes transcripts AND its orphan-prune never eats the 'transcript:' checkpoints", async () => {
    const { reindexBoot } = await import('../packages/cli/src/index-rebuild.mjs');
    writeFileSync(
      join(projectRoot, 'context', 'transcripts', '2026-06-10.md'),
      '## 2026-06-10T10:00:00Z — assistant\n\nWe chose Valkey for caching.\n\n',
      'utf8',
    );
    reindexBoot({ projectRoot, userDir, db });
    expect(db.prepare('SELECT COUNT(*) AS n FROM transcript_chunks').get().n).toBe(1);
    // The second boot exercises the prune path against the now-existing
    // transcript checkpoint — it must survive (the prune walks the shared
    // files table; transcript rows are NOT observation orphans).
    reindexBoot({ projectRoot, userDir, db });
    const keys = db.prepare("SELECT path FROM files WHERE path LIKE 'transcript:%'").all();
    expect(keys).toHaveLength(1);
    expect(db.prepare('SELECT COUNT(*) AS n FROM transcript_chunks').get().n).toBe(1);
  });

  it('reindexFull rebuilds the transcript scope from scratch too', async () => {
    const { reindexFull } = await import('../packages/cli/src/index-rebuild.mjs');
    writeFileSync(
      join(projectRoot, 'context', 'transcripts', '2026-06-10.md'),
      '## 2026-06-10T10:00:00Z — assistant\n\nDeploys via tag push.\n\n',
      'utf8',
    );
    reindexFull({ projectRoot, userDir, db });
    expect(db.prepare('SELECT COUNT(*) AS n FROM transcript_chunks').get().n).toBe(1);
    const fts = db
      .prepare("SELECT count(*) AS n FROM transcript_chunks_fts WHERE transcript_chunks_fts MATCH 'deploys'")
      .get();
    expect(fts.n).toBe(1);
  });
});
