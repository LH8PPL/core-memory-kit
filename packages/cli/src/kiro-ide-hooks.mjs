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
import { kiroHookCommand } from './kiro-hook-command.mjs';

const CMK = 'cmk';

// The platform-correct `cmk hook <event>` command (cmd.exe /c on Windows where
// Kiro routes hooks through WSL) is shared from kiro-hook-command.mjs.
const hookCommand = kiroHookCommand;

// One .kiro.hook spec. We intentionally do NOT put a `then` key on any JS object
// here — Kiro's schema needs a top-level `then` (its "action" leg), but a JS
// object with a `then` property is a "thenable" footgun (a static analyzer flags
// it, and an accidental thenable can hijack a Promise chain). So we model the
// action under a neutral `action` key and rename it to `then` ONLY at
// serialization (serializeHook), where it's pure JSON data, never a live object.
function hookSpecs(cmd) {
  return [
    {
      file: 'cmk-capture.kiro.hook',
      version: '1.0.0',
      enabled: true,
      name: 'claude-memory-kit: capture',
      description: 'Capture durable memory at the end of each turn (claude-memory-kit). Managed by `cmk install` — do not hand-edit.',
      when: { type: 'agentStop' },
      action: { type: 'runCommand', command: hookCommand('stop', cmd), timeout: 60 },
    },
    {
      file: 'cmk-inject.kiro.hook',
      version: '1.0.0',
      enabled: true,
      name: 'claude-memory-kit: recall',
      description: 'Inject recalled memory on each prompt (claude-memory-kit). Managed by `cmk install` — do not hand-edit.',
      when: { type: 'promptSubmit' },
      action: { type: 'runCommand', command: hookCommand('promptSubmit', cmd), timeout: 30 },
    },
  ];
}

// Serialize a spec to the Kiro .kiro.hook JSON, mapping our internal `action`
// key to Kiro's required `then` field. We build the object with a placeholder
// key, then rename it in the JSON STRING — so no JS object literal ever carries
// a `then` property (the thenable footgun the static analyzer guards against).
const THEN_PLACEHOLDER = '__kiro_then__';
function serializeHook(spec) {
  const { file, action, ...rest } = spec;
  const obj = { ...rest, [THEN_PLACEHOLDER]: action };
  return `${JSON.stringify(obj, null, 2).replace(`"${THEN_PLACEHOLDER}"`, '"then"')}\n`;
}

export function installKiroIdeHooks({ projectRoot, command = CMK } = {}) {
  if (!projectRoot) throw new Error('installKiroIdeHooks: projectRoot is required');
  const hooksDir = join(projectRoot, '.kiro', 'hooks');

  let changed = false;
  const written = [];
  for (const spec of hookSpecs(command)) {
    const path = join(hooksDir, spec.file);
    const serialized = serializeHook(spec);
    const existing = existsSync(path) ? readFileSync(path, 'utf8') : null;
    if (existing !== serialized) {
      mkdirSync(hooksDir, { recursive: true });
      writeFileSync(path, serialized, 'utf8');
      changed = true;
    }
    written.push(spec.file);
  }
  return { action: 'installed', changed, hooks: written };
}

export function uninstallKiroIdeHooks({ projectRoot, command = CMK } = {}) {
  if (!projectRoot) throw new Error('uninstallKiroIdeHooks: projectRoot is required');
  const hooksDir = join(projectRoot, '.kiro', 'hooks');
  let changed = false;
  const removed = [];
  for (const spec of hookSpecs(command)) {
    const path = join(hooksDir, spec.file);
    if (existsSync(path)) {
      rmSync(path, { force: true });
      changed = true;
      removed.push(spec.file);
    }
  }
  return { action: 'uninstalled', changed, hooks: removed };
}
