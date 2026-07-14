// install-kind.mjs — which agent a project was `cmk install`-ed for (Task 200).
//
// Extracted from doctor.mjs (2026-07-05) so makeBackend + install can share it
// WITHOUT importing doctor.mjs's heavy dependency chain (install/semantic/
// native-binding/…) — a circular-dep hazard. Behavior is byte-identical to the
// doctor.mjs original; doctor.mjs now re-exports from here. Keyed on the
// cmk-OWNED markers (the I2 discipline — a stray `.cursor/` dir alone does not
// flip the project; only OUR rule/steering file does).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @returns {'claude-code'|'kiro'|'cursor'|'codex'} the agent the project was
 *   installed for (default 'claude-code').
 */
export function detectInstallKind(projectRoot) {
  if (existsSync(join(projectRoot, '.claude', 'settings.json'))) return 'claude-code';
  if (existsSync(join(projectRoot, '.kiro', 'steering', 'cmk.md'))) return 'kiro';
  // Task 196: the cmk-owned Cursor rule marks a `--ide cursor` install. Same
  // keyed-on-OUR-marker discipline as Kiro (I2) — a stray .cursor/ dir alone
  // does not flip the project to the Cursor path.
  if (existsSync(join(projectRoot, '.cursor', 'rules', 'core-memory-kit.mdc'))) return 'cursor';
  // Task 196 tail: a `--ide codex` install writes `.codex/hooks.json` (the kit
  // seeds it; AGENTS.md alone is NOT the marker — the agents-md rung writes it
  // too). Same cmk-owned-marker discipline: a stray .codex/ dir doesn't flip
  // the project; only a hooks file naming our dispatcher does.
  if (codexHooksCarryDispatcher(projectRoot)) return 'codex';
  return 'claude-code';
}

// Cheap evidence probe: does .codex/hooks.json reference `cmk codex-hook`?
function codexHooksCarryDispatcher(projectRoot) {
  const p = join(projectRoot, '.codex', 'hooks.json');
  if (!existsSync(p)) return false;
  try {
    return readFileSync(p, 'utf8').includes('cmk codex-hook');
  } catch {
    return false;
  }
}
