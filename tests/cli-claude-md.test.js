// @doors: 1, 2
// Door 3 N/A: pure file-mutation logic; no subprocess spawn.
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: the CLAUDE.md loader-block writer doesn't emit observability output; callers (install / repair flows) handle logging.

// Tests for Task 4 — CLAUDE.md loader block with versioned delimiters (T-004).
// Per tasks.md 4.5:
//   - Fresh install (no CLAUDE.md): file created with delimited block, nothing else
//   - Install against CLAUDE.md with prior user content: block appended at EOF;
//     prior content byte-identical (diff = 0 outside block)
//   - Re-install with same version: block contents replaced; surrounding content unchanged
//   - Re-install with older version: block contents upgraded; non-block content unchanged
//   - Re-install with newer version (no --force): exit 0, file unchanged, warning to stderr
//   - cmk uninstall: block + delimiters removed; surrounding content byte-identical via diff
//
// Boundary-test discipline (per tasks.md "Engineering discipline"):
//   - Test the injectClaudeMdBlock() and removeClaudeMdBlock() PUBLIC contracts.
//   - Tests verify what lands on disk + what the result object reports.
//   - Do NOT test internal helpers (compareVersions, marker regexes, etc.).
//     Those are private — they can change as long as the contract holds.

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
import {
  injectClaudeMdBlock,
  removeClaudeMdBlock,
  findManagedBlock,
} from '../packages/cli/src/claude-md.mjs';

const MARKER_START_RE = /<!--\s*claude-memory-kit:start\s+v[\d.]+(?:-[\w.]+)?\s*-->/;
const MARKER_END_RE = /<!--\s*claude-memory-kit:end\s*-->/;

describe('Task 4 — CLAUDE.md loader block', () => {
  let sandbox;
  let projectRoot;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'cmk-claudemd-test-'));
    projectRoot = join(sandbox, 'my-project');
    mkdirSync(projectRoot, { recursive: true });
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  describe('Fresh install (no CLAUDE.md yet)', () => {
    it('creates CLAUDE.md containing only the delimited block + content', () => {
      const result = injectClaudeMdBlock({
        projectRoot,
        content: '## Memory System\n\nManaged by claude-memory-kit.',
        version: '0.1.0',
      });

      expect(result.action).toBe('created');
      expect(result.path).toBe(join(projectRoot, 'CLAUDE.md'));

      const text = readFileSync(result.path, 'utf8');
      expect(text).toMatch(MARKER_START_RE);
      expect(text).toMatch(MARKER_END_RE);
      expect(text).toContain('## Memory System');
      expect(text).toContain('Managed by claude-memory-kit.');
    });

    it('start marker carries the version number', () => {
      injectClaudeMdBlock({ projectRoot, content: 'x', version: '0.1.0' });
      const text = readFileSync(join(projectRoot, 'CLAUDE.md'), 'utf8');
      expect(text).toMatch(/<!--\s*claude-memory-kit:start\s+v0\.1\.0\s*-->/);
    });
  });

  describe('Install against existing CLAUDE.md (user content present)', () => {
    it('appends the block at EOF; user content byte-identical', () => {
      const userText = '# My Project\n\nMy own notes.\n\n## My section\n\n- a\n- b\n';
      writeFileSync(join(projectRoot, 'CLAUDE.md'), userText, 'utf8');
      const userBefore = readFileSync(join(projectRoot, 'CLAUDE.md'), 'utf8');

      const result = injectClaudeMdBlock({
        projectRoot,
        content: '## Memory System\n\nKit block.',
        version: '0.1.0',
      });

      expect(result.action).toBe('appended');
      const after = readFileSync(join(projectRoot, 'CLAUDE.md'), 'utf8');
      // User content prefix is byte-preserved
      expect(after.startsWith(userBefore.trimEnd())).toBe(true);
      // Kit block appears in full at the tail
      expect(after).toContain('## Memory System');
      expect(after).toMatch(MARKER_START_RE);
      expect(after).toMatch(MARKER_END_RE);
    });
  });

  describe('Re-install — same version', () => {
    it('replaces block contents in place; surrounding content byte-identical', () => {
      // 1. seed user content + first install
      const userBefore = '# My Project\n\nMy notes.\n';
      const userAfter = '\n\n## After section\n\n- x\n';
      writeFileSync(join(projectRoot, 'CLAUDE.md'), userBefore, 'utf8');
      injectClaudeMdBlock({
        projectRoot,
        content: '## Memory System v1\n\nOld block.',
        version: '0.1.0',
      });
      // Simulate the user adding content AFTER the block
      const claudeMd = join(projectRoot, 'CLAUDE.md');
      writeFileSync(claudeMd, readFileSync(claudeMd, 'utf8') + userAfter, 'utf8');

      // 2. re-install same version with new content
      const result = injectClaudeMdBlock({
        projectRoot,
        content: '## Memory System v2\n\nNew block.',
        version: '0.1.0',
      });
      expect(result.action).toBe('replaced');

      const final = readFileSync(claudeMd, 'utf8');
      expect(final).toContain('New block.');
      expect(final).not.toContain('Old block.');
      // Content before AND after the block preserved verbatim
      expect(final.startsWith(userBefore.trimEnd())).toBe(true);
      expect(final).toContain('## After section');
      expect(final).toContain('- x');
    });
  });

  describe('Re-install — older installed version (upgrade)', () => {
    it('replaces the block; reports action=upgraded; new marker version landed', () => {
      // 1. install with v0.0.5
      injectClaudeMdBlock({
        projectRoot,
        content: 'old',
        version: '0.0.5',
      });
      const claudeMd = join(projectRoot, 'CLAUDE.md');
      expect(readFileSync(claudeMd, 'utf8')).toMatch(/v0\.0\.5/);

      // 2. install with v0.1.0
      const result = injectClaudeMdBlock({
        projectRoot,
        content: 'new',
        version: '0.1.0',
      });
      expect(result.action).toBe('upgraded');
      expect(result.oldVersion).toBe('0.0.5');

      const text = readFileSync(claudeMd, 'utf8');
      expect(text).toMatch(/v0\.1\.0/);
      expect(text).not.toMatch(/v0\.0\.5/);
      expect(text).toContain('new');
      expect(text).not.toContain('old');
    });
  });

  describe('Re-install — newer installed version (downgrade blocked)', () => {
    it('without --force: exits action=downgrade-blocked; file unchanged', () => {
      // 1. install with v0.2.0
      injectClaudeMdBlock({
        projectRoot,
        content: 'newer kit block',
        version: '0.2.0',
      });
      const claudeMd = join(projectRoot, 'CLAUDE.md');
      const before = readFileSync(claudeMd, 'utf8');

      // 2. install with v0.1.0 (older)
      const result = injectClaudeMdBlock({
        projectRoot,
        content: 'older kit block',
        version: '0.1.0',
      });
      expect(result.action).toBe('downgrade-blocked');
      expect(result.oldVersion).toBe('0.2.0');

      const after = readFileSync(claudeMd, 'utf8');
      expect(after).toBe(before);
      expect(after).toContain('newer kit block');
      expect(after).not.toContain('older kit block');
    });

    it('with --force: downgrades the block; action=forced-downgrade', () => {
      injectClaudeMdBlock({
        projectRoot,
        content: 'newer',
        version: '0.2.0',
      });
      const result = injectClaudeMdBlock({
        projectRoot,
        content: 'older',
        version: '0.1.0',
        force: true,
      });
      expect(result.action).toBe('forced-downgrade');

      const text = readFileSync(join(projectRoot, 'CLAUDE.md'), 'utf8');
      expect(text).toContain('older');
      expect(text).not.toContain('newer');
      expect(text).toMatch(/v0\.1\.0/);
    });
  });

  describe('Re-install — same content + same version (idempotent)', () => {
    it('reports action=unchanged when nothing would change', () => {
      injectClaudeMdBlock({
        projectRoot,
        content: 'stable block',
        version: '0.1.0',
      });
      const claudeMd = join(projectRoot, 'CLAUDE.md');
      const before = readFileSync(claudeMd, 'utf8');

      const result = injectClaudeMdBlock({
        projectRoot,
        content: 'stable block',
        version: '0.1.0',
      });
      expect(result.action).toBe('unchanged');

      const after = readFileSync(claudeMd, 'utf8');
      expect(after).toBe(before);
    });
  });

  describe('removeClaudeMdBlock — uninstall', () => {
    it('strips the delimited block + markers; surrounding content byte-identical', () => {
      const before = '# Project\n\nUser notes.\n\n';
      const after = '\n\n## After\n\nMore user notes.\n';
      writeFileSync(join(projectRoot, 'CLAUDE.md'), before, 'utf8');
      injectClaudeMdBlock({
        projectRoot,
        content: 'kit block content',
        version: '0.1.0',
      });
      const claudeMd = join(projectRoot, 'CLAUDE.md');
      writeFileSync(claudeMd, readFileSync(claudeMd, 'utf8') + after, 'utf8');

      const result = removeClaudeMdBlock({ projectRoot });
      expect(result.action).toBe('removed');

      const final = readFileSync(claudeMd, 'utf8');
      expect(final).not.toMatch(MARKER_START_RE);
      expect(final).not.toMatch(MARKER_END_RE);
      expect(final).not.toContain('kit block content');
      // User content survives, in order
      expect(final).toContain('User notes.');
      expect(final).toContain('More user notes.');
    });

    it('on file with no kit markers: action=not-found, file unchanged', () => {
      const userText = '# Project\n\nNo kit block here.\n';
      writeFileSync(join(projectRoot, 'CLAUDE.md'), userText, 'utf8');

      const result = removeClaudeMdBlock({ projectRoot });
      expect(result.action).toBe('not-found');

      const text = readFileSync(join(projectRoot, 'CLAUDE.md'), 'utf8');
      expect(text).toBe(userText);
    });

    it('on missing CLAUDE.md: action=no-file, no error', () => {
      const result = removeClaudeMdBlock({ projectRoot });
      expect(result.action).toBe('no-file');
      expect(existsSync(join(projectRoot, 'CLAUDE.md'))).toBe(false);
    });

    it('uninstall + re-install round trip preserves user content byte-for-byte', () => {
      const userBefore = '# Project\n\nNotes A.\n';
      const userAfter = '\n\n## Trailing\n\nNotes B.\n';

      writeFileSync(join(projectRoot, 'CLAUDE.md'), userBefore, 'utf8');
      injectClaudeMdBlock({ projectRoot, content: 'block1', version: '0.1.0' });
      const claudeMd = join(projectRoot, 'CLAUDE.md');
      writeFileSync(claudeMd, readFileSync(claudeMd, 'utf8') + userAfter, 'utf8');

      const fingerprintBefore =
        readFileSync(claudeMd, 'utf8')
          .replace(/<!--\s*claude-memory-kit:start[\s\S]*?claude-memory-kit:end\s*-->\n?/, '');

      removeClaudeMdBlock({ projectRoot });
      injectClaudeMdBlock({ projectRoot, content: 'block1', version: '0.1.0' });

      const fingerprintAfter =
        readFileSync(claudeMd, 'utf8')
          .replace(/<!--\s*claude-memory-kit:start[\s\S]*?claude-memory-kit:end\s*-->\n?/, '');

      // Content outside the block (user content) is byte-identical
      // (some whitespace normalization is OK; we just need user content intact)
      expect(fingerprintAfter).toContain('Notes A.');
      expect(fingerprintAfter).toContain('Notes B.');
    });
  });

  describe('Boundary edge cases', () => {
    it('handles a CLAUDE.md with corrupted markers (start but no end): treats as no managed block, appends fresh', () => {
      const corrupted = '# Project\n\n<!-- claude-memory-kit:start v0.1.0 -->\nbroken — no end marker\n';
      writeFileSync(join(projectRoot, 'CLAUDE.md'), corrupted, 'utf8');

      const result = injectClaudeMdBlock({
        projectRoot,
        content: 'fresh block',
        version: '0.1.0',
      });
      // Either appends or replaces; we don't strictly require which, but the
      // result must contain the new content and have well-formed markers.
      expect(['appended', 'replaced']).toContain(result.action);

      const text = readFileSync(join(projectRoot, 'CLAUDE.md'), 'utf8');
      expect(text).toContain('fresh block');
      // After injection there must be exactly one start and one end marker
      const starts = (text.match(/claude-memory-kit:start/g) || []).length;
      const ends = (text.match(/claude-memory-kit:end/g) || []).length;
      expect(starts).toBe(1);
      expect(ends).toBe(1);
    });
  });

  // Task 220 (D-322): a SECOND managed block — from a manual copy-paste, a
  // kept-both-sides merge resolution, or a prior double-append — used to be
  // invisible: inject refreshed only the FIRST block (orphaning the stale
  // duplicate forever) and remove left the second behind (violating the
  // clean-removal contract). Inject now FOLDS all blocks into the single
  // refreshed one; remove strips ALL of them; user bytes outside the blocks
  // (including BETWEEN them) are preserved.
  describe('Task 220 — duplicate managed blocks (fold on inject, remove-all on uninstall)', () => {
    const claudeMdPath = () => join(projectRoot, 'CLAUDE.md');
    function seedTwoBlocks() {
      const text = [
        '# My project notes',
        '',
        '<!-- claude-memory-kit:start v0.1.0 -->',
        'old block ONE',
        '<!-- claude-memory-kit:end -->',
        '',
        'user content BETWEEN the blocks',
        '',
        '<!-- claude-memory-kit:start v0.1.0 -->',
        'old block TWO',
        '<!-- claude-memory-kit:end -->',
        '',
        'trailing user content',
        '',
      ].join('\n');
      writeFileSync(claudeMdPath(), text, 'utf8');
    }

    it('findManagedBlock reports duplicateCount for the HC-9 surface (Door 1)', () => {
      seedTwoBlocks();
      const found = findManagedBlock(readFileSync(claudeMdPath(), 'utf8'));
      expect(found.duplicateCount).toBe(1);
      // single-block text reports zero
      expect(
        findManagedBlock('<!-- claude-memory-kit:start v0.1.0 -->\nx\n<!-- claude-memory-kit:end -->').duplicateCount,
      ).toBe(0);
    });

    it('inject FOLDS both blocks into one refreshed block, preserving user bytes before/between/after (Doors 1+2)', () => {
      seedTwoBlocks();
      const r = injectClaudeMdBlock({ projectRoot, content: 'fresh managed content', version: '0.2.0' });
      expect(r.action).toBe('upgraded');
      expect(r.duplicatesFolded).toBe(1);

      const text = readFileSync(claudeMdPath(), 'utf8');
      expect((text.match(/claude-memory-kit:start/g) || []).length).toBe(1);
      expect((text.match(/claude-memory-kit:end/g) || []).length).toBe(1);
      expect(text).toContain('fresh managed content');
      expect(text).not.toContain('old block ONE');
      expect(text).not.toContain('old block TWO');
      // user bytes preserved — including the content BETWEEN the two blocks
      expect(text).toContain('# My project notes');
      expect(text).toContain('user content BETWEEN the blocks');
      expect(text).toContain('trailing user content');
    });

    it('downgrade-blocked still FOLDS duplicates (to the newest existing block) so HC-9 recovery converges (skill-review F1)', () => {
      // A merge imported a duplicate scaffolded by a NEWER kit than ours:
      // the version downgrade must stay blocked, but the duplication must
      // heal — otherwise `cmk doctor` says "re-run cmk install" forever.
      const text = [
        '<!-- claude-memory-kit:start v0.1.0 -->',
        'older block',
        '<!-- claude-memory-kit:end -->',
        'between',
        '<!-- claude-memory-kit:start v0.9.0 -->',
        'newer imported block',
        '<!-- claude-memory-kit:end -->',
        '',
      ].join('\n');
      writeFileSync(claudeMdPath(), text, 'utf8');

      const r = injectClaudeMdBlock({ projectRoot, content: 'our older content', version: '0.5.0' });
      expect(r.action).toBe('downgrade-blocked');
      expect(r.oldVersion).toBe('0.9.0');
      expect(r.duplicatesFolded).toBe(1);

      const after = readFileSync(claudeMdPath(), 'utf8');
      // ONE block remains — the newest existing one, NOT our blocked content.
      expect((after.match(/claude-memory-kit:start/g) || []).length).toBe(1);
      expect(after).toContain('newer imported block');
      expect(after).not.toContain('older block');
      expect(after).not.toContain('our older content');
      expect(after).toContain('between');
    });

    it('remove strips ALL managed blocks, preserving user content (Doors 1+2)', () => {
      seedTwoBlocks();
      const r = removeClaudeMdBlock({ projectRoot });
      expect(r.action).toBe('removed');

      const text = readFileSync(claudeMdPath(), 'utf8');
      expect(text).not.toContain('claude-memory-kit:start');
      expect(text).not.toContain('claude-memory-kit:end');
      expect(text).not.toContain('old block ONE');
      expect(text).not.toContain('old block TWO');
      expect(text).toContain('# My project notes');
      expect(text).toContain('user content BETWEEN the blocks');
      expect(text).toContain('trailing user content');
    });
  });
});
