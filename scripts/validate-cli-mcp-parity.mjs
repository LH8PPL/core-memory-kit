#!/usr/bin/env node
// Structural parity guard (Task 108b / ADR-0014).
//
// SCOPE (honest, per D-102): this checks **structural existence only** — that
// every memory OPERATION exists on BOTH surfaces. It does NOT check behavioral
// or message parity (it cannot see that, e.g., a tier-deferral message drifted
// into three divergent copies — that was the Task 121 fix). BEHAVIORAL parity
// is enforced differently: both surfaces are thin adapters over ONE shared core
// (`remember-core.mjs` / `read-core.mjs`) + shared constants (e.g.
// `nonProjectTierNote`), so they can't diverge in behavior without diverging the
// core. This guard catches the OTHER drift class: a tool/verb going missing.
//
// Every memory OPERATION must exist on BOTH surfaces — the CLI (`cmk …`, the
// substrate Claude drives) and the MCP tools (what the model calls in
// conversation per D-85). This guard fails the build when the two drift:
//
//   - a parity op is missing its CLI verb or its MCP tool;
//   - an MCP tool exists with no CLI counterpart (orphan);
//   - a CLI verb is neither a parity op nor an explicitly-declared infra-only
//     command (forces a conscious decision whenever a new verb is added).
//
// Inputs: the CLI subcommand registry (imported — it's plain data) + the MCP
// tool registrations (regex-parsed from source, so no index DB is needed).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');

// The canonical correspondence: a shared memory op ↔ its CLI verb ↔ its MCP
// tool(s). Adding a new shared op means adding a row here + both implementations.
export const PARITY_MAP = {
  remember: { cli: 'remember', mcp: ['mk_remember'] },
  search: { cli: 'search', mcp: ['mk_search'] },
  get: { cli: 'get', mcp: ['mk_get'] },
  timeline: { cli: 'timeline', mcp: ['mk_timeline'] },
  cite: { cli: 'cite', mcp: ['mk_cite'] },
  'recent-activity': { cli: 'recent-activity', mcp: ['mk_recent_activity'] },
  trust: { cli: 'trust', mcp: ['mk_trust'] },
  forget: { cli: 'forget', mcp: ['mk_forget'] },
  // `cmk lessons promote` (a parent verb with a `promote` child) ↔ mk_lessons_promote.
  'lessons promote': { cli: 'lessons', mcp: ['mk_lessons_promote'] },
  // `cmk queue review|conflicts` (interactive walkers) ↔ list + resolve tools.
  queue: { cli: 'queue', mcp: ['mk_queue_list', 'mk_queue_resolve'] },
};

// CLI verbs that are deliberately CLI-ONLY — installation, lifecycle, health,
// and maintenance commands the model has no reason to drive (it doesn't install
// the kit, run health checks, or register cron jobs). Each is a conscious "no
// MCP surface" decision; adding a new CLI verb forces a choice between this set
// and PARITY_MAP (an unclassified verb fails the guard).
export const CLI_ONLY = new Set([
  'install', 'uninstall', 'init-user-tier', 'reindex', 'doctor', 'config',
  'import-anthropic-memory', 'import-claude-md', 'transcripts', 'purge', 'roll', 'repair',
  'daily-distill', 'weekly-curate', 'persona', 'disable-native-memory',
  'enable-native-memory', 'compress', 'register-crons', 'mcp', 'version',
]);

/**
 * Pure parity check. Returns an array of human-readable drift errors (empty =
 * in parity). Separated from IO so it's unit-testable with synthetic inputs.
 *
 * @param {object} a
 * @param {Set<string>} a.cliVerbs   - registered CLI subcommand names.
 * @param {Set<string>} a.mcpTools   - registered MCP tool names.
 * @param {object}      [a.parityMap]
 * @param {Set<string>} [a.cliOnly]
 */
export function checkParity({ cliVerbs, mcpTools, parityMap = PARITY_MAP, cliOnly = CLI_ONLY }) {
  const errors = [];
  const mappedMcp = new Set();
  const mappedCli = new Set();

  // 1. Every parity row has BOTH sides present.
  for (const [op, { cli, mcp }] of Object.entries(parityMap)) {
    mappedCli.add(cli);
    if (!cliVerbs.has(cli)) {
      errors.push(`parity op '${op}': CLI verb '${cli}' is not registered in subcommands.mjs`);
    }
    for (const tool of mcp) {
      mappedMcp.add(tool);
      if (!mcpTools.has(tool)) {
        errors.push(`parity op '${op}': MCP tool '${tool}' is not registered in mcp-server.mjs`);
      }
    }
  }

  // 2. No orphan MCP tool — every registered tool maps to a CLI op.
  for (const tool of mcpTools) {
    if (!mappedMcp.has(tool)) {
      errors.push(
        `MCP tool '${tool}' has no CLI parity entry — add it to PARITY_MAP (with its CLI verb), or justify a deliberate MCP-only exception here`,
      );
    }
  }

  // 3. Every CLI verb is classified — parity OR infra-only. Forces a decision on
  //    every new verb so a memory op can't ship CLI-only by accident.
  for (const verb of cliVerbs) {
    if (!mappedCli.has(verb) && !cliOnly.has(verb)) {
      errors.push(
        `CLI verb '${verb}' is unclassified — add it to PARITY_MAP (with an MCP tool) if the model should be able to do it, or to CLI_ONLY if it is infra/lifecycle`,
      );
    }
  }

  return errors;
}

/** Parse the registered MCP tool names from mcp-server.mjs source. */
export function parseMcpTools(src) {
  return new Set([...src.matchAll(/registerTool\(\s*['"]([a-z_]+)['"]/g)].map((m) => m[1]));
}

async function runCli() {
  const { subcommands } = await import('../packages/cli/src/subcommands.mjs');
  const cliVerbs = new Set(subcommands.map((s) => s.name));
  const mcpTools = parseMcpTools(
    readFileSync(join(REPO, 'packages/cli/src/mcp-server.mjs'), 'utf8'),
  );
  const errors = checkParity({ cliVerbs, mcpTools });
  if (errors.length > 0) {
    console.error('validate-cli-mcp-parity: FAIL');
    for (const e of errors) console.error('  - ' + e);
    process.exit(1);
  }
  console.log(
    `validate-cli-mcp-parity: OK — ${Object.keys(PARITY_MAP).length} parity ops, ${mcpTools.size} MCP tools, ${cliVerbs.size} CLI verbs (all classified)`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runCli();
}
