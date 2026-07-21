// @doors: 1, 2
// Door 2: read-only module — "state" here is what the walk OBSERVES on disk
//   (which files it yields, which it skips), asserted against a seeded tier.
// Door 3 N/A: pure in-process file IO — no subprocess spawn, no LLM.
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: the walk is a reader; it writes no audit/NDJSON entry. Its
//   CALLERS own their own observability (expiry-sweep's tombstone entries,
//   reindex's warnings) and those are asserted in their own suites.

// Boundary tests for fact-store.mjs — the shared walk over the granular fact
// archive (Task 241 / D-368, D-385).
//
// WHY THIS FILE EXISTS. Task 241 migrated 14 call sites onto this module and
// deliberately shipped with ZERO edits to existing tests — a passing suite was
// the contract proving the refactor changed no behavior. But that contract says
// nothing about the NEW module's own boundary: a shared walker is now the single
// point of failure for 14 callers, and several of its contracts are load-bearing
// in ways only ONE caller depends on, so the migration suite would stay green
// while the contract silently broke. Those are the ones pinned hardest here:
//
//   · `listMarkdownFiles` RETHROWS a readdir error (it only short-circuits on a
//     MISSING dir) — doctor's HC-4 catches that throw to report `status:'fail'`
//     with the readdir message. If this module ever swallowed it, HC-4 would
//     silently report "0 fact files" and flag every INDEX entry as stale.
//   · `eachFactIn` REQUIRES an `id` while `listFactFiles` does not — that exact
//     distinction is why `import-claude-md` takes the lister: its dedup set
//     intentionally indexes id-less fact files, and routing it through the
//     parsed walk would shrink the set and let a duplicate import land.
//   · `tiersFor` omits U when no userDir is supplied — the D-69 guard against a
//     library-level homedir() reach touching the REAL user tier from a test.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  INDEX_FILENAME,
  listMarkdownFiles,
  listFactFiles,
  tiersFor,
  eachFactIn,
  eachFact,
  eachLiveFact,
} from '../packages/cli/src/fact-store.mjs';

let root;

function fact(dir, filename, frontmatter, body = 'a body') {
  mkdirSync(dir, { recursive: true });
  const fm = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  writeFileSync(join(dir, filename), `---\n${fm}\n---\n\n${body}\n`, 'utf8');
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cmk-fact-store-'));
});

afterEach(() => {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    // best-effort temp cleanup
  }
});

describe('listMarkdownFiles', () => {
  it('returns [] for a missing directory rather than throwing', () => {
    expect(listMarkdownFiles(join(root, 'nope'))).toEqual([]);
  });

  it('RETHROWS a readdir error — HC-4 depends on catching it', () => {
    // A FILE where a directory is expected: readdirSync gives ENOTDIR. This is
    // the contract doctor's hc4IndexConsistency relies on to report a 'fail'
    // health check with the real error message instead of "0 fact files".
    const notADir = join(root, 'memory');
    mkdirSync(root, { recursive: true });
    writeFileSync(notADir, 'i am a file', 'utf8');
    expect(() => listMarkdownFiles(notADir)).toThrow();
  });

  it('skips INDEX.md, non-.md files, and subdirectories', () => {
    const dir = join(root, 'memory');
    mkdirSync(join(dir, 'archive'), { recursive: true });
    mkdirSync(join(dir, 'looks-like-a-fact.md'), { recursive: true });
    writeFileSync(join(dir, INDEX_FILENAME), '# index', 'utf8');
    writeFileSync(join(dir, 'notes.txt'), 'nope', 'utf8');
    writeFileSync(join(dir, 'project_real.md'), '---\nid: P-2345679A\n---\n\nx\n', 'utf8');

    expect(listMarkdownFiles(dir)).toEqual(['project_real.md']);
  });

  it('sorts by code unit so the same corpus lists identically on every machine', () => {
    const dir = join(root, 'memory');
    mkdirSync(dir, { recursive: true });
    for (const n of ['project_zebra.md', 'project_Alpha.md', 'project_apple.md']) {
      writeFileSync(join(dir, n), '---\nid: P-2345679A\n---\n\nx\n', 'utf8');
    }
    // Code-unit order puts uppercase before lowercase — deliberately NOT locale
    // collation, which would reorder these per user locale (reindex writes this
    // order into the COMMITTED INDEX.md).
    expect(listMarkdownFiles(dir)).toEqual([
      'project_Alpha.md',
      'project_apple.md',
      'project_zebra.md',
    ]);
  });

  it('honors an explicit exclude set (forget scrubs scratchpads, not DECISIONS.md)', () => {
    const dir = join(root, 'context');
    mkdirSync(dir, { recursive: true });
    for (const n of ['MEMORY.md', 'SOUL.md', 'DECISIONS.md', INDEX_FILENAME]) {
      writeFileSync(join(dir, n), 'x', 'utf8');
    }
    const got = listMarkdownFiles(dir, { exclude: [INDEX_FILENAME, 'DECISIONS.md'] });
    expect(got).toEqual(['MEMORY.md', 'SOUL.md']);
  });
});

describe('tiersFor', () => {
  it('omits U when no userDir is supplied (the D-69 no-homedir-reach guard)', () => {
    expect(tiersFor({ projectRoot: root })).toEqual(['P', 'L']);
  });

  it('includes U only when a userDir is explicitly passed', () => {
    expect(tiersFor({ projectRoot: root, userDir: join(root, 'u') })).toEqual(['P', 'L', 'U']);
  });

  it('returns [] when neither root is supplied', () => {
    expect(tiersFor({})).toEqual([]);
  });
});

describe('eachFactIn', () => {
  it('requires an id, while listFactFiles does NOT — the import-claude-md split', () => {
    const dir = join(root, 'memory');
    fact(dir, 'project_with_id.md', { id: 'P-2345679A', type: 'project' });
    // An id-less fact file: real in the wild (a hand-written or partially
    // written file). import-claude-md's dedup set must still index its body.
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'project_no_id.md'), '---\ntype: project\n---\n\nbody\n', 'utf8');

    expect(listFactFiles(dir)).toEqual(['project_no_id.md', 'project_with_id.md']);
    expect([...eachFactIn(dir)].map((f) => f.id)).toEqual(['P-2345679A']);
  });

  it('skips an unparseable file instead of throwing into the caller', () => {
    const dir = join(root, 'memory');
    fact(dir, 'project_good.md', { id: 'P-2345679A', type: 'project' });
    mkdirSync(dir, { recursive: true });
    // Merge-conflict markers in a committed fact file — a realistic trigger.
    writeFileSync(
      join(dir, 'project_broken.md'),
      '---\n<<<<<<< HEAD\nid: [unclosed\n---\n\nbody\n',
      'utf8',
    );

    expect([...eachFactIn(dir)].map((f) => f.id)).toEqual(['P-2345679A']);
  });

  it('yields the full record shape and merges the caller ctx', () => {
    const dir = join(root, 'memory');
    fact(dir, 'project_x.md', { id: 'P-2345679A', type: 'project' }, 'the body');
    const [f] = [...eachFactIn(dir, { tier: 'P', tierRoot: root })];

    expect(f).toMatchObject({
      id: 'P-2345679A',
      filename: 'project_x.md',
      path: join(dir, 'project_x.md'),
      factDir: dir,
      tier: 'P',
      tierRoot: root,
    });
    expect(f.body.trim()).toBe('the body');
    expect(f.frontmatter.type).toBe('project');
  });

  it('materializes the file list BEFORE yielding, so a caller may mutate while walking', () => {
    // expiry-sweep calls forget() (which moves files out of factDir) from inside
    // this loop. The snapshot point must stay where readdirSync used to sit, or
    // a fact would be skipped mid-sweep.
    const dir = join(root, 'memory');
    for (const n of ['project_a.md', 'project_b.md', 'project_c.md']) {
      fact(dir, n, { id: `P-234567${n[8].toUpperCase()}A`, type: 'project' });
    }
    const seen = [];
    for (const f of eachFactIn(dir)) {
      seen.push(f.filename);
      rmSync(f.path, { force: true }); // delete the CURRENT entry mid-walk
    }
    expect(seen).toEqual(['project_a.md', 'project_b.md', 'project_c.md']);
  });
});

describe('eachFact / eachLiveFact', () => {
  function seedTiers() {
    fact(join(root, 'context', 'memory'), 'project_live.md', {
      id: 'P-2345679A',
      type: 'project',
    });
    fact(join(root, 'context', 'memory'), 'project_dead.md', {
      id: 'P-BCDEFGHJ',
      type: 'project',
      deleted_at: '2026-07-01T00:00:00Z',
    });
    fact(join(root, 'context.local', 'memory'), 'project_local.md', {
      id: 'L-KLMNPQRS',
      type: 'project',
    });
    fact(join(root, 'user', 'fragments'), 'user_u.md', { id: 'U-TUVWXYZ2', type: 'user' });
  }

  it('walks P + L + U, resolving the U tier to fragments/ not memory/', () => {
    seedTiers();
    const ids = [...eachFact({ projectRoot: join(root, 'context', '..'), userDir: join(root, 'user') })]
      .map((f) => f.id)
      .sort();
    expect(ids).toEqual(['L-KLMNPQRS', 'P-2345679A', 'P-BCDEFGHJ', 'U-TUVWXYZ2']);
  });

  it('eachLiveFact drops tombstoned facts; eachFact keeps them', () => {
    seedTiers();
    const opts = { projectRoot: root };
    expect([...eachFact(opts)].map((f) => f.id).sort()).toEqual(['L-KLMNPQRS', 'P-2345679A', 'P-BCDEFGHJ']);
    // trust + write-fact's dedup + forget.resolveFact all depend on eachFactIn
    // still SEEING the tombstone; only this door filters it.
    expect([...eachLiveFact(opts)].map((f) => f.id).sort()).toEqual(['L-KLMNPQRS', 'P-2345679A']);
  });

  it('skips a tier whose fact dir does not exist rather than throwing', () => {
    fact(join(root, 'context', 'memory'), 'project_only.md', { id: 'P-2345679A', type: 'project' });
    // No context.local/ at all — the L tier must simply contribute nothing.
    expect([...eachLiveFact({ projectRoot: root })].map((f) => f.id)).toEqual(['P-2345679A']);
  });

  it('honors an explicit tiers list (forget resolves by the id prefix alone)', () => {
    seedTiers();
    const got = [...eachLiveFact({ projectRoot: root, tiers: ['L'] })].map((f) => f.id);
    expect(got).toEqual(['L-KLMNPQRS']);
  });
});
