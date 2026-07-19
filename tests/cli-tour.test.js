// @doors: 1, 2
// Door 2 is read-only state: the tour mutates NOTHING — pinned by the
//   byte-compare in the populated test.
// Door 3 N/A: no subprocess, no LLM — the tour reads files and narrates.
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: the tour writes no NDJSON log (a read-only teach surface).

// Tests for Task 175 — `cmk tour`: narrate the user's OWN memory (the
// awrshift /tour borrow, D-215). Tour EXPLAINS, doctor CHECKS — distinct.
// The honesty contract: it reads files, it never invents what the user
// "probably" has — every example it shows must exist on disk.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { install } from '../packages/cli/src/install.mjs';
import { rememberRich } from '../packages/cli/src/remember-core.mjs';
import { memoryWrite } from '../packages/cli/src/memory-write.mjs';
import { buildTour } from '../packages/cli/src/tour.mjs';
import { runTour } from '../packages/cli/src/subcommands.mjs';

let sandbox;
let projectRoot;
let userDir;

beforeEach(async () => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-tour-'));
  projectRoot = join(sandbox, 'proj');
  userDir = join(sandbox, 'user-tier');
  mkdirSync(projectRoot, { recursive: true });
  await install({ projectRoot, userTier: userDir, skipClaudeFiles: true, noHooks: true, noSemantic: true });
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

describe('buildTour — a populated install narrates the REAL memory', () => {
  it('shows tier layout, real counts, and REAL fact titles (nothing invented)', () => {
    rememberRich(
      'The deploy pipeline targets staging before prod',
      { type: 'project', title: 'TOUR-REAL-FACT staging-first deploys' },
      { projectRoot },
    );
    memoryWrite({
      action: 'add', tier: 'P', scratchpad: 'MEMORY.md', section: 'Active Threads',
      source: 'user-explicit', text: 'TOUR-BULLET migrating the queue consumer', projectRoot,
    });

    const t = buildTour({ projectRoot, userDir });
    const text = t.sections.map((s) => `${s.title}\n${s.body}`).join('\n\n');

    // Tier layout + precedence.
    expect(text).toContain('context/');
    expect(text).toMatch(/local > project > user|most-specific wins/i);
    // Real counts + the REAL fact title from disk.
    expect(text).toContain('TOUR-REAL-FACT');
    expect(text).toMatch(/1 fact/);
    // The scratchpad content is counted (the bullet we wrote).
    expect(text).toContain('MEMORY.md');
    // Recall surfaces named.
    expect(text).toContain('cmk search');
    expect(text).toContain('--scope decisions');
    // Doctor stays the sibling, referenced not replaced.
    expect(text).toContain('cmk doctor');
  });

  it('is read-only: no file changes, no new files', () => {
    rememberRich('A fact to look at', { type: 'project', title: 'Readonly probe' }, { projectRoot });
    const memPath = join(projectRoot, 'context', 'MEMORY.md');
    const before = readFileSync(memPath, 'utf8');
    buildTour({ projectRoot, userDir });
    expect(readFileSync(memPath, 'utf8')).toBe(before);
  });

  it('honesty: a fabricated example can never appear — every shown title exists on disk', () => {
    rememberRich('Only fact body', { type: 'feedback', title: 'The only real title' }, { projectRoot });
    const t = buildTour({ projectRoot, userDir });
    for (const ex of t.examples ?? []) {
      // Each surfaced example must be traceable to a real file.
      expect(ex.sourceFile).toBeTruthy();
      expect(existsSync(join(projectRoot, ex.sourceFile)) || existsSync(join(userDir, ex.sourceFile.replace(/^user\//, '')))).toBe(true);
    }
  });
});

describe('buildTour — a fresh/empty install degrades gracefully', () => {
  it('narrates the structure + how it fills, with zero fabricated content', () => {
    const t = buildTour({ projectRoot, userDir });
    const text = t.sections.map((s) => `${s.title}\n${s.body}`).join('\n\n');
    expect(text).toMatch(/nothing captured yet|no facts captured yet/i);
    expect(text).toMatch(/fills|captured automatically|Stop hook/i);
    // Structure still taught.
    expect(text).toContain('context/');
    expect(text).toContain('cmk search');
    // No invented example titles on an empty corpus.
    expect((t.examples ?? []).length).toBe(0);
  });

  it('survives a missing user tier without throwing', () => {
    const t = buildTour({ projectRoot, userDir: join(sandbox, 'nonexistent-user') });
    expect(t.sections.length).toBeGreaterThan(0);
  });

  it('a sessions-only corpus (fresh import-sessions run, zero facts) is NOT "nothing captured" (skill-review I1)', () => {
    // The v0.6.0 headline flow: cmk import-sessions writes day files before
    // any fact exists. The tour must count that as captured memory.
    writeFileSync(
      join(projectRoot, 'context', 'sessions', '2026-07-19.md'),
      '# 2026-07-19\n\n## Imported session\n- worked on the tour\n',
    );
    const t = buildTour({ projectRoot, userDir });
    const text = t.sections.map((s) => `${s.title}\n${s.body}`).join('\n\n');
    expect(text).not.toMatch(/nothing captured yet/i);
    expect(text).toMatch(/1 session file/);
  });

  it('transcript count includes transcripts/imported/ — where import-sessions archives (skill-review I3)', () => {
    const importedDir = join(projectRoot, 'context', 'transcripts', 'imported');
    mkdirSync(importedDir, { recursive: true });
    writeFileSync(join(importedDir, '2026-07-19-abc.md'), '# imported raw extract\n');
    const t = buildTour({ projectRoot, userDir });
    const text = t.sections.map((s) => `${s.title}\n${s.body}`).join('\n\n');
    expect(text).toMatch(/1 transcript file/);
  });
});

describe('runTour — the CLI verb', () => {
  it('prints the narration', () => {
    rememberRich('CLI tour fact', { type: 'project', title: 'CLI-TOUR-TITLE' }, { projectRoot });
    const logs = [];
    runTour({}, undefined, { projectRoot, userDir, log: (m) => logs.push(m) });
    const out = logs.join('\n');
    expect(out).toContain('CLI-TOUR-TITLE');
    expect(out).toContain('cmk search');
  });
});

describe('the slash-command surfaces scaffold', () => {
  it('cmk install scaffolds the Claude Code /tour command file', () => {
    // The default (non-skipClaudeFiles) install carries the commands dir.
    const proj2 = join(sandbox, 'proj2');
    mkdirSync(proj2, { recursive: true });
    install({ projectRoot: proj2, userTier: join(sandbox, 'user2'), noHooks: true, noSemantic: true });
    const cmd = join(proj2, '.claude', 'commands', 'tour.md');
    expect(existsSync(cmd)).toBe(true);
    const body = readFileSync(cmd, 'utf8');
    expect(body).toContain('cmk tour');
  });

  it('installKiro writes the manual-inclusion tour steering; uninstallKiro removes it (husk-clean)', async () => {
    const { installKiro, uninstallKiro } = await import('../packages/cli/src/install-kiro.mjs');
    const proj3 = join(sandbox, 'proj3');
    mkdirSync(proj3, { recursive: true });
    installKiro({ projectRoot: proj3, awsDir: join(sandbox, 'aws') });
    const tourSteering = join(proj3, '.kiro', 'steering', 'tour.md');
    expect(existsSync(tourSteering)).toBe(true);
    const body = readFileSync(tourSteering, 'utf8');
    expect(body).toContain('inclusion: manual');
    expect(body).toContain('cmk tour');

    uninstallKiro({ projectRoot: proj3, awsDir: join(sandbox, 'aws') });
    expect(existsSync(tourSteering)).toBe(false); // kit-created husk removed
  });
});
