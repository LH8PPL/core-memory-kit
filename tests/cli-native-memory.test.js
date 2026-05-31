// @doors: 1, 2
// Door 3 N/A: no subprocess at this boundary.
// Door 4 N/A: a settings.json CONFIG write is not audit-logged (same as
//   writeKitHooks for the hooks block) — the file itself is the record;
//   the doctor HC-8 surfaces the state (covered in cli-doctor.test.js).
// Door 5 N/A: no message queue.
//
// Tests for Task 60 — native Anthropic Auto Memory coexistence (ADR-0011).
// `cmk disable-native-memory` / `enable-native-memory` write
// `autoMemoryEnabled` into the project's committable .claude/settings.json
// (Option A as a one-command opt-in; default stays coexist).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  setNativeAutoMemory,
  getNativeAutoMemoryState,
  nativeMemoryInstallNote,
} from '../packages/cli/src/native-memory.mjs';
import { runSetNativeMemory } from '../packages/cli/src/subcommands.mjs';

describe('Task 60 — native auto-memory coexistence', () => {
  let root, projectRoot, settingsPath;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cmk-native-mem-'));
    projectRoot = join(root, 'proj');
    mkdirSync(projectRoot, { recursive: true });
    settingsPath = join(projectRoot, '.claude', 'settings.json');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('disable writes autoMemoryEnabled:false to the project .claude/settings.json (creating it)', () => {
    const r = setNativeAutoMemory({ projectRoot, enabled: false });
    expect(r.action).toBe('written');
    expect(r.enabled).toBe(false);
    expect(existsSync(settingsPath)).toBe(true);
    expect(JSON.parse(readFileSync(settingsPath, 'utf8')).autoMemoryEnabled).toBe(false);
  });

  it('enable writes autoMemoryEnabled:true', () => {
    setNativeAutoMemory({ projectRoot, enabled: false });
    const r = setNativeAutoMemory({ projectRoot, enabled: true });
    expect(r.action).toBe('written');
    expect(JSON.parse(readFileSync(settingsPath, 'utf8')).autoMemoryEnabled).toBe(true);
  });

  it('is idempotent — a second identical write reports unchanged + leaves the file byte-identical', () => {
    setNativeAutoMemory({ projectRoot, enabled: false });
    const after1 = readFileSync(settingsPath, 'utf8');
    const r = setNativeAutoMemory({ projectRoot, enabled: false });
    expect(r.action).toBe('unchanged');
    expect(readFileSync(settingsPath, 'utf8')).toBe(after1);
  });

  it('preserves sibling settings — over-mutation guard', () => {
    mkdirSync(join(projectRoot, '.claude'), { recursive: true });
    writeFileSync(
      settingsPath,
      JSON.stringify({ hooks: { Stop: [{ keep: 1 }] }, model: 'opus' }, null, 2),
      'utf8',
    );
    setNativeAutoMemory({ projectRoot, enabled: false });
    const s = JSON.parse(readFileSync(settingsPath, 'utf8'));
    expect(s.autoMemoryEnabled).toBe(false);
    expect(s.hooks).toEqual({ Stop: [{ keep: 1 }] }); // untouched
    expect(s.model).toBe('opus');
  });

  it('errors WITHOUT clobbering an unparseable existing settings.json', () => {
    mkdirSync(join(projectRoot, '.claude'), { recursive: true });
    writeFileSync(settingsPath, '{ not valid json', 'utf8');
    const r = setNativeAutoMemory({ projectRoot, enabled: false });
    expect(r.action).toBe('error');
    expect(readFileSync(settingsPath, 'utf8')).toBe('{ not valid json'); // preserved
  });

  it('getNativeAutoMemoryState reports default / disabled / enabled', () => {
    // No settings file → Anthropic's default (ON).
    expect(getNativeAutoMemoryState({ projectRoot }).state).toBe('default');
    setNativeAutoMemory({ projectRoot, enabled: false });
    expect(getNativeAutoMemoryState({ projectRoot }).state).toBe('disabled');
    setNativeAutoMemory({ projectRoot, enabled: true });
    expect(getNativeAutoMemoryState({ projectRoot }).state).toBe('enabled');
  });

  describe('cmk disable-/enable-native-memory CLI (runSetNativeMemory)', () => {
    it('disable writes the setting + reports it; enable reverses', () => {
      const out = [];
      const log = (m) => out.push(m);
      const r1 = runSetNativeMemory(false, { projectRoot, log, logError: log });
      expect(r1.action).toBe('written');
      expect(JSON.parse(readFileSync(settingsPath, 'utf8')).autoMemoryEnabled).toBe(false);
      expect(out.join('\n')).toMatch(/disabled for this project/i);

      out.length = 0;
      const r2 = runSetNativeMemory(true, { projectRoot, log, logError: log });
      expect(r2.action).toBe('written');
      expect(JSON.parse(readFileSync(settingsPath, 'utf8')).autoMemoryEnabled).toBe(true);
      expect(out.join('\n')).toMatch(/re-enabled/i);
    });

    it('reports "already" on an idempotent re-run', () => {
      runSetNativeMemory(false, { projectRoot, log: () => {}, logError: () => {} });
      const out = [];
      runSetNativeMemory(false, { projectRoot, log: (m) => out.push(m), logError: (m) => out.push(m) });
      expect(out.join('\n')).toMatch(/already disabled/i);
    });

    it('reports an error (logError) without clobbering a broken settings.json', () => {
      mkdirSync(join(projectRoot, '.claude'), { recursive: true });
      writeFileSync(settingsPath, '{ broken', 'utf8');
      const out = [];
      const r = runSetNativeMemory(false, { projectRoot, log: () => {}, logError: (m) => out.push(m) });
      expect(r.action).toBe('error');
      expect(out.join('\n')).toMatch(/cmk disable-native-memory:/);
      expect(readFileSync(settingsPath, 'utf8')).toBe('{ broken');
    });
  });

  describe('install heads-up (nativeMemoryInstallNote — 60.2)', () => {
    it('returns the coexistence note when native is not opted out (default)', () => {
      const note = nativeMemoryInstallNote(projectRoot);
      expect(note).toBeTruthy();
      expect(note).toMatch(/cmk disable-native-memory/);
    });

    it('returns null once the user has disabled native memory (no nag)', () => {
      setNativeAutoMemory({ projectRoot, enabled: false });
      expect(nativeMemoryInstallNote(projectRoot)).toBeNull();
    });
  });
});
