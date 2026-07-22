// @doors: 1, 2
// Door 3 N/A: in-process only — better-sqlite3 + fs, no subprocess spawn.
// Door 4 N/A: no message-queue surface.
// Door 5 N/A: graph-index.rebuildEdges emits no kit NDJSON log — it is a pure
//   index rebuild (the reindex summary line is the observability surface and is
//   covered by cli-index-rebuild's subcommand tests).
//
// Task 232 (ADR-0023 ACTIVATE slice / D-392) — the relational adjacency axis.
// Tests the edges table (built at reindex from `related:` + `[[slug]]` +
// `superseded_by`), the supersession-chain CTE, backlink queries, the
// `related`-surfaced-in-get behavior, byte-stable rebuild, and over-mutation.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { install } from '../packages/cli/src/install.mjs';
import { openIndexDb } from '../packages/cli/src/index-db.mjs';
import { reindexFull, reindexBoot } from '../packages/cli/src/index-rebuild.mjs';
import { writeFact } from '../packages/cli/src/write-fact.mjs';
import {
  rebuildEdges,
  relatedRefsFor,
  supersessionChain,
  traverseLinks,
  slugForFactFilename,
  extractWikilinks,
} from '../packages/cli/src/graph-index.mjs';
import { getObservations, buildLinks } from '../packages/cli/src/read-core.mjs';

let sandbox, projectRoot, userDir, db;

// --- Fixture ids (real base32, copied from fixtures/canonicalize-vectors.json;
//     the kit alphabet excludes 0/O/1/l/I/8) -------------------------------
const A = 'P-2DZG7XF4'; // links to B (related) + C ([[wikilink]])
const B = 'P-34GZDKAW';
const C = 'P-56UXMRD6';
const DANGLE = 'P-D6YL7RBC'; // related → a slug that resolves to no fact
// 3-hop supersession chain: S1 → S2 → S3 → S4. In the real kit a superseded
// fact is MOVED to context/memory/archive/superseded/<id>.md (it leaves the
// top-level walk + the observations table), so S1/S2/S3 are seeded as archived
// files and only the live successor S4 is a top-level fact.
const S1 = 'P-GDZU5542';
const S2 = 'P-NJD6HT3P';
const S3 = 'P-NYNAUS2Q';
const S4 = 'P-P9HKNNHY';

function seedFact({ id, slug, related, body }) {
  const r = writeFact({
    projectRoot,
    tier: 'P',
    type: 'feedback',
    slug,
    title: slug,
    body: body ?? `fact ${slug}`,
    writeSource: 'user-explicit',
    trust: 'high',
    sourceFile: 'MEMORY.md',
    sourceLine: 1,
    sourceSha1: 'a'.repeat(40),
    id,
    related,
  });
  if (r.action === 'error') throw new Error(`seedFact failed: ${(r.errors ?? []).join('; ')}`);
  return r.path;
}

// Write an already-superseded fact into archive/superseded/<id>.md — the moved
// form the kit produces on supersession (frontmatter id + superseded_by).
function seedArchivedSuperseded({ id, slug, supersededBy }) {
  const dir = join(projectRoot, 'context', 'memory', 'archive', 'superseded');
  mkdirSync(dir, { recursive: true });
  const fm = [
    '---',
    `id: ${id}`,
    'type: feedback',
    `title: ${slug}`,
    'created_at: 2026-06-23T17:26:37Z',
    'write_source: user-explicit',
    'trust: high',
    'source_file: user-explicit',
    'source_line: 1',
    `source_sha1: ${'a'.repeat(64)}`,
    `superseded_by: ${supersededBy}`,
    '---',
    '',
    `superseded fact ${slug}`,
    '',
  ].join('\n');
  writeFileSync(join(dir, `${id}.md`), fm, 'utf8');
}

function seedCorpus() {
  seedFact({ id: A, slug: 'alpha', related: ['bravo'], body: 'alpha refs [[charlie]] here' });
  seedFact({ id: B, slug: 'bravo' });
  seedFact({ id: C, slug: 'charlie' });
  seedFact({ id: DANGLE, slug: 'delta', related: ['ghost-fact-that-does-not-exist'] });
  // The supersession chain: S1→S2→S3 archived (predecessors), S4 live.
  seedArchivedSuperseded({ id: S1, slug: 'ver1', supersededBy: S2 });
  seedArchivedSuperseded({ id: S2, slug: 'ver2', supersededBy: S3 });
  seedArchivedSuperseded({ id: S3, slug: 'ver3', supersededBy: S4 });
  seedFact({ id: S4, slug: 'ver4' });
}

function dumpEdges() {
  return db
    .prepare('SELECT src, dst, type, dst_resolved FROM edges ORDER BY src, dst, type')
    .all();
}

beforeEach(async () => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-graph-links-'));
  projectRoot = join(sandbox, 'proj');
  userDir = join(sandbox, 'user');
  await install({ projectRoot, userTier: userDir });
  db = openIndexDb({ projectRoot });
});
afterEach(() => {
  db?.close();
  rmSync(sandbox, { recursive: true, force: true });
});

describe('graph-index pure helpers', () => {
  it('slugForFactFilename strips the type prefix + .md', () => {
    expect(slugForFactFilename('feedback_guides-are-runbooks.md')).toBe('guides-are-runbooks');
    expect(slugForFactFilename('project_a-b-c.md')).toBe('a-b-c');
    expect(slugForFactFilename('reference_no-prefix-here.md')).toBe('no-prefix-here');
  });

  it('extractWikilinks pulls distinct [[slug]] refs, tolerant of whitespace + alias', () => {
    expect(extractWikilinks('see [[foo]] and [[ bar ]] and [[foo]] again')).toEqual(['foo', 'bar']);
    expect(extractWikilinks('[[slug|Nice Label]]')).toEqual(['slug']);
    expect(extractWikilinks('no links here')).toEqual([]);
  });
});

describe('edges table build (Task 232)', () => {
  beforeEach(() => {
    seedCorpus();
    reindexFull({ projectRoot, userDir, db });
  });

  it('parses related: frontmatter into a resolved edge (Door 2: DB state)', () => {
    const row = db.prepare("SELECT * FROM edges WHERE src = ? AND type = 'related'").get(A);
    expect(row).toMatchObject({ src: A, dst: B, type: 'related', dst_resolved: 1 });
  });

  it('parses [[wikilink]] body refs into a resolved link edge', () => {
    const row = db.prepare("SELECT * FROM edges WHERE src = ? AND type = 'link'").get(A);
    expect(row).toMatchObject({ src: A, dst: C, type: 'link', dst_resolved: 1 });
  });

  it('keeps a dangling related slug verbatim with dst_resolved = 0', () => {
    const row = db.prepare("SELECT * FROM edges WHERE src = ?").get(DANGLE);
    expect(row).toMatchObject({ src: DANGLE, dst: 'ghost-fact-that-does-not-exist', dst_resolved: 0 });
  });

  it('records superseded_by as an id→id edge', () => {
    const row = db.prepare("SELECT * FROM edges WHERE src = ? AND type = 'superseded_by'").get(S1);
    expect(row).toMatchObject({ src: S1, dst: S2, type: 'superseded_by', dst_resolved: 1 });
  });
});

describe('backlink query — "what points AT this fact" (a graph-only shape)', () => {
  beforeEach(() => {
    seedCorpus();
    reindexFull({ projectRoot, userDir, db });
  });

  it('traverseLinks(C, direction:in) surfaces A as a backlink', () => {
    const inbound = traverseLinks(db, C, { direction: 'in' });
    expect(inbound.map((e) => e.from_id)).toContain(A);
    expect(inbound.find((e) => e.from_id === A).type).toBe('link');
  });

  it('buildLinks exposes backlinks + out-links; C is referenced by A, not vice versa', () => {
    const links = buildLinks(db, C, { direction: 'both' });
    expect(links.found).toBe(true);
    expect(links.backlinks.map((e) => e.from)).toContain(A);
    // C references nobody
    expect(links.out).toEqual([]);
  });

  it('direction:out omits backlinks; direction:in omits out-links', () => {
    const outOnly = buildLinks(db, A, { direction: 'out' });
    expect(outOnly.out.map((e) => e.to).sort()).toEqual([B, C].sort());
    expect(outOnly).not.toHaveProperty('backlinks');
    const inOnly = buildLinks(db, C, { direction: 'in' });
    expect(inOnly).not.toHaveProperty('out');
    expect(inOnly.backlinks.map((e) => e.from)).toContain(A);
  });
});

describe('supersession chain walk (3-hop fixture, both directions)', () => {
  beforeEach(() => {
    seedCorpus();
    reindexFull({ projectRoot, userDir, db });
  });

  it('resolves the full oldest→newest chain from any member', () => {
    const expected = [S1, S2, S3, S4];
    expect(supersessionChain(db, S1)).toEqual(expected);
    expect(supersessionChain(db, S2)).toEqual(expected);
    expect(supersessionChain(db, S3)).toEqual(expected);
    expect(supersessionChain(db, S4)).toEqual(expected);
  });

  it('buildLinks carries the chain; a non-superseded fact has none', () => {
    expect(buildLinks(db, S2).supersession_chain).toEqual([S1, S2, S3, S4]);
    expect(buildLinks(db, B).supersession_chain).toBeNull();
  });
});

describe('related surfaced in get output (was invisible pre-232)', () => {
  beforeEach(() => {
    seedCorpus();
    reindexFull({ projectRoot, userDir, db });
  });

  it('getObservations attaches related out-refs for a linking fact', () => {
    const [row] = getObservations(db, [A]);
    expect(row.related.sort()).toEqual([B, C].sort());
  });

  it('a fact with no out-links carries no `related` key (zero noise)', () => {
    const [row] = getObservations(db, [B]);
    expect(row).not.toHaveProperty('related');
  });

  it('a target referenced BOTH via related: and [[wikilink]] appears once (distinct)', () => {
    // A already has `related: [bravo]`; add a `[[bravo]]` body wikilink so B is
    // referenced two ways — it must still surface once in `related`.
    const aPath = join(projectRoot, 'context', 'memory', 'feedback_alpha.md');
    writeFileSync(aPath, readFileSync(aPath, 'utf8').replace('[[charlie]]', '[[charlie]] and [[bravo]]'), 'utf8');
    reindexFull({ projectRoot, userDir, db });
    const [row] = getObservations(db, [A]);
    expect(row.related.filter((r) => r === B)).toHaveLength(1);
    expect(row.related.sort()).toEqual([B, C].sort());
  });
});

describe('byte-stable rebuild (ADR-0002 determinism)', () => {
  it('two full reindexes over the same corpus produce identical edge rows', () => {
    seedCorpus();
    reindexFull({ projectRoot, userDir, db });
    const first = dumpEdges();
    reindexFull({ projectRoot, userDir, db });
    const second = dumpEdges();
    expect(second).toEqual(first);
    expect(first.length).toBeGreaterThan(0);
  });

  it('a direct rebuildEdges call is idempotent (delete+insert, no growth)', () => {
    seedCorpus();
    reindexFull({ projectRoot, userDir, db });
    const before = dumpEdges();
    const { edgeCount } = rebuildEdges(db, { projectRoot, userDir });
    expect(edgeCount).toBe(before.length);
    expect(dumpEdges()).toEqual(before);
  });
});

describe('over-mutation guard — changing one fact leaves unrelated edges intact', () => {
  it('adding a link to DANGLE does not touch A/B/C/supersession edges', () => {
    seedCorpus();
    reindexFull({ projectRoot, userDir, db });
    const unrelatedBefore = db
      .prepare("SELECT src, dst, type, dst_resolved FROM edges WHERE src != ? ORDER BY src, dst, type")
      .all(DANGLE);

    // Rewrite DANGLE's fact file so its (previously dangling) link now resolves
    // to B — a single-fact mutation on disk.
    const dPath = join(projectRoot, 'context', 'memory', 'feedback_delta.md');
    const rewritten = readFileSync(dPath, 'utf8').replace(
      'related: [ghost-fact-that-does-not-exist]',
      'related: [bravo]',
    );
    writeFileSync(dPath, rewritten, 'utf8');
    reindexBoot({ projectRoot, userDir, db });

    const unrelatedAfter = db
      .prepare("SELECT src, dst, type, dst_resolved FROM edges WHERE src != ? ORDER BY src, dst, type")
      .all(DANGLE);
    expect(unrelatedAfter).toEqual(unrelatedBefore);

    // And DANGLE's own edge flipped from dangling → resolved.
    const dRow = db.prepare('SELECT * FROM edges WHERE src = ?').get(DANGLE);
    expect(dRow).toMatchObject({ src: DANGLE, dst: B, dst_resolved: 1 });
  });
});

describe('reindexBoot cold-edge migration (pre-232 index)', () => {
  it('populates an empty edges table on the next boot when observations exist', () => {
    seedCorpus();
    reindexFull({ projectRoot, userDir, db });
    // Simulate a pre-232 index: observations present, edges empty.
    db.prepare('DELETE FROM edges').run();
    expect(db.prepare('SELECT COUNT(*) AS n FROM edges').get().n).toBe(0);
    // A no-change boot should still self-heal the cold edges.
    const r = reindexBoot({ projectRoot, userDir, db });
    expect(r.edgesRebuilt).toBe(true);
    expect(db.prepare('SELECT COUNT(*) AS n FROM edges').get().n).toBeGreaterThan(0);
  });
});

describe('buildLinks edge cases', () => {
  it('rejects a malformed id', () => {
    expect(buildLinks(db, 'not-an-id')).toEqual({ ok: false, error: 'id must be a valid kit ID' });
  });

  it('a known-but-unlinked id returns found:true with empty neighbourhoods', () => {
    seedFact({ id: B, slug: 'bravo' });
    reindexFull({ projectRoot, userDir, db });
    const links = buildLinks(db, B);
    expect(links.found).toBe(true);
    expect(links.out).toEqual([]);
    expect(links.backlinks).toEqual([]);
    expect(links.supersession_chain).toBeNull();
  });
});
