// install-kind.mjs — which agent a project was `cmk install`-ed for (Task 200).
//
// Extracted from doctor.mjs (2026-07-05) so makeBackend + install can share it
// WITHOUT importing doctor.mjs's heavy dependency chain (install/semantic/
// native-binding/…) — a circular-dep hazard. Behavior is byte-identical to the
// doctor.mjs original; doctor.mjs now re-exports from here. Keyed on the
// cmk-OWNED markers (the I2 discipline — a stray `.cursor/` dir alone does not
// flip the project; only OUR rule/steering file does).

import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @returns {'claude-code'|'kiro'|'cursor'} the agent the project was installed
 *   for (default 'claude-code').
 */
export function detectInstallKind(projectRoot) {
  if (existsSync(join(projectRoot, '.claude', 'settings.json'))) return 'claude-code';
  if (existsSync(join(projectRoot, '.kiro', 'steering', 'cmk.md'))) return 'kiro';
  // Task 196: the cmk-owned Cursor rule marks a `--ide cursor` install. Same
  // keyed-on-OUR-marker discipline as Kiro (I2) — a stray .cursor/ dir alone
  // does not flip the project to the Cursor path.
  if (existsSync(join(projectRoot, '.cursor', 'rules', 'claude-memory-kit.mdc'))) return 'cursor';
  return 'claude-code';
}
