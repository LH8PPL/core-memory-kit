// install-kiro.mjs — the all-4-surfaces Kiro orchestrator (Task 50, D-182).
//
// Kiro needs its OWN installer branch (D-182): the generic installAgent assumed
// a Claude-Code-shaped model (one settings file + one instruction file) that
// doesn't fit Kiro's FOUR distinct surfaces. This composes the verified surface
// modules:
//   MCP       → .kiro/settings/mcp.json (mcpServers.cmk) via mutateAgentConfig
//   steering  → .kiro/steering/cmk.md (inclusion: always), managed marker block
//   skills    → .kiro/skills/{memory-search,memory-write}/ via installKiroSkills
//   IDE hooks → .kiro/hooks/cmk-{capture,inject}.kiro.hook via installKiroIdeHooks
//
// (The CLI agent-config hook surface + chat.defaultAgent registration is 50.L,
// a follow-up PR — this orchestrator is the shared 3 surfaces + IDE hooks, the
// PR-1 scope. The IDE hook path is automatic with no default-agent, so this
// alone gives a Kiro IDE user working automatic memory.)
//
// Each leg reuses the kit's safe primitives: mutateAgentConfig (touch-only-our-
// keys, refuse-to-clobber-on-parse-error), managed marker blocks (byte-preserve),
// and the skills/hooks copiers (idempotent, remove-only-ours on uninstall).
//
// Public surface:
//   installKiro({ projectRoot }) → { action, changed, surfaces, errors? }
//   uninstallKiro({ projectRoot }) → { action, changed }

import { join } from 'node:path';
import { mutateAgentConfig } from './mutate-agent-config.mjs';
import { installKiroSkills, uninstallKiroSkills } from './kiro-skills.mjs';
import { installKiroIdeHooks, uninstallKiroIdeHooks } from './kiro-ide-hooks.mjs';
import {
  writeManagedBlock,
  removeManagedBlock,
  removeJsonKey,
  pruneEmptyParent,
} from './managed-block.mjs';

const MCP_PATH = ['settings', 'mcp.json'];
const MCP_SERVERS_KEY = 'mcpServers';
const MCP_SERVER_NAME = 'claude-memory-kit';
const MCP_ENTRY = Object.freeze({ type: 'stdio', command: 'cmk', args: ['mcp', 'serve'] });

const STEERING_PATH = ['steering', 'cmk.md'];
const STEERING_FRONTMATTER = '---\ninclusion: always\n---\n\n';
const STEERING_BODY = [
  '# claude-memory-kit',
  '',
  'This project uses claude-memory-kit for durable, in-repo memory across sessions.',
  'Recall before re-deriving: run `cmk search "<topic>"` for prior decisions,',
  'preferences, and project facts; the curated tiers live under `context/`.',
  'Capture durable facts with `cmk remember` — never hand-edit the memory files.',
].join('\n');

export function installKiro({ projectRoot } = {}) {
  if (!projectRoot) throw new Error('installKiro: projectRoot is required');
  const kiro = (parts) => join(projectRoot, '.kiro', ...parts);

  const surfaces = [];
  const errors = [];
  let changed = false;

  // ── MCP ──────────────────────────────────────────────────────────────────
  const mcp = mutateAgentConfig({
    path: kiro(MCP_PATH),
    format: 'json',
    keyPath: [MCP_SERVERS_KEY, MCP_SERVER_NAME],
    entry: MCP_ENTRY,
  });
  if (mcp.action === 'error') {
    errors.push({ surface: 'mcp', ...mcp });
  } else {
    surfaces.push('mcp');
    if (mcp.changed) changed = true;
  }

  // If MCP refused (corrupt config), halt — report, don't push past it.
  if (errors.length > 0) {
    return { action: 'error', changed, surfaces, errors };
  }

  // ── steering ───────────────────────────────────────────────────────────────
  if (writeManagedBlock(kiro(STEERING_PATH), { body: STEERING_BODY, frontmatter: STEERING_FRONTMATTER })) changed = true;
  surfaces.push('steering');

  // ── skills ───────────────────────────────────────────────────────────────
  const skills = installKiroSkills({ projectRoot });
  if (skills.changed) changed = true;
  surfaces.push('skills');

  // ── IDE hooks ──────────────────────────────────────────────────────────────
  const hooks = installKiroIdeHooks({ projectRoot });
  if (hooks.changed) changed = true;
  surfaces.push('ide-hooks');

  return { action: 'installed', changed, surfaces };
}

export function uninstallKiro({ projectRoot } = {}) {
  if (!projectRoot) throw new Error('uninstallKiro: projectRoot is required');
  const kiro = (parts) => join(projectRoot, '.kiro', ...parts);
  let changed = false;

  // MCP: remove only our server key, prune an emptied servers object.
  if (removeJsonKey(kiro(MCP_PATH), [MCP_SERVERS_KEY, MCP_SERVER_NAME])) changed = true;
  pruneEmptyParent(kiro(MCP_PATH), [MCP_SERVERS_KEY]);

  // steering: strip our marker block (byte-preserve the rest).
  if (removeManagedBlock(kiro(STEERING_PATH))) changed = true;

  // skills + hooks: remove our dirs/files only.
  if (uninstallKiroSkills({ projectRoot }).changed) changed = true;
  if (uninstallKiroIdeHooks({ projectRoot }).changed) changed = true;

  return { action: 'uninstalled', changed };
}
