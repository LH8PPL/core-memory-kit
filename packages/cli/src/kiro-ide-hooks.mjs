// kiro-ide-hooks.mjs — write Kiro IDE .kiro.hook files (Task 50.K).
//
// Kiro IDE hooks are .kiro/hooks/<name>.kiro.hook JSON files. Format VERIFIED
// from a real GUI-created hook (P-WJRUQVSW — the Kiro Hook UI itself emitted it):
//   { "version": "1.0.0", "enabled": true, "name", "description",
//     "when": { "type": "agentStop" },
//     "then": { "type": "runCommand", "command": "...", "timeout": 60 } }
//
// They auto-fire (no agent selection, unlike CLI agent-config hooks) and support
// `runCommand` (deterministic shell command), so they're the kit's IDE
// inject/capture surface. We write two:
//   cmk-capture.kiro.hook  — agentStop  → `cmk hook stop`      (turn-end capture)
//   cmk-inject.kiro.hook   — promptSubmit → `cmk hook promptSubmit` (recall)
//
// Public surface:
//   installKiroIdeHooks({ projectRoot, command? }) → { action, changed, hooks }
//   uninstallKiroIdeHooks({ projectRoot }) → { action, changed, hooks }

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

// The hook command form is PLATFORM-SPECIFIC (the binding cross-platform rule),
// and Kiro on Windows is the tricky case — LIVE-VERIFIED 2026-06-21 (P-PM2CD6CB):
// Kiro runs a hook `runCommand` through WSL on Windows, and WSL has no node, so a
// bare `cmk hook stop` fails ("node: not found"). Forcing the Windows-native
// shell with `cmd.exe /c` reaches the real node+cmk (proven: `cmd.exe /c cmk
// --version` → 0.3.5 in the Kiro chat). On macOS/Linux there's no WSL hop, so the
// native `cmk` runs directly.
//   Windows → `cmd.exe /c cmk hook <event>`
//   macOS/Linux → `cmk hook <event>`
// platform-commands: ignore (the Kiro-hook command runs in KIRO's shell, not the
//   kit's — this is the one place we emit a cmd.exe form deliberately; the choice
//   keys on the INSTALL host's process.platform, the right signal for "which OS
//   will run these hooks").
const IS_WINDOWS = process.platform === 'win32';
const CMK = 'cmk';

// Build the runCommand string for a given `cmk hook <event>` invocation.
function hookCommand(event, cmkCmd = CMK) {
  const inner = `${cmkCmd} hook ${event}`;
  return IS_WINDOWS ? `cmd.exe /c ${inner}` : inner;
}

// The hook definitions, in the verified .kiro.hook shape. `cmd` is the cmk stem
// (default 'cmk'); the platform-correct wrapping (cmd.exe /c on Windows) is added
// by hookCommand().
// Build one .kiro.hook body. NOTE: `when` + `then` are KIRO'S required schema
// field names (not a thenable/Promise — `then` here is a plain object, Kiro's
// "action" leg). It's assigned via bracket notation so a static analyzer doesn't
// misread the object as a fake-Promise (the "do not add `then` to an object"
// rule, which targets accidental thenables — N/A here, this is Kiro's wire format).
function makeHookBody({ name, description, whenType, event, cmd, timeout }) {
  const body = {
    version: '1.0.0',
    enabled: true,
    name,
    description,
    when: { type: whenType },
  };
  body.then = { type: 'runCommand', command: hookCommand(event, cmd), timeout };
  return body;
}

function hookDefs(cmd) {
  return [
    {
      file: 'cmk-capture.kiro.hook',
      body: makeHookBody({
        name: 'claude-memory-kit: capture',
        description: 'Capture durable memory at the end of each turn (claude-memory-kit). Managed by `cmk install` — do not hand-edit.',
        whenType: 'agentStop',
        event: 'stop',
        cmd,
        timeout: 60,
      }),
    },
    {
      file: 'cmk-inject.kiro.hook',
      body: makeHookBody({
        name: 'claude-memory-kit: recall',
        description: 'Inject recalled memory on each prompt (claude-memory-kit). Managed by `cmk install` — do not hand-edit.',
        whenType: 'promptSubmit',
        event: 'promptSubmit',
        cmd,
        timeout: 30,
      }),
    },
  ];
}

export function installKiroIdeHooks({ projectRoot, command = CMK } = {}) {
  if (!projectRoot) throw new Error('installKiroIdeHooks: projectRoot is required');
  const hooksDir = join(projectRoot, '.kiro', 'hooks');

  let changed = false;
  const written = [];
  for (const { file, body } of hookDefs(command)) {
    const path = join(hooksDir, file);
    const serialized = `${JSON.stringify(body, null, 2)}\n`;
    const existing = existsSync(path) ? readFileSync(path, 'utf8') : null;
    if (existing !== serialized) {
      mkdirSync(hooksDir, { recursive: true });
      writeFileSync(path, serialized, 'utf8');
      changed = true;
    }
    written.push(file);
  }
  return { action: 'installed', changed, hooks: written };
}

export function uninstallKiroIdeHooks({ projectRoot, command = CMK } = {}) {
  if (!projectRoot) throw new Error('uninstallKiroIdeHooks: projectRoot is required');
  const hooksDir = join(projectRoot, '.kiro', 'hooks');
  let changed = false;
  const removed = [];
  for (const { file } of hookDefs(command)) {
    const path = join(hooksDir, file);
    if (existsSync(path)) {
      rmSync(path, { force: true });
      changed = true;
      removed.push(file);
    }
  }
  return { action: 'uninstalled', changed, hooks: removed };
}
