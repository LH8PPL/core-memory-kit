// install-agent.mjs — wire a per-agent profile's legs into a project (Task 50.E/50.F).
//
// Given a profile (DATA from agent-profiles.mjs) + a project root, this lands the
// profile's three legs in its DECLARED paths, reusing the kit's shared primitives:
//   - MCP registration → mutateAgentConfig (touch-only-our-keys, refuse-on-parse-error)
//   - hook entry       → mutateAgentConfig (the agent's hook-config file)
//   - instruction file → a managed marker block (byte-preserving install/uninstall)
//
// This is the per-agent path. install.mjs keeps its existing Claude-Code wiring
// for the default `--ide claude-code` route (regression-proof, D-180 / 50.E); this
// module handles the OTHER agents (Kiro first). The kit's core — store, compression,
// search, CLI, MCP server — is identical across agents; only these legs differ.
//
// Public surface:
//   installAgent({ projectRoot, profile }) → { action, agent, changed, legs, errors? }
//   uninstallAgent({ projectRoot, profile }) → { action, agent, changed }

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mutateAgentConfig, atomicWrite } from './mutate-agent-config.mjs';
import {
  removeJsonKey,
  pruneEmptyParent,
  escapeRe,
  trimLeadingNewlines,
  trimTrailingNewlines,
} from './managed-block.mjs';

// The kit's MCP server entry — same shape settings-hooks.mjs writes for Claude
// Code (`cmk mcp serve` over stdio). Agent-neutral: every agent registers the
// same server; only the FILE it goes in differs (profile.mcp.path).
const MCP_ENTRY = Object.freeze({ type: 'stdio', command: 'cmk', args: ['mcp', 'serve'] });
const MCP_SERVER_NAME = 'claude-memory-kit';

// The kit's lifecycle-hook commands, keyed by the ABSTRACT event the profile's
// eventMap translates to the agent's concrete event name. Only the events an
// agent supports (present in its eventMap) get wired.
const HOOK_COMMANDS = Object.freeze({
  sessionStart: 'cmk-inject-context',
  promptSubmit: 'cmk-capture-prompt',
  postEdit: 'cmk-observe-edit',
  turnEnd: 'cmk-capture-turn',
  sessionEnd: 'cmk-compress-session',
});

// Steering / instruction-file body. Kiro reads `inclusion: always` frontmatter
// to keep this in context every session (kiro.dev primary-verified). The body is
// intentionally short — it points the agent at the kit's recall surface; the rich
// memory lives in context/.
const INSTRUCTION_BODY = [
  '# claude-memory-kit',
  '',
  'This project uses claude-memory-kit for durable, in-repo memory across sessions.',
  'Recall before re-deriving: run `cmk search "<topic>"` for prior decisions, preferences,',
  'and project facts; the curated tiers live under `context/`. Capture durable facts with',
  '`cmk remember` — never hand-edit the memory files.',
].join('\n');

const MARK_START = '<!-- claude-memory-kit:start -->';
const MARK_END = '<!-- claude-memory-kit:end -->';

export function installAgent({ projectRoot, profile }) {
  if (!projectRoot) throw new Error('installAgent: projectRoot is required');
  if (!profile || !profile.name) throw new Error('installAgent: a profile is required');

  const legs = {};
  const errors = [];
  let changed = false;

  // ── MCP leg ───────────────────────────────────────────────────────────────
  if (profile.mcp) {
    const r = mutateAgentConfig({
      path: join(projectRoot, profile.mcp.path),
      format: 'json',
      keyPath: [profile.mcp.serversKey, MCP_SERVER_NAME],
      entry: MCP_ENTRY,
    });
    legs.mcp = r.action;
    if (r.action === 'error') errors.push({ leg: 'mcp', ...r });
    else if (r.changed) changed = true;
  }

  // ── hooks leg ───────────────────────────────────────────────────────────────
  // Only if MCP didn't already error (refuse-to-clobber means a corrupt config
  // should halt this agent's install — report, don't push past it).
  if (profile.hooks && errors.length === 0) {
    const hookEntry = buildHookEntry(profile);
    const r = mutateAgentConfig({
      path: join(projectRoot, profile.hooks.path),
      format: 'json',
      keyPath: ['hooks'],
      entry: hookEntry,
    });
    legs.hooks = r.action;
    if (r.action === 'error') errors.push({ leg: 'hooks', ...r });
    else if (r.changed) changed = true;
  }

  // ── instruction leg (managed marker block) ──────────────────────────────────
  if (errors.length === 0) {
    const instrPath = join(projectRoot, profile.instructionFile);
    const r = writeInstructionFile(instrPath, profile);
    legs.instruction = r.action;
    if (r.changed) changed = true;
  }

  if (errors.length > 0) {
    return { action: 'error', agent: profile.name, changed, legs, errors };
  }
  return { action: 'installed', agent: profile.name, changed, legs };
}

export function uninstallAgent({ projectRoot, profile }) {
  if (!projectRoot) throw new Error('uninstallAgent: projectRoot is required');
  if (!profile || !profile.name) throw new Error('uninstallAgent: a profile is required');

  let changed = false;

  // MCP: remove only our server key, preserve siblings.
  if (profile.mcp) {
    const p = join(projectRoot, profile.mcp.path);
    if (removeJsonKey(p, [profile.mcp.serversKey, MCP_SERVER_NAME])) changed = true;
    // prune an emptied servers object we leave behind (no kit-shaped residue).
    pruneEmptyParent(p, [profile.mcp.serversKey]);
  }
  // hooks: remove ONLY the event keys WE wrote (symmetry with the MCP leg —
  // remove our keys, preserve any the user added to the same `hooks` object).
  // This is safe even if a future profile points hooks.path at a shared file.
  if (profile.hooks) {
    const p = join(projectRoot, profile.hooks.path);
    const ourEvents = Object.keys(buildHookEntry(profile));
    for (const ev of ourEvents) {
      if (removeJsonKey(p, ['hooks', ev])) changed = true;
    }
    // prune an emptied `hooks` object we leave behind (no residue).
    pruneEmptyParent(p, ['hooks']);
  }
  // instruction: strip our marker block, byte-preserve the rest.
  const instrPath = join(projectRoot, profile.instructionFile);
  if (removeInstructionBlock(instrPath)) changed = true;

  return { action: 'uninstalled', agent: profile.name, changed };
}

// ── internal helpers ───────────────────────────────────────────────────────

// Build the agent's hook object: { <concreteEvent>: [ {command} ] } for each
// abstract event the profile maps + the kit has a command for.
function buildHookEntry(profile) {
  const hooks = {};
  for (const [abstractEvent, concreteEvent] of Object.entries(profile.hooks.eventMap)) {
    const command = HOOK_COMMANDS[abstractEvent];
    if (command) hooks[concreteEvent] = [{ command }];
  }
  return hooks;
}

// Write the instruction file with a managed marker block + agent-specific
// frontmatter (Kiro wants `inclusion: always`). Idempotent: re-writing identical
// content reports changed:false.
function writeInstructionFile(path, profile) {
  const frontmatter = needsInclusionFrontmatter(profile) ? '---\ninclusion: always\n---\n\n' : '';
  const block = `${MARK_START}\n${INSTRUCTION_BODY}\n${MARK_END}`;
  const desired = `${frontmatter}${block}\n`;

  let existing = '';
  if (existsSync(path)) existing = readFileSync(path, 'utf8');

  let next;
  if (existing === '') {
    next = desired;
  } else if (existing.includes(MARK_START) && existing.includes(MARK_END)) {
    // refresh in place — replace only the managed block, byte-preserve the rest.
    next = existing.replace(
      new RegExp(`${escapeRe(MARK_START)}[\\s\\S]*?${escapeRe(MARK_END)}`),
      block,
    );
  } else {
    // append our block to the user's existing file.
    next = `${trimTrailingNewlines(existing)}\n\n${block}\n`;
  }

  if (next === existing) return { action: 'unchanged', changed: false };
  atomicWrite(path, next);
  return { action: existing === '' ? 'created' : 'updated', changed: true };
}

function removeInstructionBlock(path) {
  if (!existsSync(path)) return false;
  const existing = readFileSync(path, 'utf8');
  if (!existing.includes(MARK_START)) return false;
  // Strip our block (+ surrounding blank lines). The inner [\s\S]*? is lazy +
  // bounded by two fixed literal delimiters (no nested quantifier) → linear, not
  // ReDoS-prone. The newline trims are done WITHOUT regex (no `\n*$`/`^\n+`
  // super-linear shapes) — see trimLeadingNewlines/trimTrailingNewlines.
  const blockRe = new RegExp(`${escapeRe(MARK_START)}[\\s\\S]*?${escapeRe(MARK_END)}`);
  const withoutBlock = existing.replace(blockRe, '');
  const stripped = trimLeadingNewlines(collapseBlankRun(withoutBlock));
  atomicWrite(path, stripped);
  return true;
}

// removeJsonKey / pruneEmptyParent / escapeRe / trim{Leading,Trailing}Newlines
// are now shared from managed-block.mjs (deduped — the kit's shared-module
// discipline; install-kiro.mjs uses the same source).

function needsInclusionFrontmatter(profile) {
  // Kiro steering files use `inclusion: always`. Driven by the profile's
  // instruction path living under a steering dir — kept simple for v0.4.0
  // (only Kiro needs it); generalize when a second steering-style agent lands.
  return profile.instructionFile.includes('/steering/') || profile.name === 'kiro';
}

// Collapse a run of 2+ blank lines left where our block was removed into a
// single newline, so an uninstall doesn't leave a widening gap.
function collapseBlankRun(s) {
  // split on newlines, drop empty segments created by the removed block's
  // surrounding blanks, rejoin — no regex, no backtracking.
  return s.replace(/\n{3,}/g, '\n\n');
}
