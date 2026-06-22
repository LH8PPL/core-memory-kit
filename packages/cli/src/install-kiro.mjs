// install-kiro.mjs — the Kiro orchestrator, all surfaces (Task 50, D-182).
//
// Kiro needs its OWN installer branch (D-182): the generic installAgent assumed
// a Claude-Code-shaped model (one settings file + one instruction file) that
// doesn't fit Kiro's distinct surfaces. This composes the verified surface
// modules:
//   MCP       → .kiro/settings/mcp.json (mcpServers.cmk) via mutateAgentConfig
//   steering  → .kiro/steering/cmk.md (inclusion: always), managed marker block
//   skills    → .kiro/skills/{memory-search,memory-write}/ via installKiroSkills
//   IDE hooks → .kiro/hooks/cmk-{capture,inject}.kiro.hook via installKiroIdeHooks
//   CLI agent → ~/.aws/amazonq/cli-agents/ (agentSpawn/stop hooks + guarded
//               default-agent) via installKiroCliAgent — for kiro-cli users
//
// IDE hooks auto-fire with no agent selection; the CLI agent needs cmk to be the
// default agent (guarded — never clobbers a user's existing default). Both hook
// surfaces reuse the SAME `cmk hook <event>` dispatcher (the shared core).
//
// Each leg reuses the kit's safe primitives: mutateAgentConfig (touch-only-our-
// keys, refuse-to-clobber-on-parse-error), managed marker blocks (byte-preserve),
// and the skills/hooks copiers (idempotent, remove-only-ours on uninstall).
//
// Public surface:
//   installKiro({ projectRoot, awsDir? }) → { action, changed, surfaces, cliDefaultAgent, errors? }
//   uninstallKiro({ projectRoot, awsDir? }) → { action, changed }
//   (awsDir sandboxes the CLI-agent leg in tests; production → real ~/.aws.)

import { join } from 'node:path';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { mutateAgentConfig } from './mutate-agent-config.mjs';
import { installKiroSkills, uninstallKiroSkills } from './kiro-skills.mjs';
import { installKiroIdeHooks, uninstallKiroIdeHooks } from './kiro-ide-hooks.mjs';
import { installKiroCliAgent, uninstallKiroCliAgent } from './kiro-cli-agent.mjs';
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
const MEMORY_BODY = [
  '# claude-memory-kit',
  '',
  'This project uses claude-memory-kit for durable, in-repo memory across sessions.',
  'Recall before re-deriving: run `cmk search "<topic>"` for prior decisions,',
  'preferences, and project facts; the curated tiers live under `context/`.',
  'Capture durable facts with `cmk remember` — never hand-edit the memory files.',
].join('\n');
const STEERING_BODY = MEMORY_BODY;

// AGENTS.md — Kiro's real, always-loaded instruction file (kiro.dev/docs/steering:
// auto-included from the project root, no inclusion modes). The CLI agent-config's
// `prompt: file://AGENTS.md` resolves to THIS (D-188). A managed block so it
// coexists with any user AGENTS.md content; no frontmatter (AGENTS.md is the
// cross-tool standard — inclusion modes are a Kiro-steering-only feature).
const AGENTS_MD_PATH = 'AGENTS.md';
const AGENTS_MD_BODY = MEMORY_BODY;

export function installKiro({ projectRoot, awsDir } = {}) {
  if (!projectRoot) throw new Error('installKiro: projectRoot is required');
  const kiro = (parts) => join(projectRoot, '.kiro', ...parts);

  const surfaces = [];
  const errors = [];
  let changed = false;
  let cliDefaultAgent = null;

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

  // ── AGENTS.md (project root) — Kiro's always-loaded instruction file; the CLI
  //    agent-config's prompt:file://AGENTS.md points here (D-188). Managed block,
  //    no frontmatter. Coexists with a Claude-Code CLAUDE.md (each agent reads
  //    its own) and with any user-authored AGENTS.md content.
  if (writeManagedBlock(join(projectRoot, AGENTS_MD_PATH), { body: AGENTS_MD_BODY })) changed = true;
  surfaces.push('agents-md');

  // ── skills ───────────────────────────────────────────────────────────────
  const skills = installKiroSkills({ projectRoot });
  if (skills.changed) changed = true;
  surfaces.push('skills');

  // ── IDE hooks ──────────────────────────────────────────────────────────────
  const hooks = installKiroIdeHooks({ projectRoot });
  if (hooks.changed) changed = true;
  surfaces.push('ide-hooks');

  // ── CLI agent-config (kiro-cli, user-tier) — agentSpawn/stop hooks + the
  //    guarded default-agent. Covers terminal `kiro-cli` users; the IDE hooks
  //    above cover the GUI. Both reuse the same `cmk hook` dispatcher.
  const cli = installKiroCliAgent({ awsDir });
  cliDefaultAgent = cli.defaultAgent; // 'set' | 'skipped-existing'
  if (cli.changed) changed = true;
  surfaces.push('cli-agent');

  return { action: 'installed', changed, surfaces, cliDefaultAgent };
}

export function uninstallKiro({ projectRoot, awsDir } = {}) {
  if (!projectRoot) throw new Error('uninstallKiro: projectRoot is required');
  const kiro = (parts) => join(projectRoot, '.kiro', ...parts);
  let changed = false;

  // MCP: remove only our server key, prune an emptied servers object.
  if (removeJsonKey(kiro(MCP_PATH), [MCP_SERVERS_KEY, MCP_SERVER_NAME])) changed = true;
  pruneEmptyParent(kiro(MCP_PATH), [MCP_SERVERS_KEY]);

  // steering: strip our marker block (byte-preserve the rest).
  if (removeManagedBlock(kiro(STEERING_PATH))) changed = true;

  // AGENTS.md: strip our marker block only (a user's own AGENTS.md content,
  // outside our markers, is byte-preserved).
  if (removeManagedBlock(join(projectRoot, AGENTS_MD_PATH))) changed = true;

  // No husks (D-191): a file the kit created that uninstall just emptied —
  // an empty AGENTS.md, a `{}` mcp.json, a frontmatter-only steering file —
  // should be removed, not left as a confusing shell. removeIfHusk deletes
  // ONLY when no user content remains (so the preserve-user-content + sibling-
  // server cases above are untouched).
  if (removeIfHusk(join(projectRoot, AGENTS_MD_PATH))) changed = true;
  if (removeIfHusk(kiro(STEERING_PATH))) changed = true;
  if (removeIfHusk(kiro(MCP_PATH))) changed = true;

  // skills + IDE hooks + CLI agent-config: remove our files only.
  if (uninstallKiroSkills({ projectRoot }).changed) changed = true;
  if (uninstallKiroIdeHooks({ projectRoot }).changed) changed = true;
  if (uninstallKiroCliAgent({ awsDir }).changed) changed = true;

  return { action: 'uninstalled', changed };
}

// Delete a file the kit created IFF uninstall left it with no real content —
// i.e. it's now empty, an empty JSON object (`{}`), or only YAML frontmatter
// (`---\n…\n---` with nothing after). Anything else (user prose, a sibling MCP
// server, user frontmatter+body) means real content remains → keep the file.
// Conservative by construction: a non-husk is never touched. Returns true if a
// file was removed. (D-191 — no empty husks after a Kiro uninstall.)
function removeIfHusk(path) {
  if (!existsSync(path)) return false;
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return false;
  }
  const trimmed = raw.trim();
  const isEmpty = trimmed === '';
  const isEmptyJson = trimmed === '{}';
  // only-frontmatter: starts with `---`, has a closing `---`, nothing meaningful after.
  const fmMatch = /^---\r?\n[\s\S]*?\r?\n---\s*$/.test(trimmed);
  if (isEmpty || isEmptyJson || fmMatch) {
    try {
      rmSync(path, { force: true });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}
