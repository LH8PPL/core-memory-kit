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

// Default command stem: the PATH-resolved `cmk` (npm route) — same as the kit's
// Claude-Code hooks use bare bin names. The bin reads the Kiro event arg + stdin.
const DEFAULT_CMD = 'cmk';

// The hook definitions, in the verified .kiro.hook shape.
function hookDefs(cmd) {
  return [
    {
      file: 'cmk-capture.kiro.hook',
      body: {
        version: '1.0.0',
        enabled: true,
        name: 'claude-memory-kit: capture',
        description: 'Capture durable memory at the end of each turn (claude-memory-kit). Managed by `cmk install` — do not hand-edit.',
        when: { type: 'agentStop' },
        then: { type: 'runCommand', command: `${cmd} hook stop`, timeout: 60 },
      },
    },
    {
      file: 'cmk-inject.kiro.hook',
      body: {
        version: '1.0.0',
        enabled: true,
        name: 'claude-memory-kit: recall',
        description: 'Inject recalled memory on each prompt (claude-memory-kit). Managed by `cmk install` — do not hand-edit.',
        when: { type: 'promptSubmit' },
        then: { type: 'runCommand', command: `${cmd} hook promptSubmit`, timeout: 30 },
      },
    },
  ];
}

export function installKiroIdeHooks({ projectRoot, command = DEFAULT_CMD } = {}) {
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

export function uninstallKiroIdeHooks({ projectRoot, command = DEFAULT_CMD } = {}) {
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
