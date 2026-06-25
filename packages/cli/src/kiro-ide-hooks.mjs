// kiro-ide-hooks.mjs — write Kiro IDE hook files (Task 50.K + 50.N.3 v1 migration).
//
// TWO formats, DUAL-EMITTED for back-compat (D-203):
//
//   LEGACY (Kiro 0.x) — individual `.kiro/hooks/<name>.kiro.hook` files:
//     { "version": "1.0.0", "enabled", "name", "description",
//       "when": { "type": "agentStop" },
//       "then": { "type": "runCommand", "command", "timeout" } }
//   Verified from a real GUI-created 0.x hook (P-WJRUQVSW).
//
//   v1 (Kiro IDE 1.0+, released 2026-06-25) — a CONSOLIDATED `.kiro/hooks/
//   cmk.kiro.hook.json` that REPLACES the .kiro.hook format (which 1.0 no longer
//   loads — D-203):
//     { "version": "v1", "hooks": [ { "name", "description", "trigger",
//       "matcher"?, "action": { "type": "command", "command" }, "timeout"?,
//       "enabled"? } ] }   — PascalCase triggers; `action.type:'command'` is the
//   deterministic-shell action (no LLM). Sources: kiro.dev/docs/hooks + /actions.
//
// v1 lets the IDE do the FULL Claude-Code hook set in one file: inject
// (UserPromptSubmit) + capture (the session-end trigger) + delete-guard
// (PreToolUse — CAN BLOCK on non-zero exit) + observe-edit (PostFileSave).
//
// We emit BOTH so a 0.x user keeps the legacy hooks and a 1.0 user gets v1 (a
// 1.0 IDE ignores the stale .kiro.hook files; a 0.x IDE ignores the v1 json).
//
// ⚠️ 5 v1 behaviors are LIVE-UNVERIFIED (D-203 — flagged for the cut-gate, NOT
// asserted as working): (1) auto-load of an installer-written json; (2) what a
// PreToolUse command receives (the path to inspect); (3) exit-code 1-vs-2 to
// block; (4) the matcher tool-name tokens; (5) the real session-end trigger
// name (v1's type list has SessionStart but no obvious Stop — we use `Stop`,
// the dispatcher's capture key, pending the probe).
//
// Public surface:
//   installKiroIdeHooks({ projectRoot, command? }) → { action, changed, hooks }
//   uninstallKiroIdeHooks({ projectRoot }) → { action, changed, hooks }

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { kiroHookCommand, kiroGuardCommand } from './kiro-hook-command.mjs';

const CMK = 'cmk';
const V1_FILE = 'cmk.kiro.hook.json'; // the consolidated v1 file (Kiro IDE 1.0+)

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

// The v1 consolidated hook set (Kiro IDE 1.0+). One file, `hooks[]`, PascalCase
// triggers, `action.type:'command'`. The full Claude-Code parity set:
//   UserPromptSubmit → inject (recall)
//   Stop             → capture (turn-end) — the session-end trigger (live-probe)
//   PreToolUse       → delete-guard (cmk-guard-memory; CAN BLOCK on non-zero exit)
//   PostFileSave     → observe-edit (record large edits)
const MANAGED = 'Managed by `cmk install` — do not hand-edit.';
function v1HookSet(cmd) {
  return {
    version: 'v1',
    hooks: [
      {
        name: 'claude-memory-kit: recall',
        description: `Inject recalled memory on each prompt (claude-memory-kit). ${MANAGED}`,
        trigger: 'UserPromptSubmit',
        action: { type: 'command', command: hookCommand('userPromptSubmit', cmd) },
        timeout: 30,
        enabled: true,
      },
      {
        name: 'claude-memory-kit: capture',
        description: `Capture durable memory at the end of each turn (claude-memory-kit). ${MANAGED}`,
        trigger: 'Stop', // v1 session-end trigger — flagged for the cut-gate probe (D-203 item 5)
        action: { type: 'command', command: hookCommand('stop', cmd) },
        timeout: 60,
        enabled: true,
      },
      {
        name: 'claude-memory-kit: delete-guard',
        description: `Block a destructive command aimed at a memory path (claude-memory-kit). ${MANAGED}`,
        trigger: 'PreToolUse',
        // matcher tool-name tokens are LIVE-UNVERIFIED (D-203 item 4) — '*' (all
        // tools) is the conservative default; the guard itself filters to memory
        // deletes, so an over-broad matcher costs nothing (it just runs the guard,
        // which allows everything that isn't a memory delete).
        matcher: '*',
        action: { type: 'command', command: kiroGuardCommand() },
        timeout: 5,
        enabled: true,
      },
      {
        name: 'claude-memory-kit: observe-edit',
        description: `Record large file edits (claude-memory-kit). ${MANAGED}`,
        trigger: 'PostFileSave',
        matcher: '.*',
        action: { type: 'command', command: hookCommand('postToolUse', cmd) },
        timeout: 30,
        enabled: true,
      },
    ],
  };
}

function serializeV1(cmd) {
  return `${JSON.stringify(v1HookSet(cmd), null, 2)}\n`;
}

export function installKiroIdeHooks({ projectRoot, command = CMK } = {}) {
  if (!projectRoot) throw new Error('installKiroIdeHooks: projectRoot is required');
  const hooksDir = join(projectRoot, '.kiro', 'hooks');

  let changed = false;
  const written = [];
  // 1. Legacy .kiro.hook files (Kiro 0.x back-compat).
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
  // 2. The v1 consolidated file (Kiro IDE 1.0+ — D-203). A 0.x IDE ignores it;
  //    a 1.0 IDE ignores the stale .kiro.hook files above.
  {
    const path = join(hooksDir, V1_FILE);
    const serialized = serializeV1(command);
    const existing = existsSync(path) ? readFileSync(path, 'utf8') : null;
    if (existing !== serialized) {
      mkdirSync(hooksDir, { recursive: true });
      writeFileSync(path, serialized, 'utf8');
      changed = true;
    }
    written.push(V1_FILE);
  }
  return { action: 'installed', changed, hooks: written };
}

export function uninstallKiroIdeHooks({ projectRoot, command = CMK } = {}) {
  if (!projectRoot) throw new Error('uninstallKiroIdeHooks: projectRoot is required');
  const hooksDir = join(projectRoot, '.kiro', 'hooks');
  let changed = false;
  const removed = [];
  // legacy .kiro.hook files + the v1 consolidated file — remove both.
  const ourFiles = [...hookSpecs(command).map((s) => s.file), V1_FILE];
  for (const file of ourFiles) {
    const path = join(hooksDir, file);
    if (existsSync(path)) {
      rmSync(path, { force: true });
      changed = true;
      removed.push(file);
    }
  }
  return { action: 'uninstalled', changed, hooks: removed };
}
