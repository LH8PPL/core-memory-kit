// Tests for Task 15 — cmk trust <id> <level> override (T-013).
// Per tasks.md 15.4:
//   - Test cmk trust <existing_id> high updates the field + writes one
//     audit.log line with the documented schema
//   - Test trust change for a scratchpad bullet (HTML-comment provenance)
//     updates the comment
//   - Test trust change for a fact file (YAML frontmatter) updates the YAML
//   - Test cmk trust <nonexistent_id> high returns not-found (exits 2 in CLI)
//   - Test cmk trust <id> bogus_level returns schema error (exits 2 in CLI)
//
// Boundary-test discipline:
//   - Test overrideTrust()'s public contract — what fields update on
//     disk, what audit-log entry is written, what the result reports.
//   - Don't reach into internal helpers (line walkers, frontmatter
//     mutators).

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
import { overrideTrust } from '../packages/cli/src/trust.mjs';
import { writeFact } from '../packages/cli/src/write-fact.mjs';
import { parse as parseFrontmatterText } from '../packages/cli/src/frontmatter.mjs';

function parseFrontmatter(filePath) {
  return parseFrontmatterText(readFileSync(filePath, 'utf8'));
}

function validFactOpts(overrides = {}) {
  return {
    tier: 'P',
    type: 'feedback',
    slug: 'trust_test',
    title: 'Trust test fact',
    body: 'this is a unique fact body for the trust override test',
    writeSource: 'user-explicit',
    trust: 'medium',
    sourceFile: 'context/transcripts/2026-05-24.md',
    sourceLine: 1,
    sourceSha1: 'a'.repeat(40),
    ...overrides,
  };
}

/** Seed a scratchpad with one bullet+provenance pair carrying the given id
 * and trust level. Independent of install — fully controlled fixture. */
function seedScratchpadWithBullet({ path, id, text, trust }) {
  mkdirSync(join(path, '..'), { recursive: true });
  const content = [
    `<!-- Cap: 2500 chars · Last distilled: 2026-05-24 · Last health check: 2026-05-24 -->`,
    '',
    '# Working Memory',
    '',
    '## Active Threads',
    '',
    `- (${id}) ${text}`,
    `  <!-- source: x.md, source_line: 1, sha1: ${'b'.repeat(40)}, write: manual-edit, trust: ${trust}, at: 2026-05-24T10:00:00Z -->`,
    '',
    '## Environment Notes',
    '',
    '## Pending Decisions',
    '',
  ].join('\n');
  writeFileSync(path, content, 'utf8');
}

describe('Task 15 — overrideTrust() boundary', () => {
  let sandbox;
  let projectRoot;
  let userDir;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'cmk-trust-test-'));
    projectRoot = join(sandbox, 'proj');
    userDir = join(sandbox, 'user-tier');
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  describe('happy path — fact file trust update (15.2)', () => {
    it('updates trust: field in the matched fact file YAML frontmatter', () => {
      const w = writeFact(validFactOpts({ projectRoot, trust: 'medium' }));
      const before = parseFrontmatter(w.path);
      expect(before.frontmatter.trust).toBe('medium');

      const r = overrideTrust({ id: w.id, level: 'high', projectRoot });
      expect(r.action).toBe('trust-updated');
      expect(r.id).toBe(w.id);
      expect(r.level).toBe('high');
      expect(r.updatedLocations.length).toBeGreaterThanOrEqual(1);

      const after = parseFrontmatter(w.path);
      expect(after.frontmatter.trust).toBe('high');
      // Other frontmatter unchanged
      expect(after.frontmatter.id).toBe(w.id);
      expect(after.frontmatter.title).toBe(before.frontmatter.title);
    });

    it('reports priorTrust in updatedLocations', () => {
      const w = writeFact(validFactOpts({ projectRoot, trust: 'medium' }));
      const r = overrideTrust({ id: w.id, level: 'high', projectRoot });
      const factLoc = r.updatedLocations.find((l) => l.type === 'fact');
      expect(factLoc).toBeDefined();
      expect(factLoc.priorTrust).toBe('medium');
      expect(factLoc.path).toBe(w.path);
    });

    it('all 3 trust levels (high/medium/low) accepted', () => {
      const w = writeFact(validFactOpts({ projectRoot, trust: 'medium' }));
      for (const level of ['high', 'low', 'medium']) {
        const r = overrideTrust({ id: w.id, level, projectRoot });
        expect(r.action).toBe('trust-updated');
        expect(parseFrontmatter(w.path).frontmatter.trust).toBe(level);
      }
    });
  });

  describe('happy path — scratchpad bullet trust update (15.2)', () => {
    it('updates trust: field in the matched HTML-comment provenance', () => {
      const w = writeFact(validFactOpts({ projectRoot }));
      const memoryMd = join(projectRoot, 'context', 'MEMORY.md');
      seedScratchpadWithBullet({
        path: memoryMd,
        id: w.id,
        text: 'a scratchpad bullet citing this fact id',
        trust: 'medium',
      });

      const r = overrideTrust({ id: w.id, level: 'high', projectRoot });
      expect(r.action).toBe('trust-updated');
      const scratchpadLoc = r.updatedLocations.find((l) => l.type === 'scratchpad');
      expect(scratchpadLoc).toBeDefined();
      expect(scratchpadLoc.path).toBe(memoryMd);
      expect(scratchpadLoc.priorTrust).toBe('medium');

      const after = readFileSync(memoryMd, 'utf8');
      expect(after).toMatch(/trust: high/);
      // Only the targeted comment was updated; the header `Cap: ...` line is
      // byte-preserved (no spurious trust mutations)
      expect(after).toMatch(/Cap: 2500 chars/);
    });

    it('updates ONLY the matched bullet trust when multiple bullets share a scratchpad', () => {
      // Two distinct facts → two distinct ids → two scratchpad bullets
      const wA = writeFact(validFactOpts({ projectRoot, slug: 'a', body: 'first unique fact text' }));
      const wB = writeFact(validFactOpts({ projectRoot, slug: 'b', body: 'second unique fact text' }));
      const memoryMd = join(projectRoot, 'context', 'MEMORY.md');
      mkdirSync(join(projectRoot, 'context'), { recursive: true });
      const content = [
        '<!-- Cap: 2500 chars · Last distilled: 2026-05-24 · Last health check: 2026-05-24 -->',
        '',
        '# Working Memory',
        '',
        '## Active Threads',
        '',
        `- (${wA.id}) bullet A`,
        `  <!-- source: x.md, source_line: 1, sha1: ${'a'.repeat(40)}, write: manual-edit, trust: medium, at: 2026-05-24T10:00:00Z -->`,
        '',
        `- (${wB.id}) bullet B`,
        `  <!-- source: x.md, source_line: 2, sha1: ${'b'.repeat(40)}, write: manual-edit, trust: medium, at: 2026-05-24T10:00:00Z -->`,
        '',
        '## Environment Notes',
        '',
        '## Pending Decisions',
        '',
      ].join('\n');
      writeFileSync(memoryMd, content, 'utf8');

      // Update trust ONLY on wA's id
      overrideTrust({ id: wA.id, level: 'high', projectRoot });

      const after = readFileSync(memoryMd, 'utf8');
      const lines = after.split('\n');
      // Find each bullet's comment line and verify trust value
      const aIdx = lines.findIndex((l) => l.includes(`(${wA.id})`));
      const bIdx = lines.findIndex((l) => l.includes(`(${wB.id})`));
      expect(lines[aIdx + 1]).toMatch(/trust: high/);
      expect(lines[bIdx + 1]).toMatch(/trust: medium/);
    });
  });

  describe('happy path — both fact file AND scratchpad bullet present', () => {
    it('updates BOTH locations when the same id appears in both', () => {
      const w = writeFact(validFactOpts({ projectRoot, trust: 'medium' }));
      const memoryMd = join(projectRoot, 'context', 'MEMORY.md');
      seedScratchpadWithBullet({
        path: memoryMd,
        id: w.id,
        text: 'a bullet referring to the fact',
        trust: 'medium',
      });

      const r = overrideTrust({ id: w.id, level: 'high', projectRoot });
      expect(r.action).toBe('trust-updated');
      expect(r.updatedLocations.length).toBe(2);
      expect(r.updatedLocations.some((l) => l.type === 'fact')).toBe(true);
      expect(r.updatedLocations.some((l) => l.type === 'scratchpad')).toBe(true);

      expect(parseFrontmatter(w.path).frontmatter.trust).toBe('high');
      expect(readFileSync(memoryMd, 'utf8')).toMatch(/trust: high/);
    });
  });

  describe('audit-log entry per spec schema (15.3)', () => {
    it('writes one audit-log entry per trust change with the documented fields', () => {
      const w = writeFact(validFactOpts({ projectRoot, trust: 'low' }));
      overrideTrust({ id: w.id, level: 'high', projectRoot, actor: 'user-explicit' });

      const auditPath = join(projectRoot, 'context', '.locks', 'audit.log');
      expect(existsSync(auditPath)).toBe(true);
      const lines = readFileSync(auditPath, 'utf8')
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l));
      const entry = lines.find(
        (e) => e.action === 'trust-changed' && e.id === w.id,
      );
      expect(entry).toBeDefined();
      // Canonical schema v1
      expect(entry.schema).toBe(1);
      expect(entry.tier).toBe('P');
      expect(entry.reasonCode).toBe('trust-change');
      // Spec 15.3 fields land in extra
      expect(entry.extra.actor).toBe('user-explicit');
      expect(entry.extra.newTrust).toBe('high');
      // priorTrust per-location (since both fact + scratchpad can update)
      expect(Array.isArray(entry.extra.priorTrust)).toBe(true);
    });

    it('default actor is "user-explicit" when not provided', () => {
      const w = writeFact(validFactOpts({ projectRoot }));
      overrideTrust({ id: w.id, level: 'low', projectRoot });
      const auditPath = join(projectRoot, 'context', '.locks', 'audit.log');
      const lines = readFileSync(auditPath, 'utf8')
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l));
      const entry = lines.find((e) => e.action === 'trust-changed');
      expect(entry.extra.actor).toBe('user-explicit');
    });

    it('writes NO audit-log entry on not-found (no spurious log noise)', () => {
      const r = overrideTrust({ id: 'P-MSSNGGG2', projectRoot, level: 'high' });
      expect(r.action).toBe('not-found');
      const auditPath = join(projectRoot, 'context', '.locks', 'audit.log');
      // Either the file doesn't exist or has no trust-changed entries
      if (existsSync(auditPath)) {
        const text = readFileSync(auditPath, 'utf8');
        expect(text).not.toMatch(/trust-changed/);
      }
    });
  });

  describe('error and not-found cases', () => {
    it('cmk trust <nonexistent_id> returns action: "not-found"', () => {
      // Valid-format id (all chars in the kit's base32 alphabet) that
      // doesn't resolve to any fact or scratchpad bullet.
      const r = overrideTrust({ id: 'P-NPHFRNM2', projectRoot, level: 'high' });
      expect(r.action).toBe('not-found');
      expect(r.errors.join(' ')).toMatch(/not found|no matching/i);
    });

    it('cmk trust <id> bogus_level returns schema error', () => {
      const w = writeFact(validFactOpts({ projectRoot }));
      const r = overrideTrust({ id: w.id, projectRoot, level: 'bogus' });
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
      expect(r.errors.join(' ')).toMatch(/level|high|medium|low/i);
    });

    it('malformed id (chars outside the kit alphabet) returns schema error', () => {
      const r = overrideTrust({ id: 'P-MISSING2', projectRoot, level: 'high' });
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
      expect(r.errors.join(' ')).toMatch(/id|citation/i);
    });

    it('missing id returns schema error', () => {
      const r = overrideTrust({ projectRoot, level: 'high' });
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
    });

    it('missing level returns schema error', () => {
      const w = writeFact(validFactOpts({ projectRoot }));
      const r = overrideTrust({ id: w.id, projectRoot });
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
    });
  });

  describe('tier resolution from id prefix', () => {
    it('tier-L fact-file trust update via L- id prefix', () => {
      const w = writeFact(validFactOpts({ projectRoot, tier: 'L', trust: 'low' }));
      const r = overrideTrust({ id: w.id, projectRoot, level: 'high' });
      expect(r.action).toBe('trust-updated');
      expect(r.tier).toBe('L');
      expect(parseFrontmatter(w.path).frontmatter.trust).toBe('high');
    });

    it('tier-U fact-file trust update via U- id prefix', () => {
      const w = writeFact(validFactOpts({ tier: 'U', userDir, trust: 'medium' }));
      const r = overrideTrust({ id: w.id, userDir, level: 'low' });
      expect(r.action).toBe('trust-updated');
      expect(r.tier).toBe('U');
      expect(parseFrontmatter(w.path).frontmatter.trust).toBe('low');
    });
  });
});
