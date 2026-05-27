// @doors: 1, 2
// Door 3 N/A: layer-2 round-trip is in-process file flow (writeFact → readBullet → mergeFacts → forget); no subprocess spawn.
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: layer-2 modules return their action structs (Door 1); audit-log writes are tested in the per-module test files (cli-write-fact, cli-merge-facts, cli-forget, cli-trust).

// Layer-2 integration tests — added per the Layer-2 review's gap findings G1,
// G2, G5. Single-task PRs cover each module in isolation; this file covers
// the cross-module interactions that those structurally can't.
//
// G1: End-to-end round-trip per Checkpoint 11's documented contract:
//     "write fact → reindex → query INDEX → forget → tombstone resolves on mk_get"
// G2: Cross-module audit-log uniformity: all three writers (writeFact-skipped,
//     forget-tombstoned, mergeFacts-merged) share the canonical NDJSON schema.
// G5: Cross-tier isolation: forget in tier P does NOT affect facts or
//     scratchpads in tier U or tier L (and vice versa).

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
import { writeFact } from '../packages/cli/src/write-fact.mjs';
import { reindex } from '../packages/cli/src/reindex.mjs';
import { forget, resolveFact } from '../packages/cli/src/forget.mjs';
import { mergeFacts } from '../packages/cli/src/merge-facts.mjs';
import { readAuditLog, AUDIT_LOG_SCHEMA_VERSION } from '../packages/cli/src/audit-log.mjs';

function validFactOpts(overrides = {}) {
  return {
    tier: 'P',
    type: 'feedback',
    slug: 'sample',
    title: 'Sample fact',
    body: 'sample body content for the integration tests.',
    writeSource: 'user-explicit',
    trust: 'high',
    sourceFile: 'context/transcripts/2026-05-24.md',
    sourceLine: 1,
    sourceSha1: 'deadbeef0123456789abcdef0123456789abcdef',
    ...overrides,
  };
}

describe('Layer 2 — round-trip integration (Checkpoint 11 G1)', () => {
  let sandbox;
  let projectRoot;
  let userDir;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'cmk-layer2-test-'));
    projectRoot = join(sandbox, 'proj');
    userDir = join(sandbox, 'user-tier');
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  describe('G1 — write → reindex → INDEX → forget → tombstone resolves on mk_get', () => {
    it('writeFact lands a fact that reindex finds + resolveFact returns "live"', () => {
      const w = writeFact(
        validFactOpts({ projectRoot, slug: 'roundtrip', body: 'roundtrip body' }),
      );
      expect(w.action).toBe('created');

      const r = reindex({ tier: 'P', projectRoot });
      expect(r.factCount).toBe(1);
      const indexText = readFileSync(r.indexPath, 'utf8');
      expect(indexText).toContain(w.id);
      expect(indexText).toContain('Sample fact');

      const resolved = resolveFact({ id: w.id, projectRoot });
      expect(resolved.state).toBe('live');
      expect(resolved.body).toContain('roundtrip body');
    });

    it('forget after write: reindex excludes the tombstoned id + resolveFact returns "tombstoned" with body', () => {
      const w = writeFact(
        validFactOpts({ projectRoot, slug: 'tombthis', body: 'doomed body' }),
      );
      const f = forget({
        idOrQuery: w.id,
        projectRoot,
        reason: 'no longer relevant',
        yes: true,
      });
      expect(f.action).toBe('tombstoned');

      const r = reindex({ tier: 'P', projectRoot });
      expect(r.factCount).toBe(0);
      const indexText = readFileSync(r.indexPath, 'utf8');
      expect(indexText).not.toContain(w.id);

      const resolved = resolveFact({ id: w.id, projectRoot });
      expect(resolved.state).toBe('tombstoned');
      expect(resolved.body).toContain('doomed body');
      expect(resolved.deletedAt).toBeDefined();
      expect(resolved.frontmatter.deleted_reason).toBe('no longer relevant');
    });

    it('mergeFacts after writes: reindex shows only C + resolveFact resolves A and B as superseded → C', () => {
      const wA = writeFact(
        validFactOpts({ projectRoot, slug: 'a', body: 'alpha sentence.' }),
      );
      const wB = writeFact(
        validFactOpts({ projectRoot, slug: 'b', body: 'beta sentence.' }),
      );
      const m = mergeFacts({
        idA: wA.id,
        idB: wB.id,
        mergedBody: 'consolidated alpha and beta.',
        mergedTitle: 'Consolidated A+B',
        mergedSlug: 'ab_merged',
        writeSource: 'user-explicit',
        trust: 'high',
        sourceFile: 'context/transcripts/2026-05-24.md',
        sourceLine: 99,
        sourceSha1: 'feedface0123456789abcdef0123456789abcdef',
        projectRoot,
      });
      expect(m.action).toBe('merged');

      const r = reindex({ tier: 'P', projectRoot });
      expect(r.factCount).toBe(1);
      const indexText = readFileSync(r.indexPath, 'utf8');
      expect(indexText).toContain(m.id);
      expect(indexText).not.toContain(wA.id);
      expect(indexText).not.toContain(wB.id);

      expect(resolveFact({ id: wA.id, projectRoot }).state).toBe('superseded');
      expect(resolveFact({ id: wB.id, projectRoot }).state).toBe('superseded');
      expect(resolveFact({ id: wA.id, projectRoot }).supersededBy).toBe(m.id);
      expect(resolveFact({ id: wB.id, projectRoot }).supersededBy).toBe(m.id);
      expect(resolveFact({ id: m.id, projectRoot }).state).toBe('live');
    });
  });

  describe('G2 — cross-module audit-log uniformity', () => {
    it('all three writers emit entries with the canonical schema-v1 shape', () => {
      // writeFact (dedup) → "skipped" entry
      const w1 = writeFact(validFactOpts({ projectRoot, slug: 'a', body: 'X' }));
      const w2 = writeFact(validFactOpts({ projectRoot, slug: 'a', body: 'X' })); // duplicate
      expect(w2.action).toBe('skipped');

      // forget → "tombstoned" entry
      const wB = writeFact(validFactOpts({ projectRoot, slug: 'b', body: 'Y' }));
      forget({ idOrQuery: wB.id, projectRoot, reason: 'gone', yes: true });

      // mergeFacts → "merged" entry
      const wC = writeFact(validFactOpts({ projectRoot, slug: 'c', body: 'Z' }));
      const wD = writeFact(validFactOpts({ projectRoot, slug: 'd', body: 'W' }));
      mergeFacts({
        idA: wC.id,
        idB: wD.id,
        mergedBody: 'merged Z and W',
        mergedTitle: 'CD merge',
        mergedSlug: 'cd_merge',
        writeSource: 'user-explicit',
        trust: 'high',
        sourceFile: 'context/transcripts/2026-05-24.md',
        sourceLine: 1,
        sourceSha1: 'feedface0123456789abcdef0123456789abcdef',
        projectRoot,
      });

      const log = readAuditLog(join(projectRoot, 'context'));
      expect(log.length).toBeGreaterThanOrEqual(3);

      // Every entry has the core canonical fields
      for (const entry of log) {
        expect(entry.schema).toBe(AUDIT_LOG_SCHEMA_VERSION);
        expect(typeof entry.ts).toBe('string');
        expect(entry.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        expect(typeof entry.action).toBe('string');
        expect(entry.tier).toBe('P');
        expect(typeof entry.id).toBe('string');
        expect(typeof entry.reasonCode).toBe('string');
      }

      // Each action class is present with the right reasonCode
      const skipped = log.find((e) => e.action === 'skipped');
      const tombstoned = log.find((e) => e.action === 'tombstoned');
      const merged = log.find((e) => e.action === 'merged');
      expect(skipped).toBeDefined();
      expect(skipped.reasonCode).toBe('duplicate');
      expect(skipped.id).toBe(w1.id);

      expect(tombstoned).toBeDefined();
      expect(tombstoned.reasonCode).toBe('user-requested');
      expect(tombstoned.reasonText).toBe('gone');
      expect(tombstoned.paths.before).toBe(wB.path);
      expect(tombstoned.paths.archive).toContain(
        join('archive', 'tombstones'),
      );

      expect(merged).toBeDefined();
      expect(merged.reasonCode).toBe('curated-merge');
      expect(Array.isArray(merged.paths.archive)).toBe(true);
      expect(merged.paths.archive.length).toBe(2);
      expect(merged.extra.mergedFrom).toEqual([wC.id, wD.id]);
    });

    it('no audit-log entry lacks the schema:1 field (regression guard)', () => {
      // Trigger one of each action class
      const w = writeFact(validFactOpts({ projectRoot, slug: 'x' }));
      writeFact(validFactOpts({ projectRoot, slug: 'x' })); // dup
      forget({ idOrQuery: w.id, projectRoot, yes: true });
      const log = readAuditLog(join(projectRoot, 'context'));
      for (const entry of log) {
        expect(entry.schema).toBe(1);
      }
    });
  });

  describe('G5 — cross-tier isolation', () => {
    it('forget in tier P does NOT affect tier U facts at the same nominal slug', () => {
      const wP = writeFact(
        validFactOpts({
          projectRoot,
          tier: 'P',
          slug: 'shared',
          body: 'project-tier body',
        }),
      );
      const wU = writeFact(
        validFactOpts({
          tier: 'U',
          userDir,
          slug: 'shared',
          body: 'user-tier body — totally different',
        }),
      );
      expect(wP.id).not.toBe(wU.id); // different canonical body → different id

      // forget the project-tier id — must not touch the user-tier file
      forget({ idOrQuery: wP.id, projectRoot, userDir, yes: true });

      expect(existsSync(wP.path)).toBe(false);
      expect(existsSync(wU.path)).toBe(true);
      expect(resolveFact({ id: wU.id, userDir }).state).toBe('live');
    });

    it('scratchpad scrub in tier P does NOT scrub bullets in tier U scratchpads', () => {
      const wP = writeFact(
        validFactOpts({ projectRoot, tier: 'P', slug: 'scrub_p' }),
      );

      // Seed a tier-P scratchpad that cites wP.id (this SHOULD be scrubbed)
      const memoryMd = join(projectRoot, 'context', 'MEMORY.md');
      mkdirSync(join(projectRoot, 'context'), { recursive: true });
      writeFileSync(
        memoryMd,
        `# MEMORY.md\n\n- Project bullet citing (${wP.id}).\n<!-- id: ${wP.id} -->\n`,
        'utf8',
      );

      // Seed a tier-U scratchpad that also references wP.id (this MUST NOT be
      // scrubbed — same-tier-only scrubbing per Task 9 scope decision)
      const userMd = join(userDir, 'USER.md');
      mkdirSync(userDir, { recursive: true });
      const userBefore = `# USER.md\n\n- User bullet citing (${wP.id}).\n<!-- id: ${wP.id} -->\n`;
      writeFileSync(userMd, userBefore, 'utf8');

      const r = forget({
        idOrQuery: wP.id,
        projectRoot,
        userDir,
        yes: true,
      });
      expect(r.action).toBe('tombstoned');

      // Tier-P scratchpad: bullet was scrubbed
      const tierPAfter = readFileSync(memoryMd, 'utf8');
      expect(tierPAfter).not.toContain(wP.id);

      // Tier-U scratchpad: byte-preserved
      const userAfter = readFileSync(userMd, 'utf8');
      expect(userAfter).toBe(userBefore);
    });

    it('each tier maintains its own audit log; cross-tier ops do not leak entries', () => {
      const wP = writeFact(
        validFactOpts({ projectRoot, tier: 'P', slug: 'pp', body: 'P body' }),
      );
      const wU = writeFact(
        validFactOpts({ tier: 'U', userDir, slug: 'uu', body: 'U body' }),
      );

      // Tombstone in each tier
      forget({ idOrQuery: wP.id, projectRoot, userDir, yes: true });
      forget({ idOrQuery: wU.id, projectRoot, userDir, yes: true });

      const projectLog = readAuditLog(join(projectRoot, 'context'));
      const userLog = readAuditLog(userDir);

      // Project log records only the P tombstone
      expect(projectLog.length).toBeGreaterThan(0);
      for (const e of projectLog) expect(e.tier).toBe('P');
      expect(projectLog.find((e) => e.id === wP.id)).toBeDefined();
      expect(projectLog.find((e) => e.id === wU.id)).toBeUndefined();

      // User log records only the U tombstone
      expect(userLog.length).toBeGreaterThan(0);
      for (const e of userLog) expect(e.tier).toBe('U');
      expect(userLog.find((e) => e.id === wU.id)).toBeDefined();
      expect(userLog.find((e) => e.id === wP.id)).toBeUndefined();
    });
  });
});
