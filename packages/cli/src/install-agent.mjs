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

import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { spawnSync as defaultSpawnSync } from 'node:child_process';
import { join } from 'node:path';
import { mutateAgentConfig, atomicWrite } from './mutate-agent-config.mjs';
import { cursorHookCommand, codexHookCommand } from './kiro-hook-command.mjs';
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

export function installAgent({ projectRoot, profile, spawnSyncImpl = defaultSpawnSync }) {
  if (!projectRoot) throw new Error('installAgent: projectRoot is required');
  if (!profile || !profile.name) throw new Error('installAgent: a profile is required');

  const legs = {};
  const errors = [];
  let changed = false;

  // ── MCP leg ───────────────────────────────────────────────────────────────
  if (profile.mcp && profile.mcp.mechanism === 'agent-cli') {
    // Codex-class agents keep MCP config in TOML the kit must not hand-edit
    // (parse/serialize risk = the clobber class mutateAgentConfig exists to
    // prevent, but for a format it doesn't speak). Register through the agent's
    // OWN CLI instead (`codex mcp add`, live-verified 0.142.5). A spawn failure
    // is NOT a clobber hazard — degrade to `manual` (the CLI layer prints the
    // one-liner) and keep installing the other legs.
    const r = runAgentCliMcp(profile, 'addArgs', spawnSyncImpl);
    legs.mcp = r.ok ? 'configured' : 'manual';
    if (!r.ok) legs.mcpManualCommand = agentCliManualCommand(profile, 'addArgs');
    else changed = true;
  } else if (profile.mcp) {
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
    const hooksPath = join(projectRoot, profile.hooks.path);
    // hooks-json (Cursor): the file's documented shape carries a REQUIRED
    // top-level `version` alongside `hooks`. mutateAgentConfig only owns the
    // keyPath slot, so seed a fresh file with the full shape; an EXISTING file
    // is the user's (their version field is theirs — touch only our keys).
    if (profile.hooks.mechanism === 'hooks-json' && !existsSync(hooksPath)) {
      atomicWrite(hooksPath, `${JSON.stringify({ version: 1, hooks: {} }, null, 2)}\n`);
    }
    // codex-hooks-json: same dedicated-file idea, but Codex's documented shape
    // has NO version key — seed just the hooks object.
    if (profile.hooks.mechanism === 'codex-hooks-json' && !existsSync(hooksPath)) {
      atomicWrite(hooksPath, `${JSON.stringify({ hooks: {} }, null, 2)}\n`);
    }
    const r = mutateAgentConfig({
      path: hooksPath,
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

export function uninstallAgent({ projectRoot, profile, spawnSyncImpl = defaultSpawnSync }) {
  if (!projectRoot) throw new Error('uninstallAgent: projectRoot is required');
  if (!profile || !profile.name) throw new Error('uninstallAgent: a profile is required');

  let changed = false;

  // MCP: remove only our server key, preserve siblings.
  if (profile.mcp && profile.mcp.mechanism === 'agent-cli') {
    // symmetry with the install leg: deregister through the agent's own CLI,
    // best-effort (a missing binary just leaves the user-level entry; the
    // uninstall of the PROJECT surfaces below still completes). The agent-cli
    // registration is USER-level, so gate on project-side EVIDENCE of a kit
    // install (our dispatcher in the hooks file / our instruction block) — an
    // uninstall on a never-installed project must stay a quiet no-op, not a
    // stray deregistration of another project's working setup.
    if (hasAgentInstallEvidence(projectRoot, profile)) {
      const r = runAgentCliMcp(profile, 'removeArgs', spawnSyncImpl);
      if (r.ok) changed = true;
    }
  } else if (profile.mcp) {
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
  // instruction: strip our marker block, byte-preserve the rest — then, if the
  // remainder is ONLY the frontmatter the kit itself wrote (nothing of the
  // user's), delete the file: a frontmatter-only `.mdc` is an always-applied
  // EMPTY rule, kit-shaped residue (the Task-196 live-test find).
  const instrPath = join(projectRoot, profile.instructionFile);
  if (removeInstructionBlock(instrPath)) changed = true;
  if (removeKitOnlyInstructionResidue(instrPath, profile)) changed = true;

  return { action: 'uninstalled', agent: profile.name, changed };
}

// ── internal helpers ───────────────────────────────────────────────────────

// Build the agent's hook object: { <concreteEvent>: [ {command} ] } for each
// abstract event the profile maps + the kit has a command for.
//
// hooks-json (Cursor) is the exception: EVERY mapped event (including preShell,
// which has no per-event bin) calls the ONE dispatcher command — the event
// rides in the payload's hook_event_name, and the dispatcher routes.
function buildHookEntry(profile) {
  const hooks = {};
  if (profile.hooks.mechanism === 'hooks-json') {
    const command = cursorHookCommand();
    for (const concreteEvent of Object.values(profile.hooks.eventMap)) {
      hooks[concreteEvent] = [{ command }];
    }
    return hooks;
  }
  if (profile.hooks.mechanism === 'codex-hooks-json') {
    // Codex's matcher-GROUP nesting (primary-verified 2026-07-12):
    //   {<Event>: [{matcher?, hooks: [{type:'command', command}]}]}
    // One dispatcher command for every event (hook_event_name rides in the
    // payload); per-abstract-event matchers come from the profile DATA so the
    // kit's hooks fire only where they act (edits / shell).
    const command = codexHookCommand();
    const matchers = profile.hooks.matchers ?? {};
    for (const [abstractEvent, concreteEvent] of Object.entries(profile.hooks.eventMap)) {
      const matcher = matchers[abstractEvent];
      hooks[concreteEvent] = [
        { ...(matcher ? { matcher } : {}), hooks: [{ type: 'command', command }] },
      ];
    }
    return hooks;
  }
  for (const [abstractEvent, concreteEvent] of Object.entries(profile.hooks.eventMap)) {
    const command = HOOK_COMMANDS[abstractEvent];
    if (command) hooks[concreteEvent] = [{ command }];
  }
  return hooks;
}

// ── agent-cli MCP helpers (Codex class) ─────────────────────────────────────

// How long a `codex mcp add/remove` may take before the install stops waiting.
// The op is a local config write by the agent's CLI — seconds, not minutes.
const AGENT_CLI_MCP_TIMEOUT_MS = 15_000;

// Run the profile's declared agent-CLI MCP registration, platform-correct.
// Windows routes through `cmd.exe /c` so an npm `.cmd` shim resolves (the same
// class as the hook commands — spawnSync of a bare `.cmd` name fails without a
// shell). Argv is fixed profile DATA (no user input) — no injection surface.
function runAgentCliMcp(profile, argsKey, spawnSyncImpl) {
  const cli = profile.mcp?.cli;
  const args = cli?.[argsKey];
  if (!cli?.bin || !Array.isArray(args)) return { ok: false };
  const isWindows = process.platform === 'win32';
  // platform-commands: ignore — the cmd.exe wrap targets the INSTALL host's own
  // shell resolution for the agent's .cmd shim, keyed on process.platform.
  const cmd = isWindows ? 'cmd.exe' : cli.bin;
  const argv = isWindows ? ['/c', cli.bin, ...args] : args;
  try {
    const r = spawnSyncImpl(cmd, argv, {
      timeout: AGENT_CLI_MCP_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    return { ok: !r.error && r.status === 0 };
  } catch {
    return { ok: false };
  }
}

// The copy-pasteable fallback when the agent CLI wasn't reachable at install
// time (e.g. the Codex DESKTOP app bundles the binary off-PATH).
function agentCliManualCommand(profile, argsKey) {
  const cli = profile.mcp?.cli;
  if (!cli?.bin) return '';
  return [cli.bin, ...(cli[argsKey] ?? [])].join(' ');
}

// Project-side evidence that THIS project had a kit install for the profile's
// agent: our dispatcher in its hooks file, or our managed instruction block.
function hasAgentInstallEvidence(projectRoot, profile) {
  try {
    if (profile.hooks) {
      const hooksPath = join(projectRoot, profile.hooks.path);
      if (existsSync(hooksPath) && readFileSync(hooksPath, 'utf8').includes('cmk ')) return true;
    }
    const instrPath = join(projectRoot, profile.instructionFile);
    if (existsSync(instrPath) && readFileSync(instrPath, 'utf8').includes(MARK_START)) return true;
  } catch {
    // unreadable file → treat as no evidence (quiet no-op)
  }
  return false;
}

// Write the instruction file with a managed marker block + agent-specific
// frontmatter (Kiro wants `inclusion: always`). Idempotent: re-writing identical
// content reports changed:false.
function writeInstructionFile(path, profile) {
  // Data-driven frontmatter (Task 196): a profile declares its instruction
  // file's frontmatter lines (Cursor's .mdc needs `alwaysApply: true`). The
  // Kiro steering heuristic below predates the field and stays for back-compat.
  const frontmatter = profile.instructionFrontmatter
    ? `---\n${profile.instructionFrontmatter}\n---\n\n`
    : needsInclusionFrontmatter(profile)
      ? '---\ninclusion: always\n---\n\n'
      : '';
  const block = `${MARK_START}\n${INSTRUCTION_BODY}\n${MARK_END}`;
  const desired = `${frontmatter}${block}\n`;

  let existing = '';
  if (existsSync(path)) existing = readFileSync(path, 'utf8');

  let next;
  if (existing === '') {
    next = desired;
  } else if (existing.includes(MARK_START) && existing.includes(MARK_END)) {
    // refresh in place — byte-preserve everything outside the managed block.
    // Task 220 (D-322): GLOBAL match — a duplicated block (copy-paste / merge
    // kept both sides) folds into the single refreshed one instead of leaving
    // a permanently-stale orphan the old first-match-only replace never saw.
    let first = true;
    let foldedDuplicate = false;
    next = existing.replace(
      new RegExp(`${escapeRe(MARK_START)}[\\s\\S]*?${escapeRe(MARK_END)}`, 'g'),
      () => {
        if (first) {
          first = false;
          return block;
        }
        foldedDuplicate = true;
        return '';
      },
    );
    // Collapse the blank gap ONLY when a duplicate was actually removed — on
    // the normal single-block refresh the file outside our markers must stay
    // byte-identical (collapsing a user's own 3+ blank-line run would both
    // mutate their content and break the `next === existing` idempotency).
    if (foldedDuplicate) next = collapseBlankRun(next);
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
  // Task 220 (D-322): GLOBAL — uninstall removes EVERY managed block, not just
  // the first (a duplicate must not survive the clean-removal contract).
  const blockRe = new RegExp(`${escapeRe(MARK_START)}[\\s\\S]*?${escapeRe(MARK_END)}`, 'g');
  const withoutBlock = existing.replace(blockRe, '');
  const stripped = trimLeadingNewlines(collapseBlankRun(withoutBlock));
  atomicWrite(path, stripped);
  return true;
}

// removeJsonKey / pruneEmptyParent / escapeRe / trim{Leading,Trailing}Newlines
// are now shared from managed-block.mjs (deduped — the kit's shared-module
// discipline; install-kiro.mjs uses the same source).

// After the managed block is stripped, a file whose remaining content is only
// the kit-authored frontmatter (or nothing at all) carries zero user content —
// remove it so an uninstall leaves no kit-shaped file behind. Anything else
// (a user's own lines outside our markers) keeps the file.
function removeKitOnlyInstructionResidue(path, profile) {
  if (!existsSync(path)) return false;
  // Normalize CRLF → LF before the compare: a Windows editor / git autocrlf
  // rewrites the kit's `\n`-authored frontmatter to `\r\n`, which would else
  // never match and leave the empty always-applied .mdc behind (the exact
  // residue this exists to remove — skill-review #2). Compares fail SAFE either
  // way (a mismatch keeps the file), so normalizing only widens correct deletes.
  const left = readFileSync(path, 'utf8').replace(/\r\n/g, '\n').trim();
  const kitFrontmatter = profile.instructionFrontmatter
    ? `---\n${profile.instructionFrontmatter}\n---`
    : needsInclusionFrontmatter(profile)
      ? '---\ninclusion: always\n---'
      : '';
  if (left === '' || left === kitFrontmatter) {
    unlinkSync(path);
    return true;
  }
  return false;
}

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
