// @doors: 1, 2
// Door 3 N/A: writes .kiro.hook JSON files; no subprocess spawn.
// Door 4 N/A: no NDJSON/audit surface at this leg.
// Door 5 N/A: no message-queue interaction.

// Tests for Task 50.K — the IDE .kiro.hook writer.
//
// Kiro IDE hooks are .kiro/hooks/<name>.kiro.hook JSON files (format verified
// from a real GUI-created hook, P-WJRUQVSW):
//   { version, enabled, name, description, when:{type}, then:{type:'runCommand', command, timeout} }
// They auto-fire (no agent selection) and CAN run a deterministic command
// (runCommand), so they're the kit's IDE capture/inject surface. This leg writes
// cmk-inject (promptSubmit) + cmk-capture (agentStop), both → `cmk hook <event>`.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installKiroIdeHooks, uninstallKiroIdeHooks } from '../packages/cli/src/kiro-ide-hooks.mjs';

let sandbox;
let projectRoot;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-kiro-ide-hooks-'));
  projectRoot = join(sandbox, 'proj');
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe('Task 50.K — Kiro IDE .kiro.hook writer', () => {
  it('writes cmk-capture (agentStop) + cmk-inject (promptSubmit) hook files', () => {
    const r = installKiroIdeHooks({ projectRoot });
    expect(r.action).toBe('installed');

    const capPath = join(projectRoot, '.kiro', 'hooks', 'cmk-capture.kiro.hook');
    const injPath = join(projectRoot, '.kiro', 'hooks', 'cmk-inject.kiro.hook');
    expect(existsSync(capPath)).toBe(true);
    expect(existsSync(injPath)).toBe(true);
  });

  it('the capture hook matches the verified .kiro.hook format (agentStop → runCommand)', () => {
    installKiroIdeHooks({ projectRoot });
    const hook = JSON.parse(
      readFileSync(join(projectRoot, '.kiro', 'hooks', 'cmk-capture.kiro.hook'), 'utf8'),
    );
    // verified shape from the real GUI hook (P-WJRUQVSW)
    expect(hook.version).toBeDefined();
    expect(hook.enabled).toBe(true);
    expect(hook.when).toEqual({ type: 'agentStop' });
    expect(hook.then.type).toBe('runCommand');
    expect(hook.then.command).toMatch(/cmk hook stop/);
    expect(typeof hook.then.timeout).toBe('number');
  });

  it('emits the platform-correct command form (Windows cmd.exe wrap; LIVE-verified P-PM2CD6CB)', () => {
    installKiroIdeHooks({ projectRoot });
    const hook = JSON.parse(
      readFileSync(join(projectRoot, '.kiro', 'hooks', 'cmk-capture.kiro.hook'), 'utf8'),
    );
    // On Windows the command MUST be `cmd.exe /c cmk hook stop` — Kiro runs hook
    // runCommand via WSL (no node) on Windows, so the bare `cmk` would fail; the
    // cmd.exe form forces the Windows-native shell (live-proven: cmd.exe /c cmk
    // --version → 0.3.5 in the Kiro chat). On POSIX it's the bare `cmk hook stop`.
    if (process.platform === 'win32') {
      expect(hook.then.command).toBe('cmd.exe /c cmk hook stop');
    } else {
      expect(hook.then.command).toBe('cmk hook stop');
    }
  });

  it('the inject hook fires on promptSubmit → cmk hook promptSubmit', () => {
    installKiroIdeHooks({ projectRoot });
    const hook = JSON.parse(
      readFileSync(join(projectRoot, '.kiro', 'hooks', 'cmk-inject.kiro.hook'), 'utf8'),
    );
    expect(hook.when.type).toBe('promptSubmit');
    expect(hook.then.command).toMatch(/cmk hook promptSubmit/);
  });

  it('is idempotent — re-install reports no change', () => {
    installKiroIdeHooks({ projectRoot });
    const r2 = installKiroIdeHooks({ projectRoot });
    expect(r2.changed).toBe(false);
  });

  it('uninstall removes only our hook files, preserves a user hook', () => {
    installKiroIdeHooks({ projectRoot });
    const userHook = join(projectRoot, '.kiro', 'hooks', 'my.kiro.hook');
    mkdirSync(join(projectRoot, '.kiro', 'hooks'), { recursive: true });
    writeFileSync(userHook, '{"name":"mine"}', 'utf8');

    uninstallKiroIdeHooks({ projectRoot });

    expect(existsSync(join(projectRoot, '.kiro', 'hooks', 'cmk-capture.kiro.hook'))).toBe(false);
    expect(existsSync(join(projectRoot, '.kiro', 'hooks', 'cmk-inject.kiro.hook'))).toBe(false);
    expect(existsSync(userHook)).toBe(true);
  });
});

// 50.N.3 / D-203/D-203d — Kiro IDE 1.0 deprecated the legacy .kiro.hook (when/
// then/runCommand) format. v1 uses clean per-hook .kiro/hooks/<name>.json files:
//   {"version":"v1","hooks":[{name, trigger, matcher?, action:{type:'command',
//    command}, timeout, enabled}]} with PascalCase triggers. The kit emits the
// four v1 files (cmk-{capture,inject,guard,observe}.json — Kiro's own convention,
// ground-truth-verified D-203d) AND keeps the legacy .kiro.hook files for 0.x.
describe('50.N.3 — Kiro IDE v1 hook format (.kiro/hooks/cmk-{capture,inject,guard,observe}.json)', () => {
  function readV1(file) {
    return JSON.parse(
      readFileSync(join(projectRoot, '.kiro', 'hooks', file), 'utf8'),
    );
  }
  // D-203d: Kiro IDE 1.0's own migration produced `cmk-capture.json` — clean
  // per-hook `<name>.json` files. We match that convention exactly.
  const V1_FILES = ['cmk-capture.json', 'cmk-inject.json', 'cmk-guard.json', 'cmk-observe.json'];

  it('writes clean per-hook v1 .json files (Kiro 1.0 convention) alongside the legacy files', () => {
    installKiroIdeHooks({ projectRoot });
    for (const f of V1_FILES) {
      expect(existsSync(join(projectRoot, '.kiro', 'hooks', f))).toBe(true);
    }
    // ...AND the legacy files still present (0.x back-compat; inert on 1.0 — D-203d)
    expect(existsSync(join(projectRoot, '.kiro', 'hooks', 'cmk-capture.kiro.hook'))).toBe(true);
    expect(existsSync(join(projectRoot, '.kiro', 'hooks', 'cmk-inject.kiro.hook'))).toBe(true);
  });

  it('every v1 file matches Kiro 1.0\'s ground-truth schema (version v1, 1 hook, PascalCase trigger, action.type command)', () => {
    installKiroIdeHooks({ projectRoot });
    for (const f of V1_FILES) {
      const v1 = readV1(f);
      expect(v1.version).toBe('v1');
      expect(v1.hooks).toHaveLength(1); // one hook per file → fully isolated
      const h = v1.hooks[0];
      expect(h.trigger).toMatch(/^[A-Z]/); // PascalCase (not legacy agentStop/promptSubmit)
      expect(h.action.type).toBe('command'); // deterministic (NOT then/runCommand)
      expect(typeof h.action.command).toBe('string');
      expect(h).not.toHaveProperty('when');
      expect(h).not.toHaveProperty('then');
    }
  });

  it('capture → Stop (CONFIRMED by Kiro 1.0\'s migration, D-203d), exact cmk hook stop command', () => {
    installKiroIdeHooks({ projectRoot });
    const h = readV1('cmk-capture.json').hooks[0];
    expect(h.trigger).toBe('Stop');
    expect(h.action.command).toMatch(/cmk hook stop/);
  });

  it('inject → UserPromptSubmit', () => {
    installKiroIdeHooks({ projectRoot });
    const h = readV1('cmk-inject.json').hooks[0];
    expect(h.trigger).toBe('UserPromptSubmit');
    expect(h.action.command).toMatch(/cmk hook userPromptSubmit/);
  });

  it('delete-guard → PreToolUse fires cmk-guard-memory (v1 can BLOCK, supersedes 165b)', () => {
    installKiroIdeHooks({ projectRoot });
    const h = readV1('cmk-guard.json').hooks[0];
    expect(h.trigger).toBe('PreToolUse');
    expect(h.action.command).toMatch(/cmk-guard-memory/);
  });

  it('observe-edit → PostToolUse (matcher fs_write), NOT PostFileSave (tool-use payload, I1)', () => {
    installKiroIdeHooks({ projectRoot });
    const h = readV1('cmk-observe.json').hooks[0];
    expect(h.trigger).toBe('PostToolUse');
    expect(h.matcher).toBe('fs_write');
    expect(h.action.command).toMatch(/cmk hook postToolUse/);
  });

  it('uninstall removes all v1 files too', () => {
    installKiroIdeHooks({ projectRoot });
    uninstallKiroIdeHooks({ projectRoot });
    for (const f of V1_FILES) {
      expect(existsSync(join(projectRoot, '.kiro', 'hooks', f))).toBe(false);
    }
  });
});
