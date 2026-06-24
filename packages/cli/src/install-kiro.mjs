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
//   CLI agent → ~/.kiro/agents/cmk.json + ~/.kiro/settings/cli.json (agentSpawn/stop hooks + default-agent
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

import { join, resolve as resolvePath } from 'node:path';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { mutateAgentConfig } from './mutate-agent-config.mjs';
import { installKiroSkills, uninstallKiroSkills } from './kiro-skills.mjs';
import { installKiroIdeHooks, uninstallKiroIdeHooks } from './kiro-ide-hooks.mjs';
import { installKiroCliAgent, uninstallKiroCliAgent } from './kiro-cli-agent.mjs';
import { installKiroTrustedCommands, uninstallKiroTrustedCommands } from './kiro-trusted-commands.mjs';
import {
  writeManagedBlock,
  removeManagedBlock,
  removeJsonKey,
  pruneEmptyParent,
} from './managed-block.mjs';

const MCP_PATH = ['settings', 'mcp.json'];
const MCP_SERVERS_KEY = 'mcpServers';
const MCP_SERVER_NAME = 'claude-memory-kit';
// autoApprove pre-approves the kit's MCP tools so Kiro runs them WITHOUT a
// per-call "Reject / Trust / Run" prompt (found live in cut-gate-kiro Session 1:
// Kiro gates MCP TOOL calls separately from the shell-command hooks D-194 wired,
// so mk_remember etc. prompted every time). Verified shape from kiro.dev/docs/mcp:
// an `autoApprove` array of bare tool names INSIDE the server entry. Explicit
// list of the 11 kit tools — scoped to OUR tools, never a `"*"` wildcard (which
// would auto-approve any tool the server ever adds). mk_forget is safe to
// auto-approve the CALL: it has its own two-step confirm-token before deleting.
export const MCP_AUTO_APPROVE = Object.freeze([
  'mk_remember',
  'mk_search',
  'mk_get',
  'mk_timeline',
  'mk_cite',
  'mk_recent_activity',
  'mk_trust',
  'mk_lessons_promote',
  'mk_forget',
  'mk_queue_list',
  'mk_queue_resolve',
]);
// The MCP entry bakes the absolute project root into the `args` as
// `--project <dir>` so the spawned `cmk mcp serve` knows WHICH project to serve.
// WHY args, not env (the cut-gate-kiro-cli find): kiro-cli launches the stdio MCP
// server from a NON-project cwd, and per its OWN changelog (feed.json) it only
// flows `env` to REGISTRY-type servers — NOT personal/stdio ones like ours — so
// an `env` override is silently dropped and mk_remember wrote to the wrong/no
// project (silent data loss). `args` ARE passed verbatim (the literal command
// line), so `--project` is the lever kiro can't drop. We ALSO keep `env` as a
// belt for agents (Claude Code) + future kiro versions that DO flow stdio env.
// The path is absolute + machine-specific → re-resolved per machine by
// `cmk install` (same posture as the lazy-compress bin path); a teammate who
// clones re-runs install. `.kiro/settings/mcp.json` is workspace-scoped → per-project.
function buildMcpEntry(projectRoot) {
  return {
    type: 'stdio',
    command: 'cmk',
    args: ['mcp', 'serve', '--project', projectRoot],
    autoApprove: MCP_AUTO_APPROVE,
    env: { CMK_PROJECT_DIR: projectRoot },
  };
}

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
  const warnings = []; // non-fatal surface failures (e.g. a corrupt user .vscode/settings.json)
  let changed = false;
  let cliDefaultAgent = null;

  // ── MCP ──────────────────────────────────────────────────────────────────
  const mcp = mutateAgentConfig({
    path: kiro(MCP_PATH),
    format: 'json',
    keyPath: [MCP_SERVERS_KEY, MCP_SERVER_NAME],
    entry: buildMcpEntry(resolvePath(projectRoot)),
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

  // ── trusted commands (D-194) — pre-trust the kit's hook commands in the
  //    workspace .vscode/settings.json so Kiro auto-runs them instead of
  //    prompting "Run / Reject" on every hook fire. Without this the IDE hooks
  //    above are wired but not silent. Array-union (preserves a user's existing
  //    trustedCommands); refuse-to-clobber a corrupt settings.json.
  //
  //    NON-FATAL on error, UNLIKE the MCP leg above (skill-review I1): MCP is the
  //    FIRST surface (a corrupt MCP config → clean abort, nothing written yet).
  //    Trust runs LAST-but-one, after MCP/steering/AGENTS.md/skills/ide-hooks all
  //    succeeded — and it's the LEAST critical surface (if it can't write, the
  //    hooks still fire, they just prompt). So a user's pre-existing malformed
  //    .vscode/settings.json must NOT abort an otherwise-good install: record the
  //    warning, skip the surface, and continue to the CLI agent.
  const trust = installKiroTrustedCommands({ projectRoot });
  if (trust.action === 'error') {
    warnings.push({ surface: 'trusted-commands', ...trust });
  } else {
    if (trust.changed) changed = true;
    surfaces.push('trusted-commands');
  }

  // ── CLI agent-config (kiro-cli, user-tier) — agentSpawn/stop hooks + the
  //    guarded default-agent. Covers terminal `kiro-cli` users; the IDE hooks
  //    above cover the GUI. Both reuse the same `cmk hook` dispatcher.
  const cli = installKiroCliAgent({ awsDir });
  cliDefaultAgent = cli.defaultAgent; // 'set' | 'skipped-existing'
  if (cli.changed) changed = true;
  surfaces.push('cli-agent');

  const result = { action: 'installed', changed, surfaces, cliDefaultAgent };
  if (warnings.length > 0) result.warnings = warnings;
  return result;
}

export function uninstallKiro({ projectRoot, awsDir } = {}) {
  if (!projectRoot) throw new Error('uninstallKiro: projectRoot is required');
  const kiro = (parts) => join(projectRoot, '.kiro', ...parts);
  let changed = false;

  // MCP: remove only our server key, prune an emptied servers object.
  const mcpPath = kiro(MCP_PATH);
  const mcpTouched = removeJsonKey(mcpPath, [MCP_SERVERS_KEY, MCP_SERVER_NAME]);
  if (mcpTouched) changed = true;
  pruneEmptyParent(mcpPath, [MCP_SERVERS_KEY]);

  // steering: strip our marker block (byte-preserve the rest).
  const steeringPath = kiro(STEERING_PATH);
  const steeringTouched = removeManagedBlock(steeringPath);
  if (steeringTouched) changed = true;

  // AGENTS.md: strip our marker block only (a user's own AGENTS.md content,
  // outside our markers, is byte-preserved).
  const agentsMdPath = join(projectRoot, AGENTS_MD_PATH);
  const agentsMdTouched = removeManagedBlock(agentsMdPath);
  if (agentsMdTouched) changed = true;

  // No husks (D-191): a file the kit created that uninstall just emptied —
  // an empty AGENTS.md, a `{}` mcp.json, a frontmatter-only steering file —
  // should be removed, not left as a confusing shell. removeIfHusk deletes
  // ONLY when no user content remains. GATED on "the kit's removal step actually
  // changed THIS file" (B2 defense-in-depth) — so a pristine, never-kit-managed
  // file is never even a deletion candidate, narrowing the blast radius.
  if (agentsMdTouched && removeIfHusk(agentsMdPath)) changed = true;
  if (steeringTouched && removeIfHusk(steeringPath)) changed = true;
  if (mcpTouched && removeIfHusk(mcpPath)) changed = true;

  // skills + IDE hooks + CLI agent-config: remove our files only.
  if (uninstallKiroSkills({ projectRoot }).changed) changed = true;
  if (uninstallKiroIdeHooks({ projectRoot }).changed) changed = true;
  if (uninstallKiroCliAgent({ awsDir }).changed) changed = true;

  // trusted commands (D-194): remove ONLY our patterns from
  // .vscode/settings.json, preserving the user's; prune an emptied key.
  if (uninstallKiroTrustedCommands({ projectRoot }).changed) changed = true;

  return { action: 'uninstalled', changed };
}

// Is `trimmed` ONLY a YAML frontmatter block (opener `---`, a closing `---`,
// and nothing but blank lines after the FIRST closing fence)? Line-scan, not a
// backtracking regex (the managed-block.mjs ReDoS-safe-string-utils discipline)
// — AND, critically, the closing fence must be the FIRST `---` after the opener
// with nothing meaningful after it. A naive `---[\s\S]*?---$` regex backtracks
// to a LATER `---` (a user's horizontal rule) and would match — then DELETE — a
// file full of user prose bordered by `---` (the skill-review B1 data-loss bug).
function isOnlyFrontmatter(trimmed) {
  const lines = trimmed.split(/\r?\n/);
  if (lines[0] !== '---') return false;
  const close = lines.indexOf('---', 1);
  if (close === -1) return false;
  // nothing but blank lines may follow the first closing fence
  return lines.slice(close + 1).every((l) => l.trim() === '');
}

// Delete a file the kit created IFF uninstall left it with no real content —
// i.e. it's now empty, an empty JSON object (`{}`), or only YAML frontmatter.
// Anything else (user prose, a sibling MCP server, user frontmatter+body) means
// real content remains → keep the file. Conservative by construction: a
// non-husk is never touched. Returns true if a file was removed.
// (D-191 — no empty husks after a Kiro uninstall; B1-fixed predicate.)
function removeIfHusk(path) {
  if (!existsSync(path)) return false;
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return false;
  }
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '{}' || isOnlyFrontmatter(trimmed)) {
    try {
      rmSync(path, { force: true });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}
