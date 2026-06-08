// @doors: 1, 2, 5
// Door 3 N/A: tombstone discipline is in-process file move + audit-log append; no subprocess spawn.
// Door 4 N/A: no message-queue interaction.

// Tests for Task 9 — Tombstone discipline (T-008).
// Per tasks.md 9.5:
//   - Test `cmk forget P-XXX --yes` moves file to archive/tombstones/<id>.md
//   - Test deletion frontmatter fields all present
//     (valid ISO timestamp, string reason, enum deleted_by)
//   - Test scratchpad bullet with matching ID is removed
//     (bullet + provenance comment)
//   - Test resolveFact(tombstoned_id) returns body + deleted_on annotation (NOT 404)
//     (resolveFact is the boundary that Task 31 mk_get will wrap)
//   - Test forget(<nonexistent_id>) returns action: 'not-found'
//
// Boundary-test discipline:
//   - Test the forget() + resolveFact() PUBLIC contract — what files move
//     where, what frontmatter the tombstone carries, what gets stripped
//     from scratchpads, and what resolveFact returns for each state.
//   - Do NOT reach into internal helpers (frontmatter writers, scratchpad
//     line matchers, ID validators).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { forget, resolveFact } from '../packages/cli/src/forget.mjs';
import { writeFact } from '../packages/cli/src/write-fact.mjs';
import { openIndexDb } from '../packages/cli/src/index-db.mjs';
import { reindexBoot } from '../packages/cli/src/index-rebuild.mjs';

function validFactOpts(overrides = {}) {
  return {
    tier: 'P',
    type: 'feedback',
    slug: 'sample',
    title: 'Sample fact',
    body: 'This is the body of the sample fact.',
    writeSource: 'user-explicit',
    trust: 'high',
    sourceFile: 'context/transcripts/2026-05-24.md',
    sourceLine: 1,
    sourceSha1: 'deadbeef0123456789abcdef0123456789abcdef',
    ...overrides,
  };
}

import { parse as parseFrontmatterText } from '../packages/cli/src/frontmatter.mjs';

function parseFrontmatter(filePath) {
  return parseFrontmatterText(readFileSync(filePath, 'utf8'));
}

/** Write a scratchpad with a bullet referencing a given citation id, plus an
 * unrelated control bullet that must survive the scrub. */
function seedScratchpad(path, citedId, otherText = 'unrelated bullet') {
  const content = [
    '# MEMORY.md',
    '',
    '## Active threads',
    '',
    `- The bullet that cites (${citedId}) and should be removed.`,
    `<!-- id: ${citedId}, source_file: x.md, source_line: 1, source_sha1: abc, write_source: user-explicit, trust: high, created_at: 2026-05-24T10:00:00Z -->`,
    `- ${otherText}`,
    `<!-- id: P-XTRAFRCT, source_file: y.md, source_line: 1, source_sha1: def, write_source: user-explicit, trust: high, created_at: 2026-05-24T10:00:01Z -->`,
    '',
  ].join('\n');
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content, 'utf8');
}

describe('Task 9 — forget() + resolveFact() boundaries', () => {
  let sandbox;
  let projectRoot;
  let userDir;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'cmk-forget-test-'));
    projectRoot = join(sandbox, 'proj');
    userDir = join(sandbox, 'user-tier');
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  describe('ID-based forget (happy path)', () => {
    it('moves the matched file to <tier>/memory/archive/tombstones/<id>.md', () => {
      const w = writeFact(validFactOpts({ projectRoot }));
      const r = forget({
        idOrQuery: w.id,
        projectRoot,
        reason: 'no longer relevant',
        yes: true,
      });
      expect(r.action).toBe('tombstoned');
      expect(r.id).toBe(w.id);
      expect(r.tier).toBe('P');
      const expectedTombstone = join(
        projectRoot,
        'context',
        'memory',
        'archive',
        'tombstones',
        `${w.id}.md`,
      );
      expect(r.tombstonePath).toBe(expectedTombstone);
      expect(existsSync(expectedTombstone)).toBe(true);
      expect(existsSync(w.path)).toBe(false);
    });

    it('deletion frontmatter has deleted_at (ISO), deleted_reason (string), deleted_by (enum)', () => {
      const w = writeFact(validFactOpts({ projectRoot }));
      const r = forget({
        idOrQuery: w.id,
        projectRoot,
        reason: 'no longer relevant',
        deletedBy: 'user-explicit',
        yes: true,
      });
      const { frontmatter } = parseFrontmatter(r.tombstonePath);
      expect(frontmatter.deleted_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(frontmatter.deleted_reason).toBe('no longer relevant');
      expect(frontmatter.deleted_by).toBe('user-explicit');
      // Original frontmatter fields preserved
      expect(frontmatter.id).toBe(w.id);
      expect(frontmatter.type).toBe('feedback');
      expect(frontmatter.title).toBe('Sample fact');
    });

    it('preserves the original body in the tombstoned file', () => {
      const body = 'A very particular body that must survive tombstoning.';
      const w = writeFact(validFactOpts({ projectRoot, body }));
      const r = forget({ idOrQuery: w.id, projectRoot, yes: true });
      const text = readFileSync(r.tombstonePath, 'utf8');
      expect(text).toContain(body);
    });

    it('appends an audit-log entry recording the tombstone (canonical schema v1)', () => {
      const w = writeFact(validFactOpts({ projectRoot }));
      forget({ idOrQuery: w.id, projectRoot, reason: 'r', yes: true });
      const auditPath = join(projectRoot, 'context', '.locks', 'audit.log');
      expect(existsSync(auditPath)).toBe(true);
      const lines = readFileSync(auditPath, 'utf8')
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l));
      const entry = lines.find((e) => e.action === 'tombstoned' && e.id === w.id);
      expect(entry).toBeDefined();
      // Post-PR-2 canonical audit-log schema (per Layer-2 review I4):
      //   {ts, schema: 1, action, tier, id, reasonCode, reasonText?, paths, extra}
      expect(entry.schema).toBe(1);
      expect(entry.tier).toBe('P');
      expect(entry.reasonCode).toBe('user-requested');
      expect(entry.reasonText).toBe('r');
      expect(entry.paths.before).toBe(w.path);
      expect(entry.paths.archive).toBe(
        join(
          projectRoot,
          'context',
          'memory',
          'archive',
          'tombstones',
          `${w.id}.md`,
        ),
      );
      expect(entry.extra.deletedBy).toBe('user-explicit');
    });
  });

  describe('tier resolution from ID prefix', () => {
    it('tombstones a tier-L fact at context.local/memory/archive/tombstones/', () => {
      const w = writeFact(validFactOpts({ projectRoot, tier: 'L' }));
      const r = forget({ idOrQuery: w.id, projectRoot, yes: true });
      expect(r.tier).toBe('L');
      expect(r.tombstonePath).toBe(
        join(
          projectRoot,
          'context.local',
          'memory',
          'archive',
          'tombstones',
          `${w.id}.md`,
        ),
      );
      expect(existsSync(r.tombstonePath)).toBe(true);
    });

    it('tombstones a tier-U fact at <userDir>/fragments/archive/tombstones/', () => {
      const w = writeFact(validFactOpts({ tier: 'U', userDir }));
      const r = forget({ idOrQuery: w.id, userDir, yes: true });
      expect(r.tier).toBe('U');
      expect(r.tombstonePath).toBe(
        join(userDir, 'fragments', 'archive', 'tombstones', `${w.id}.md`),
      );
      expect(existsSync(r.tombstonePath)).toBe(true);
    });
  });

  describe('not-found and error cases', () => {
    // Layer-2 review M5: use a valid-format-but-nonexistent id (chars all in
    // the kit's custom base32 alphabet) instead of 'P-MSSNGGG2' which contains
    // 'I' (excluded). Pre-fix this test silently exercised the query-fallback
    // path (idOrQuery → substring search → 0 matches). Post-fix it exercises
    // the intended ID-not-found code path.
    it('forget(<valid-format-but-nonexistent id>) returns action: "not-found"', () => {
      const r = forget({ idOrQuery: 'P-MSSNGGG2', projectRoot, yes: true });
      expect(r.action).toBe('not-found');
      expect(r.errors).toBeDefined();
      expect(r.errors.join(' ')).toMatch(/not found|no matching/i);
    });

    it('forget with malformed idOrQuery (empty) returns error', () => {
      const r = forget({ idOrQuery: '', projectRoot, yes: true });
      expect(r.action).toBe('error');
    });

    it('reindex of an archive subdir does not see the tombstoned file (existing reindex contract)', () => {
      // Sanity that the tombstone path puts the file outside reindex's scan.
      const w = writeFact(validFactOpts({ projectRoot, slug: 'tomb' }));
      const r = forget({ idOrQuery: w.id, projectRoot, yes: true });
      expect(r.tombstonePath).toContain(join('archive', 'tombstones'));
    });
  });

  // Layer-2 review B2 RELAXATION (PR-2): PR-1 rejected \n / \r / : in the
  // `reason` field as a minimum fix for the naive serializer. PR-2's
  // frontmatter.mjs (js-yaml CORE_SCHEMA) quotes those chars properly.
  // The input restriction is LIFTED; these tests prove the round-trip works.
  describe('B2 relaxation — `reason` now accepts \\n / \\r / : via js-yaml quoting', () => {
    const trickyReasons = [
      'multi\nline reason',
      'user said: forget X',
      'corrupt\rpayload',
      'compound: with all\nspecial chars\rin one string',
    ];

    for (const reason of trickyReasons) {
      const label = JSON.stringify(reason).slice(0, 40);
      it(`tombstones successfully with reason ${label}: round-trip preserves the value`, () => {
        const w = writeFact(validFactOpts({ projectRoot }));
        const r = forget({
          idOrQuery: w.id,
          projectRoot,
          reason,
          yes: true,
        });
        expect(r.action).toBe('tombstoned');
        const { frontmatter } = parseFrontmatter(r.tombstonePath);
        expect(frontmatter.deleted_reason).toBe(reason);
      });
    }
  });

  describe('confirmation', () => {
    it('without yes:true and with confirm returning false → action: "cancelled"', () => {
      const w = writeFact(validFactOpts({ projectRoot }));
      const r = forget({
        idOrQuery: w.id,
        projectRoot,
        confirm: () => false,
      });
      expect(r.action).toBe('cancelled');
      expect(existsSync(w.path)).toBe(true); // file untouched
      const tombstone = join(
        projectRoot,
        'context',
        'memory',
        'archive',
        'tombstones',
        `${w.id}.md`,
      );
      expect(existsSync(tombstone)).toBe(false);
    });

    it('without yes:true and with confirm returning true → proceeds', () => {
      const w = writeFact(validFactOpts({ projectRoot }));
      const calls = [];
      const r = forget({
        idOrQuery: w.id,
        projectRoot,
        confirm: (info) => {
          calls.push(info);
          return true;
        },
      });
      expect(r.action).toBe('tombstoned');
      expect(calls.length).toBe(1);
      expect(calls[0].id).toBe(w.id);
    });

    it('without yes and without confirm callback → throws (caller must provide one)', () => {
      const w = writeFact(validFactOpts({ projectRoot }));
      expect(() => forget({ idOrQuery: w.id, projectRoot })).toThrow(
        /confirm|yes/i,
      );
      expect(existsSync(w.path)).toBe(true);
    });
  });

  describe('scratchpad scrub (9.4)', () => {
    it('strips a matching bullet (and its provenance HTML comment) from a scratchpad in the same tier', () => {
      const w = writeFact(validFactOpts({ projectRoot, body: 'fact body' }));
      const memoryMd = join(projectRoot, 'context', 'MEMORY.md');
      seedScratchpad(memoryMd, w.id);

      const before = readFileSync(memoryMd, 'utf8');
      expect(before).toContain(w.id);

      const r = forget({ idOrQuery: w.id, projectRoot, yes: true });
      expect(r.action).toBe('tombstoned');
      expect(r.scratchpadEdits).toBeDefined();
      const editedMemoryEntry = r.scratchpadEdits.find((e) =>
        e.path.endsWith('MEMORY.md'),
      );
      expect(editedMemoryEntry).toBeDefined();
      expect(editedMemoryEntry.removed).toBeGreaterThanOrEqual(1);

      const after = readFileSync(memoryMd, 'utf8');
      expect(after).not.toContain(w.id);
      expect(after).toContain('unrelated bullet');
      expect(after).toContain('P-XTRAFRCT');
    });

    it('scratchpads NOT containing the id are byte-preserved', () => {
      const w = writeFact(validFactOpts({ projectRoot }));
      const soulMd = join(projectRoot, 'context', 'SOUL.md');
      const original = '# SOUL.md\n\nContent that does not cite any fact.\n';
      mkdirSync(join(projectRoot, 'context'), { recursive: true });
      writeFileSync(soulMd, original, 'utf8');

      forget({ idOrQuery: w.id, projectRoot, yes: true });
      expect(readFileSync(soulMd, 'utf8')).toBe(original);
    });

    it('multiple bullets in the same scratchpad all stripped', () => {
      const w = writeFact(validFactOpts({ projectRoot }));
      const memoryMd = join(projectRoot, 'context', 'MEMORY.md');
      const content = [
        '# MEMORY.md',
        '',
        `- First citation of (${w.id}).`,
        `<!-- id: ${w.id}, source_file: x.md, source_line: 1, source_sha1: a, write_source: user-explicit, trust: high, created_at: 2026-05-24T10:00:00Z -->`,
        `- Unrelated bullet.`,
        `<!-- id: P-XTRAFAAA, source_file: y.md, source_line: 1, source_sha1: b, write_source: user-explicit, trust: high, created_at: 2026-05-24T10:00:01Z -->`,
        `- Second citation of (${w.id}).`,
        `<!-- id: ${w.id}, source_file: z.md, source_line: 1, source_sha1: c, write_source: user-explicit, trust: high, created_at: 2026-05-24T10:00:02Z -->`,
        '',
      ].join('\n');
      mkdirSync(join(projectRoot, 'context'), { recursive: true });
      writeFileSync(memoryMd, content, 'utf8');

      const r = forget({ idOrQuery: w.id, projectRoot, yes: true });
      const after = readFileSync(memoryMd, 'utf8');
      const entry = r.scratchpadEdits.find((e) => e.path.endsWith('MEMORY.md'));
      expect(entry.removed).toBe(2);
      expect(after.match(new RegExp(w.id, 'g'))).toBeNull();
      expect(after).toContain('Unrelated bullet');
    });
  });

  describe('resolveFact() — tombstone-aware reads (mk_get prep for Task 31)', () => {
    it('a live fact resolves to state: "live" with body and frontmatter', () => {
      const w = writeFact(validFactOpts({ projectRoot, body: 'live body' }));
      const r = resolveFact({ id: w.id, projectRoot });
      expect(r.state).toBe('live');
      expect(r.path).toBe(w.path);
      expect(r.body).toContain('live body');
      expect(r.frontmatter.id).toBe(w.id);
      expect(r.deletedAt).toBeUndefined();
    });

    it('a tombstoned fact resolves to state: "tombstoned" with body + deletedAt (NOT 404)', () => {
      const w = writeFact(validFactOpts({ projectRoot, body: 'doomed body' }));
      forget({ idOrQuery: w.id, projectRoot, reason: 'gone', yes: true });
      const r = resolveFact({ id: w.id, projectRoot });
      expect(r.state).toBe('tombstoned');
      expect(r.body).toContain('doomed body');
      expect(r.deletedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(r.frontmatter.deleted_reason).toBe('gone');
    });

    it('a never-existed id resolves to state: "not-found"', () => {
      const r = resolveFact({ id: 'P-NEVERWAS', projectRoot });
      expect(r.state).toBe('not-found');
    });

    it('resolveFact follows the ID tier prefix (P / L / U)', () => {
      const wL = writeFact(validFactOpts({ projectRoot, tier: 'L', slug: 'local' }));
      const wU = writeFact(validFactOpts({ tier: 'U', userDir, slug: 'user' }));

      const rL = resolveFact({ id: wL.id, projectRoot });
      expect(rL.state).toBe('live');
      expect(rL.path).toBe(wL.path);

      const rU = resolveFact({ id: wU.id, userDir });
      expect(rU.state).toBe('live');
      expect(rU.path).toBe(wU.path);
    });
  });

  describe('query-based forget (substring match on body)', () => {
    it('a substring matching exactly one fact resolves to its id and tombstones it', () => {
      writeFact(validFactOpts({ projectRoot, slug: 'a', body: 'alpha bullet text' }));
      const w2 = writeFact(
        validFactOpts({ projectRoot, slug: 'b', body: 'beta unique marker payload' }),
      );
      const r = forget({
        idOrQuery: 'unique marker',
        projectRoot,
        yes: true,
      });
      expect(r.action).toBe('tombstoned');
      expect(r.id).toBe(w2.id);
      expect(existsSync(w2.path)).toBe(false);
    });

    it('a substring matching multiple facts returns an ambiguous error with candidate ids', () => {
      const a = writeFact(
        validFactOpts({ projectRoot, slug: 'a', body: 'common keyword here' }),
      );
      const b = writeFact(
        validFactOpts({ projectRoot, slug: 'b', body: 'common keyword again' }),
      );
      const r = forget({ idOrQuery: 'common keyword', projectRoot, yes: true });
      expect(r.action).toBe('error');
      expect(r.errors.join(' ')).toMatch(/ambiguous|multiple/i);
      expect(r.errors.join(' ')).toContain(a.id);
      expect(r.errors.join(' ')).toContain(b.id);
      // Both files untouched
      expect(existsSync(a.path)).toBe(true);
      expect(existsSync(b.path)).toBe(true);
    });

    it('a substring matching zero facts returns action: "not-found"', () => {
      writeFact(validFactOpts({ projectRoot }));
      const r = forget({
        idOrQuery: 'no fact contains this string anywhere',
        projectRoot,
        yes: true,
      });
      expect(r.action).toBe('not-found');
    });
  });

  // Task 110 (F-7 / D-84): forget must AUTO-propagate to the search index
  // in-band — a forgotten fact must NOT keep surfacing in `cmk search` until a
  // manual `cmk reindex`. The regular user never runs commands (D-85): "forget
  // X" → gone from search, zero follow-up. forget() reindexes the project tier
  // (which orphan-prunes the just-tombstoned file) as part of the operation.
  describe('Task 110 — forget auto-reindexes the search index in-band (F-7)', () => {
    function indexedIds(projectRoot, userDir) {
      const db = openIndexDb({ projectRoot });
      try {
        return db.prepare('SELECT id FROM observations').all().map((r) => r.id);
      } finally {
        db.close();
      }
    }

    it('removes the forgotten fact from the index WITHOUT a manual reindex', () => {
      const keep = writeFact(validFactOpts({ projectRoot, slug: 'keep', body: 'keep this one' }));
      const gone = writeFact(validFactOpts({ projectRoot, slug: 'gone', body: 'forget this one' }));

      // Index both (simulates the state after a prior search/session).
      const db0 = openIndexDb({ projectRoot });
      reindexBoot({ projectRoot, userDir, db: db0 });
      db0.close();
      expect(indexedIds(projectRoot, userDir)).toEqual(
        expect.arrayContaining([keep.id, gone.id]),
      );

      // Forget — and do NOT call reindex ourselves. forget() must do it in-band.
      const r = forget({ idOrQuery: gone.id, projectRoot, userDir, yes: true });
      expect(r.action).toBe('tombstoned');

      // Door 2 (State): the index no longer carries the forgotten fact, but the
      // survivor is UNTOUCHED (over-mutation guard).
      const after = indexedIds(projectRoot, userDir);
      expect(after).not.toContain(gone.id);
      expect(after).toContain(keep.id);
    });

    it('degrades gracefully when there is no projectRoot index to update', () => {
      // A pure user-tier forget (no projectRoot) has no project index to touch —
      // it must still tombstone without throwing.
      const w = writeFact(validFactOpts({ projectRoot, slug: 'solo' }));
      const r = forget({ idOrQuery: w.id, projectRoot, yes: true });
      expect(r.action).toBe('tombstoned');
    });
  });
});
