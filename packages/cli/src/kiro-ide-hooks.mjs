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
//   v1 (Kiro IDE 1.0+) — clean per-hook `.kiro/hooks/<name>.json` files that
//   REPLACE the .kiro.hook format (which 1.0 no longer loads — D-203). Schema
//   GROUND-TRUTH-VERIFIED against Kiro IDE 1.0's OWN migration output (D-203d —
//   it migrated our `cmk-capture.kiro.hook` → `cmk-capture.json`):
//     { "version": "v1", "hooks": [ { "name", "description", "trigger",
//       "matcher"?, "action": { "type": "command", "command" }, "timeout",
//       "enabled" } ] }   — PascalCase triggers; `action.type:'command'` is the
//   deterministic-shell action (no LLM). We write `cmk-capture.json`/
//   `cmk-inject.json`/`cmk-guard.json`/`cmk-observe.json` — Kiro's exact filename
//   convention, one hook per file (full isolation).
//
// v1 lets the IDE do the FULL Claude-Code hook set (one clean .json file PER
// hook): inject (UserPromptSubmit) + capture (Stop) + delete-guard (PreToolUse —
// CAN BLOCK on non-zero exit) + observe-edit (PostToolUse).
//
// We emit BOTH so a 0.x user keeps the legacy hooks and a 1.0 user gets v1 (a
// 1.0 IDE runs the .json + shows the .kiro.hook as inert "legacy"; a 0.x IDE
// runs the .kiro.hook + ignores the .json — no double-fire, verified D-203d).
//
// ⚠️ v1 behaviors LIVE-PROBED at the cut-gate (D-203 — `Stop` + the schema are
// CONFIRMED by Kiro 1.0's own migration D-203d; the rest flagged, NOT asserted):
// (1) auto-load of an installer-written json; (2) what a PreToolUse command
// receives (the path to inspect); (3) exit-code 1-vs-2 to
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
const MANAGED = 'Managed by `cmk install` — do not hand-edit.';

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

// The v1 hooks — ONE clean `<name>.json` file PER hook (Kiro IDE 1.0's own
// convention — D-203d). One hook per file → every hook independently isolated (a
// bad trigger can't dark the others). The full Claude-Code parity set:
//   cmk-capture.json → Stop             → capture (turn-end)
//   cmk-inject.json  → UserPromptSubmit → inject (recall)
//   cmk-guard.json   → PreToolUse       → delete-guard (CAN BLOCK on non-zero exit)
//   cmk-observe.json → PostToolUse      → observe-edit (record large edits)
// Schema GROUND-TRUTH-verified against Kiro IDE 1.0's own migration output (D-203d):
// {version:'v1', hooks:[{name, description, trigger, matcher?, action:{type:
// 'command', command}, timeout, enabled}]}.
//
// SINGLE SOURCE: filename → hook-spec builder. V1_FILES is DERIVED from these keys
// (no array/switch to keep in sync). `Stop` (capture) is CONFIRMED by Kiro's
// migration; the other three triggers + the `fs_write` matcher are live-probed
// (cut-gate KHv1-*).
function v1HookFile(hook) {
  return { version: 'v1', hooks: [hook] };
}
const V1_HOOK_BUILDERS = Object.freeze({
  'cmk-capture.json': (cmd) =>
    v1HookFile({
      name: 'claude-memory-kit: capture',
      description: `Capture durable memory at the end of each turn (claude-memory-kit). ${MANAGED}`,
      trigger: 'Stop', // CONFIRMED by Kiro IDE 1.0's own migration (D-203d)
      action: { type: 'command', command: hookCommand('stop', cmd) },
      timeout: 60,
      enabled: true,
    }),
  'cmk-inject.json': (cmd) =>
    v1HookFile({
      name: 'claude-memory-kit: recall',
      description: `Inject recalled memory on each prompt (claude-memory-kit). ${MANAGED}`,
      trigger: 'UserPromptSubmit',
      action: { type: 'command', command: hookCommand('userPromptSubmit', cmd) },
      timeout: 30,
      enabled: true,
    }),
  'cmk-guard.json': () =>
    v1HookFile({
      name: 'claude-memory-kit: delete-guard',
      description: `Block a destructive command aimed at a memory path (claude-memory-kit). ${MANAGED}`,
      trigger: 'PreToolUse', // v1 PreToolUse can BLOCK (non-zero exit) — supersedes Task 165(b)
      // `matcher` for PreToolUse is a TOOL-NAME glob (D-203 item 4 — exact tokens
      // live-unverified). `'*'` is conservative; the guard itself filters to memory
      // deletes, so an over-broad matcher costs nothing (allows all non-deletes).
      matcher: '*',
      action: { type: 'command', command: kiroGuardCommand() },
      timeout: 5,
      enabled: true,
    }),
  'cmk-observe.json': (cmd) =>
    v1HookFile({
      name: 'claude-memory-kit: observe-edit',
      description: `Record large file edits (claude-memory-kit). ${MANAGED}`,
      // PostToolUse (NOT PostFileSave) — observe-edit needs a TOOL-USE payload
      // ({tool_name:'fs_write', …}) that observeEdit reads; a file-SAVE event
      // carries no tool_name → silent noop (skill-review I1). Sibling of the
      // kiro-cli postToolUse leg (50.N.2), same payload shape.
      trigger: 'PostToolUse',
      matcher: 'fs_write', // tool-name glob (like PreToolUse), scoped to file-writes
      action: { type: 'command', command: hookCommand('postToolUse', cmd) },
      timeout: 30,
      enabled: true,
    }),
});

// V1_FILES is DERIVED from the builder keys — single source of truth, no array
// to keep in sync (an unmapped filename is structurally impossible).
const V1_FILES = Object.freeze(Object.keys(V1_HOOK_BUILDERS));

function serializeV1(file, cmd) {
  return `${JSON.stringify(V1_HOOK_BUILDERS[file](cmd), null, 2)}\n`;
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
  // 2. The v1 files (Kiro IDE 1.0+ — D-203/D-203d). A 0.x IDE ignores them; a 1.0
  //    IDE ignores the stale .kiro.hook files above (shows them "legacy", inert —
  //    no double-fire, verified D-203d). ONE clean `<name>.json` PER hook (Kiro's
  //    own migration convention), so every hook is isolated.
  for (const file of V1_FILES) {
    const path = join(hooksDir, file);
    const serialized = serializeV1(file, command);
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
  // legacy .kiro.hook files + all the v1 files — remove all.
  const ourFiles = [...hookSpecs(command).map((s) => s.file), ...V1_FILES];
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
