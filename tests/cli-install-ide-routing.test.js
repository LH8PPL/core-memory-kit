// @doors: 1, 2
// Door 3 N/A: routing calls installAction + installAgent in-process; no spawn.
// Door 4 N/A: the install summary is logged via injected loggers (asserted via
//   Door 1), no NDJSON/audit surface here.
// Door 5 N/A: no message-queue interaction.

// Tests for Task 50.F — `cmk install --ide <agent>` routing (the glue in
// runInstall that dispatches a non-Claude-Code agent to installAgent).
//
// Asserts: default claude-code is unchanged (no .kiro), --ide kiro wires the
// agent's legs end-to-end, and an unknown agent fails friendly (exit 2).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInstall, runUninstall } from '../packages/cli/src/subcommands.mjs';

let sandbox;
let projectRoot;
let userTier;
let logs;
let errs;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-ide-routing-'));
  projectRoot = join(sandbox, 'proj');
  userTier = join(sandbox, 'user');
  mkdirSync(projectRoot, { recursive: true });
  logs = [];
  errs = [];
  process.exitCode = 0;
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
  process.exitCode = 0;
});

const opts = (extra) => ({
  cwd: projectRoot,
  userTier,
  awsDir: join(sandbox, 'aws'), // sandbox the Kiro CLI-agent (~/.aws) leg — NEVER the real home
  semantic: false, // --no-semantic, keep the test offline + fast
  bindingProbe: () => ({ ok: true }), // skip the native-binding ask
  log: (m) => logs.push(m),
  logError: (m) => errs.push(m),
  ...extra,
});

describe('Task 50.F — cmk install --ide routing', () => {
  it('default (no --ide) takes the claude-code path: no .kiro, context/ + .claude/skills/ scaffolded', async () => {
    await runInstall(opts({ hooks: false }));
    expect(existsSync(join(projectRoot, '.kiro'))).toBe(false);
    expect(existsSync(join(projectRoot, 'context', 'MEMORY.md'))).toBe(true);
    // the Claude-Code skills DO ship on the default path (regression guard for
    // the --ide-kiro skip: we must not break Claude Code's skills)
    expect(existsSync(join(projectRoot, '.claude', 'skills', 'memory-write', 'SKILL.md'))).toBe(true);
  });

  it('--ide kiro wires all FOUR surfaces end-to-end in one call (D-182 rework)', async () => {
    await runInstall(opts({ ide: 'kiro' }));

    // Door 2 — State: the four verified Kiro surfaces landed (MCP + steering +
    // skills + IDE hooks). The D-182 rework replaced the old (wrong)
    // .kiro/agents/cmk.json hook approach with the IDE .kiro.hook surface.
    expect(existsSync(join(projectRoot, '.kiro', 'settings', 'mcp.json'))).toBe(true);
    expect(existsSync(join(projectRoot, '.kiro', 'steering', 'cmk.md'))).toBe(true);
    expect(existsSync(join(projectRoot, '.kiro', 'skills', 'memory-search', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(projectRoot, '.kiro', 'hooks', 'cmk-capture.kiro.hook'))).toBe(true);
    // the agent-neutral scaffold also ran
    expect(existsSync(join(projectRoot, 'context', 'MEMORY.md'))).toBe(true);

    // A Kiro install must NOT leak the Claude-Code-only `.claude/skills/` —
    // the skills belong in `.kiro/skills/` (asserted above). The agent-neutral
    // scaffold used to copy `.claude/skills/` unconditionally, so a Kiro user
    // got a dead Claude skills dir alongside the real Kiro one (cut-gate find).
    expect(existsSync(join(projectRoot, '.claude', 'skills'))).toBe(false);

    // Door 1 — Response: success message names the agent
    expect(logs.join('\n')).toMatch(/ready for Kiro/i);
    expect(process.exitCode).not.toBe(1);
  });

  it('an unknown --ide fails friendly with exit 2 and a supported list', async () => {
    await runInstall(opts({ ide: 'made-up-agent' }));
    expect(process.exitCode).toBe(2);
    expect(errs.join('\n')).toMatch(/unknown --ide 'made-up-agent'/);
    expect(errs.join('\n')).toMatch(/claude-code, kiro/);
    // nothing wired
    expect(existsSync(join(projectRoot, '.kiro'))).toBe(false);
  });

  it('--ide kiro writes AGENTS.md but NOT CLAUDE.md (Kiro reads AGENTS.md; D-188)', async () => {
    await runInstall(opts({ ide: 'kiro' }));
    expect(existsSync(join(projectRoot, 'AGENTS.md'))).toBe(true); // Kiro's instruction file
    expect(existsSync(join(projectRoot, 'CLAUDE.md'))).toBe(false); // not the Claude one
  });
});

// D-188: a project can carry BOTH agents (two people, or one switching tools on
// the same repo). The installs are additive overlays — each writes ONLY its own
// surface and never clobbers the other's; the shared context/ brain is reused.
describe('Task 50 — dual-agent coexistence (D-188)', () => {
  it('Claude Code then Kiro: the second install leaves the .claude surface BYTE-intact', async () => {
    await runInstall(opts({ hooks: false })); // claude-code first
    const claudeMdPath = join(projectRoot, 'CLAUDE.md');
    expect(existsSync(claudeMdPath)).toBe(true);
    expect(existsSync(join(projectRoot, '.claude', 'skills', 'memory-write', 'SKILL.md'))).toBe(true);
    // append a user sentinel OUTSIDE the kit markers — must survive verbatim
    const before = readFileSync(claudeMdPath, 'utf8') + '\n<!-- my own note: do not touch -->\n';
    writeFileSync(claudeMdPath, before, 'utf8');

    await runInstall(opts({ ide: 'kiro' })); // add Kiro
    // Claude surface survives byte-for-byte (the kiro install never opened it)
    expect(readFileSync(claudeMdPath, 'utf8')).toBe(before);
    expect(existsSync(join(projectRoot, '.claude', 'skills', 'memory-write', 'SKILL.md'))).toBe(true);
    // Kiro surface added
    expect(existsSync(join(projectRoot, '.kiro', 'hooks', 'cmk-capture.kiro.hook'))).toBe(true);
    expect(existsSync(join(projectRoot, 'AGENTS.md'))).toBe(true);
  });

  it('Kiro then Claude Code: the second install leaves the .kiro surface intact', async () => {
    await runInstall(opts({ ide: 'kiro' })); // kiro first
    expect(existsSync(join(projectRoot, '.kiro', 'hooks', 'cmk-capture.kiro.hook'))).toBe(true);

    await runInstall(opts({ hooks: false })); // add claude-code
    // Kiro surface survives
    expect(existsSync(join(projectRoot, '.kiro', 'hooks', 'cmk-capture.kiro.hook'))).toBe(true);
    expect(existsSync(join(projectRoot, 'AGENTS.md'))).toBe(true);
    // Claude surface added
    expect(existsSync(join(projectRoot, 'CLAUDE.md'))).toBe(true);
  });

  it('a later second-agent install does NOT downgrade an existing hybrid setting (shared context/)', async () => {
    // First agent (claude-code) scaffolds context/, then we set hybrid directly
    // (the state --with-semantic would leave — pre-seeded here to avoid the
    // real embedder import, which is slow + flaky under the full suite).
    await runInstall(opts({ hooks: false }));
    const settingsPath = join(projectRoot, 'context', 'settings.json');
    writeFileSync(settingsPath, JSON.stringify({ search: { default_mode: 'hybrid' } }), 'utf8');

    // add Kiro with NO semantic flag (the real second-agent install — neither
    // --with-semantic nor --no-semantic) → the shared hybrid setting is left
    // untouched, NOT reset to keyword (the D-188 shared-brain composition).
    await runInstall(opts({ ide: 'kiro', semantic: undefined }));
    expect(JSON.parse(readFileSync(settingsPath, 'utf8')).search.default_mode).toBe('hybrid');
  });

  it('cmk uninstall --ide kiro removes ONLY the Kiro surface, preserves .claude + context/', async () => {
    await runInstall(opts({ hooks: false })); // claude-code
    await runInstall(opts({ ide: 'kiro' })); // + kiro
    mkdirSync(join(projectRoot, 'context'), { recursive: true });
    writeFileSync(join(projectRoot, 'context', 'MEMORY.md'), '# brain\n', 'utf8');

    runUninstall(opts({ ide: 'kiro' }));

    // Kiro surface gone
    expect(existsSync(join(projectRoot, '.kiro', 'hooks', 'cmk-capture.kiro.hook'))).toBe(false);
    // Claude surface + shared brain preserved
    expect(existsSync(join(projectRoot, 'CLAUDE.md'))).toBe(true);
    expect(existsSync(join(projectRoot, 'context', 'MEMORY.md'))).toBe(true);
  });

  it('cmk uninstall (default, no --ide) removes the Claude Code CLAUDE.md block, preserves .kiro', async () => {
    await runInstall(opts({ hooks: false })); // claude-code
    await runInstall(opts({ ide: 'kiro' })); // + kiro
    expect(existsSync(join(projectRoot, 'CLAUDE.md'))).toBe(true);

    runUninstall(opts({})); // default → claude-code surface

    // the kit-managed CLAUDE.md block is stripped (the file may remain if it had
    // other content, but our markers are gone)
    const claudeMd = join(projectRoot, 'CLAUDE.md');
    if (existsSync(claudeMd)) {
      expect(readFileSync(claudeMd, 'utf8')).not.toMatch(/core-memory-kit:start/);
    }
    // Kiro surface untouched
    expect(existsSync(join(projectRoot, '.kiro', 'hooks', 'cmk-capture.kiro.hook'))).toBe(true);
  });

  it('cmk uninstall --ide <unknown> → exit 2 with a supported list, removes nothing', () => {
    runUninstall(opts({ ide: 'made-up' }));
    expect(process.exitCode).toBe(2);
    expect(errs.join('\n')).toMatch(/unknown --ide 'made-up'/);
    expect(errs.join('\n')).toMatch(/claude-code, kiro/);
  });

  it('cmk uninstall --ide kiro on a fresh project reports nothing to remove (no crash)', () => {
    runUninstall(opts({ ide: 'kiro' })); // never installed
    expect(process.exitCode).not.toBe(2);
    expect(logs.join('\n')).toMatch(/nothing to remove|Kiro/i);
  });
});

// Task 196 — Cursor rides the GENERIC per-profile route (no bespoke
// orchestrator like Kiro's): scaffold + installAgent(cursor) in one call.
describe('Task 196 — cmk install --ide cursor routing', () => {
  it('--ide cursor wires all three legs end-to-end in one call', async () => {
    await runInstall(opts({ ide: 'cursor' }));

    // Door 2 — State: the three primary-verified Cursor surfaces
    expect(existsSync(join(projectRoot, '.cursor', 'mcp.json'))).toBe(true);
    const hooksCfg = JSON.parse(readFileSync(join(projectRoot, '.cursor', 'hooks.json'), 'utf8'));
    expect(hooksCfg.version).toBe(1);
    expect(hooksCfg.hooks.sessionStart[0].command).toMatch(/cmk cursor-hook$/);
    expect(existsSync(join(projectRoot, '.cursor', 'rules', 'core-memory-kit.mdc'))).toBe(true);
    // the agent-neutral scaffold also ran
    expect(existsSync(join(projectRoot, 'context', 'MEMORY.md'))).toBe(true);
    // no Claude-Code-only or Kiro surfaces leak
    expect(existsSync(join(projectRoot, '.claude', 'skills'))).toBe(false);
    expect(existsSync(join(projectRoot, '.kiro'))).toBe(false);

    // Door 1 — Response: success names the agent + the wired legs
    expect(logs.join('\n')).toMatch(/ready for Cursor/i);
    expect(process.exitCode).not.toBe(1);
  });

  it('cmk uninstall --ide cursor strips the kit surface, preserves the rest', async () => {
    await runInstall(opts({ ide: 'cursor' }));
    runUninstall(opts({ ide: 'cursor' }));
    expect(process.exitCode).not.toBe(2);

    const hooksCfg = JSON.parse(readFileSync(join(projectRoot, '.cursor', 'hooks.json'), 'utf8'));
    expect(hooksCfg.hooks?.sessionStart).toBeUndefined();
    const mcp = JSON.parse(readFileSync(join(projectRoot, '.cursor', 'mcp.json'), 'utf8'));
    expect(mcp.mcpServers?.['core-memory-kit']).toBeUndefined();
    // context/ is sacred — never touched by uninstall
    expect(existsSync(join(projectRoot, 'context', 'MEMORY.md'))).toBe(true);
  });

  it('Claude Code + Cursor coexist — the second install leaves the first surface intact (D-188)', async () => {
    await runInstall(opts({ hooks: false })); // claude-code first
    const claudeMdPath = join(projectRoot, 'CLAUDE.md');
    const before = readFileSync(claudeMdPath, 'utf8');

    await runInstall(opts({ ide: 'cursor' })); // add cursor
    expect(readFileSync(claudeMdPath, 'utf8')).toBe(before);
    expect(existsSync(join(projectRoot, '.cursor', 'hooks.json'))).toBe(true);
    expect(existsSync(join(projectRoot, '.claude', 'skills', 'memory-write', 'SKILL.md'))).toBe(true);
  });
});
