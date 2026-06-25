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

// 50.N.3 / D-203 — Kiro IDE 1.0 deprecated the legacy .kiro.hook (when/then/
// runCommand) format. v1 uses a consolidated .kiro/hooks/*.json:
//   {"version":"v1","hooks":[{name, trigger, matcher?, action:{type:'command',
//    command}, timeout?, enabled?}]} with PascalCase triggers. The kit emits the
// v1 file (capture+inject+guard+observe) AND keeps the legacy files for 0.x.
describe('50.N.3 — Kiro IDE v1 hook format (.kiro/hooks/cmk.kiro.hook.json)', () => {
  function readV1() {
    return JSON.parse(
      readFileSync(join(projectRoot, '.kiro', 'hooks', 'cmk.kiro.hook.json'), 'utf8'),
    );
  }

  it('writes a v1 consolidated file alongside the legacy .kiro.hook files (dual-emit)', () => {
    installKiroIdeHooks({ projectRoot });
    // v1 file present...
    expect(existsSync(join(projectRoot, '.kiro', 'hooks', 'cmk.kiro.hook.json'))).toBe(true);
    // ...AND the legacy files still present (0.x back-compat)
    expect(existsSync(join(projectRoot, '.kiro', 'hooks', 'cmk-capture.kiro.hook'))).toBe(true);
    expect(existsSync(join(projectRoot, '.kiro', 'hooks', 'cmk-inject.kiro.hook'))).toBe(true);
  });

  it('the v1 file has version:"v1" + a hooks array with PascalCase triggers + action.type "command"', () => {
    installKiroIdeHooks({ projectRoot });
    const v1 = readV1();
    expect(v1.version).toBe('v1');
    expect(Array.isArray(v1.hooks)).toBe(true);
    for (const h of v1.hooks) {
      // PascalCase trigger (not the legacy camelCase agentStop/promptSubmit)
      expect(h.trigger).toMatch(/^[A-Z]/);
      // deterministic command action (NOT then/runCommand)
      expect(h.action.type).toBe('command');
      expect(typeof h.action.command).toBe('string');
      expect(h).not.toHaveProperty('when');
      expect(h).not.toHaveProperty('then');
    }
  });

  it('wires inject (UserPromptSubmit), capture, delete-guard (PreToolUse) + observe-edit (PostFileSave)', () => {
    installKiroIdeHooks({ projectRoot });
    const triggers = readV1().hooks.map((h) => h.trigger);
    expect(triggers).toContain('UserPromptSubmit'); // inject
    expect(triggers).toContain('PreToolUse');       // delete-guard (v1 can BLOCK)
    expect(triggers).toContain('PostFileSave');     // observe-edit
    // capture-at-turn-end uses whatever the resolved session-end trigger is —
    // assert SOME hook runs `cmk hook stop` (the capture command)
    const cmds = readV1().hooks.map((h) => h.action.command);
    expect(cmds.some((c) => /cmk hook stop/.test(c))).toBe(true);
  });

  it('the v1 delete-guard fires cmk-guard-memory on PreToolUse', () => {
    installKiroIdeHooks({ projectRoot });
    const guard = readV1().hooks.find((h) => h.trigger === 'PreToolUse');
    expect(guard).toBeTruthy();
    expect(guard.action.command).toMatch(/cmk-guard-memory/);
  });

  it('the v1 observe-edit fires cmk hook postToolUse/observe on PostFileSave', () => {
    installKiroIdeHooks({ projectRoot });
    const obs = readV1().hooks.find((h) => h.trigger === 'PostFileSave');
    expect(obs).toBeTruthy();
    expect(obs.action.command).toMatch(/cmk hook (postToolUse|observe)/);
  });

  it('uninstall removes the v1 file too', () => {
    installKiroIdeHooks({ projectRoot });
    uninstallKiroIdeHooks({ projectRoot });
    expect(existsSync(join(projectRoot, '.kiro', 'hooks', 'cmk.kiro.hook.json'))).toBe(false);
  });
});
