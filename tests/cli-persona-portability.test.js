// @doors: 1, 2, 4
// Door 3 N/A: export/import are in-process file ops; reindex runs in-process (no spawn).
// Door 5 N/A: no message-queue interaction.

// Tests for Task 72 — cmk persona export / import (user-tier portability).
//
// The persona (user tier) follows the HUMAN, not the repo: it's machine-local
// (~/.claude-memory-kit) and deliberately OUT of the project so it never leaks
// to teammates. Portability is therefore per-human — export the user tier to one
// OS-agnostic bundle, carry it to another machine, import it. Explicit, no
// merge (the deferred git-sync path handles auto-merge).
//
// Boundary-test discipline: assert the PUBLIC outcome — what the bundle contains,
// what lands on the target user tier, what's backed up, the audit trace. Do NOT
// test the internal walk/format helpers.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { exportPersona, importPersona } from '../packages/cli/src/persona-portability.mjs';
import { runPersonaExport, runPersonaImport } from '../packages/cli/src/subcommands.mjs';
import { readAuditLog } from '../packages/cli/src/audit-log.mjs';

// Seed a realistic user tier: the 3 persona scratchpads, a settings override, a
// fragments fact store (INDEX + one fact), plus RUNTIME dirs (.locks/, .index/)
// that must NEVER be bundled.
function seedUserTier(userDir) {
  mkdirSync(userDir, { recursive: true });
  writeFileSync(join(userDir, 'USER.md'), '# User Profile\n\n## About\n- (U-LMNPQRST) prefers terse answers\n', 'utf8');
  writeFileSync(join(userDir, 'HABITS.md'), '# Habits\n\n## Iteration Cadence\n- (U-VWXYZABC) tests first, always\n', 'utf8');
  writeFileSync(join(userDir, 'LESSONS.md'), '# Lessons\n\n## Tooling Lessons\n- (U-MNPQRSTU) uv over pip\n', 'utf8');
  writeFileSync(join(userDir, 'settings.json'), '{ "scratchpads": { "LESSONS.md": { "max_chars": 1800 } } }', 'utf8');
  mkdirSync(join(userDir, 'fragments'), { recursive: true });
  writeFileSync(join(userDir, 'fragments', 'INDEX.md'), '# Fragments index\n', 'utf8');
  writeFileSync(
    join(userDir, 'fragments', 'user_uv-over-pip.md'),
    '---\nid: U-NPQRSTUV\ntype: user\ntrust: high\n---\n\nAlways use uv, never pip.\n',
    'utf8',
  );
  // Runtime — must be excluded from the bundle.
  mkdirSync(join(userDir, '.locks'), { recursive: true });
  writeFileSync(join(userDir, '.locks', 'audit.log'), '{"ts":"2026-06-01T00:00:00Z","action":"appended"}\n', 'utf8');
  mkdirSync(join(userDir, '.index'), { recursive: true });
  writeFileSync(join(userDir, '.index', 'fts.db'), 'BINARYCACHE', 'utf8');
}

describe('Task 72 — cmk persona export / import', () => {
  let sandbox;
  let userDir;
  let bundlePath;

  beforeEach(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'cmk-persona-port-'));
    userDir = join(sandbox, 'user-tier');
    bundlePath = join(sandbox, 'persona.json');
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  describe('export', () => {
    it('bundles the persona files and EXCLUDES runtime dirs (Door 1 + 2)', () => {
      seedUserTier(userDir);
      const r = exportPersona({ userDir, outFile: bundlePath, now: '2026-06-05T00:00:00Z' });

      // Door 1: return shape.
      expect(r.action).toBe('exported');
      expect(r.path).toBe(bundlePath);
      expect(r.fileCount).toBeGreaterThan(0);

      // Door 2: the bundle on disk.
      const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
      expect(bundle.kind).toBe('cmk-persona-bundle');
      expect(bundle.version).toBe(1);
      // Persona content is in...
      expect(bundle.files['USER.md']).toContain('prefers terse answers');
      expect(bundle.files['HABITS.md']).toContain('tests first');
      expect(bundle.files['LESSONS.md']).toContain('uv over pip');
      expect(bundle.files['settings.json']).toContain('max_chars');
      expect(bundle.files['fragments/INDEX.md']).toBeDefined();
      expect(bundle.files['fragments/user_uv-over-pip.md']).toContain('Always use uv');
      // ...runtime dirs are NOT.
      const keys = Object.keys(bundle.files);
      expect(keys.some((k) => k.startsWith('.locks'))).toBe(false);
      expect(keys.some((k) => k.startsWith('.index'))).toBe(false);
    });

    it('errors when the user tier does not exist', () => {
      const r = exportPersona({ userDir: join(sandbox, 'nope'), outFile: bundlePath });
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('not-found');
    });

    it('errors when no output file is given', () => {
      seedUserTier(userDir);
      const r = exportPersona({ userDir, outFile: undefined });
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
    });
  });

  describe('import', () => {
    it('round-trips: export from A, import to a FRESH machine B → B has the persona (Door 1 + 2 + 4)', () => {
      seedUserTier(userDir);
      exportPersona({ userDir, outFile: bundlePath, now: '2026-06-05T00:00:00Z' });

      const machineB = join(sandbox, 'machine-b');
      const r = importPersona({ userDir: machineB, inFile: bundlePath, now: '2026-06-05T01:00:00Z' });

      // Door 1.
      expect(r.action).toBe('imported');
      expect(r.fileCount).toBeGreaterThan(0);
      expect(r.backedUp).toBe(0); // fresh machine, nothing overwritten
      expect(r.reindexed).toBe(true);

      // Door 2: the persona landed on B, byte-identical.
      expect(readFileSync(join(machineB, 'USER.md'), 'utf8')).toBe(readFileSync(join(userDir, 'USER.md'), 'utf8'));
      expect(readFileSync(join(machineB, 'HABITS.md'), 'utf8')).toContain('tests first');
      expect(readFileSync(join(machineB, 'fragments', 'user_uv-over-pip.md'), 'utf8')).toContain('Always use uv');

      // Door 4: an operational audit entry on B.
      const audit = readAuditLog(machineB);
      const ev = audit.find((e) => e.action === 'persona-imported');
      expect(ev).toBeDefined();
      expect(ev.tier).toBe('U');
      expect(ev.extra.fileCount).toBe(r.fileCount);
    });

    it('backs up existing files before overwriting (no data loss) + leaves non-persona files untouched (over-mutation)', () => {
      // Machine B already has its OWN persona + an unrelated local file.
      const machineB = join(sandbox, 'machine-b');
      mkdirSync(machineB, { recursive: true });
      writeFileSync(join(machineB, 'USER.md'), '# B local profile\n- (U-RSTUVWXY) B-only preference\n', 'utf8');
      writeFileSync(join(machineB, 'unrelated.txt'), 'do not touch me', 'utf8');

      seedUserTier(userDir);
      exportPersona({ userDir, outFile: bundlePath, now: '2026-06-05T00:00:00Z' });
      const r = importPersona({ userDir: machineB, inFile: bundlePath, now: '2026-06-05T01:00:00Z' });

      expect(r.backedUp).toBeGreaterThan(0);
      expect(r.backupPath).toBeTruthy();
      // The imported USER.md replaced B's...
      expect(readFileSync(join(machineB, 'USER.md'), 'utf8')).toContain('prefers terse answers');
      // ...but B's original is recoverable in the backup...
      expect(readFileSync(join(r.backupPath, 'USER.md'), 'utf8')).toContain('B-only preference');
      // ...and an unrelated local file is untouched (over-mutation guard).
      expect(readFileSync(join(machineB, 'unrelated.txt'), 'utf8')).toBe('do not touch me');
    });

    it('the backup dir is itself never re-exported (excluded from the next bundle)', () => {
      // Import over an existing tier (creates .import-backups), then export it.
      const machineB = join(sandbox, 'machine-b');
      seedUserTier(machineB); // B has content → import will back it up
      seedUserTier(userDir);
      exportPersona({ userDir, outFile: bundlePath, now: '2026-06-05T00:00:00Z' });
      importPersona({ userDir: machineB, inFile: bundlePath, now: '2026-06-05T01:00:00Z' });

      const reExport = join(sandbox, 'reexport.json');
      exportPersona({ userDir: machineB, outFile: reExport, now: '2026-06-05T02:00:00Z' });
      const keys = Object.keys(JSON.parse(readFileSync(reExport, 'utf8')).files);
      expect(keys.some((k) => k.includes('.import-backups'))).toBe(false);
    });

    it('rolls back fully on a mid-import write failure (no half-applied persona)', () => {
      // Target already has a real USER.md. The bundle writes a NEW USER.md, then
      // a file `aaa`, then `aaa/nested.md` — writing the nested file must mkdir
      // `aaa`, which already exists as a FILE → EEXIST (on POSIX AND Windows),
      // failing the import AFTER USER.md was backed up + overwritten. The rollback
      // must restore the original USER.md and remove the partial `aaa`.
      const machineB = join(sandbox, 'machine-b');
      mkdirSync(machineB, { recursive: true });
      writeFileSync(join(machineB, 'USER.md'), 'ORIGINAL B profile\n', 'utf8');
      // Hand-built bundle with the failure-triggering key order.
      writeFileSync(
        bundlePath,
        JSON.stringify({
          kind: 'cmk-persona-bundle',
          version: 1,
          files: { 'USER.md': 'NEW imported profile\n', aaa: 'x', 'aaa/nested.md': 'y' },
        }),
        'utf8',
      );

      const r = importPersona({ userDir: machineB, inFile: bundlePath, now: '2026-06-05T03:00:00Z' });

      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('io');
      // Rolled back: the original USER.md is restored (NOT the new content)...
      expect(readFileSync(join(machineB, 'USER.md'), 'utf8')).toBe('ORIGINAL B profile\n');
      // ...and the partially-created `aaa` file is gone.
      expect(existsSync(join(machineB, 'aaa'))).toBe(false);
    });

    it('rejects a bundle that is not a cmk persona bundle', () => {
      writeFileSync(bundlePath, JSON.stringify({ kind: 'something-else', files: {} }), 'utf8');
      const r = importPersona({ userDir, inFile: bundlePath });
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
    });

    it('rejects an unsupported bundle version', () => {
      writeFileSync(bundlePath, JSON.stringify({ kind: 'cmk-persona-bundle', version: 999, files: {} }), 'utf8');
      const r = importPersona({ userDir, inFile: bundlePath });
      expect(r.action).toBe('error');
      expect(r.errorCategory).toBe('schema');
    });

    it('rejects non-JSON / missing bundle', () => {
      writeFileSync(bundlePath, 'not json at all', 'utf8');
      expect(importPersona({ userDir, inFile: bundlePath }).action).toBe('error');
      expect(importPersona({ userDir, inFile: join(sandbox, 'absent.json') }).action).toBe('error');
    });
  });

  // The CLI glue (`cmk persona export/import` action handlers) — run in-process
  // against an ISOLATED user tier via MEMORY_KIT_USER_DIR (never the real one).
  describe('CLI glue — runPersonaExport / runPersonaImport', () => {
    let logSpy;
    let errSpy;
    let prevUserDir;
    let prevExitCode;

    beforeEach(() => {
      logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      prevUserDir = process.env.MEMORY_KIT_USER_DIR;
      prevExitCode = process.exitCode;
      process.env.MEMORY_KIT_USER_DIR = userDir; // isolate to the test sandbox
      process.exitCode = 0;
    });

    afterEach(() => {
      logSpy.mockRestore();
      errSpy.mockRestore();
      if (prevUserDir === undefined) delete process.env.MEMORY_KIT_USER_DIR;
      else process.env.MEMORY_KIT_USER_DIR = prevUserDir;
      process.exitCode = prevExitCode;
    });

    it('export with no file → exits 2 with a usage error', () => {
      runPersonaExport(undefined);
      expect(process.exitCode).toBe(2);
      expect(errSpy).toHaveBeenCalled();
    });

    it('export then import round-trips through the CLI handlers', () => {
      seedUserTier(userDir);
      runPersonaExport(bundlePath);
      expect(process.exitCode).toBe(0);
      expect(existsSync(bundlePath)).toBe(true);
      expect(logSpy.mock.calls.flat().join(' ')).toContain('cmk persona export');

      // Import into a different isolated tier.
      const machineB = join(sandbox, 'cli-machine-b');
      process.env.MEMORY_KIT_USER_DIR = machineB;
      runPersonaImport(bundlePath);
      expect(process.exitCode).toBe(0);
      expect(existsSync(join(machineB, 'USER.md'))).toBe(true);
      expect(logSpy.mock.calls.flat().join(' ')).toContain('cmk persona import');
    });

    it('import with no file → exits 2', () => {
      runPersonaImport(undefined);
      expect(process.exitCode).toBe(2);
      expect(errSpy).toHaveBeenCalled();
    });

    it('import of a bad bundle → exits 2 with the error', () => {
      writeFileSync(bundlePath, 'not a bundle', 'utf8');
      runPersonaImport(bundlePath);
      expect(process.exitCode).toBe(2);
      expect(errSpy).toHaveBeenCalled();
    });
  });
});
