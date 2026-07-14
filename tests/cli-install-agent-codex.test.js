// @doors: 1, 2, 3
// Door 3: the Codex MCP leg spawns the agent's OWN CLI (`codex mcp add`) — the
//   injectable spawnSync fake asserts argv + the remove call on uninstall.
// Door 4 N/A: no NDJSON/audit emission at this surface (installAgent returns a
//   structured result; the CLI owns the summary lines).
// Door 5 N/A: no message-queue interaction.

// Tests for Task 196 (Codex) — installAgent(codex): the codex-hooks-json
// mechanism + the agent-cli MCP leg.
//
// Codex's hook surface is `.codex/hooks.json` with matcher-GROUP nesting
// (learn.chatgpt.com/docs/hooks, primary-verified 2026-07-12):
//   {"hooks": {"Event": [{"matcher"?, "hooks": [{"type":"command","command"}]}]}}
// — NO top-level version key (unlike Cursor). Every wired event calls ONE
// dispatcher (`cmk codex-hook`); PostToolUse carries an edit-tool matcher and
// PreToolUse a Bash matcher so the kit's hooks fire only where they act.
//
// The MCP leg does NOT write TOML: Codex's MCP config is `~/.codex/config.toml`
// [mcp_servers] — user-level, TOML, and project-level config is trusted-only
// with open Desktop issues (#13025). The kit registers via the agent's own
// `codex mcp add` (live-verified on 0.142.5) — no TOML surgery, no clobber risk.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installAgent, uninstallAgent } from '../packages/cli/src/install-agent.mjs';
import { getAgentProfile } from '../packages/cli/src/agent-profiles.mjs';

let sandbox;
let projectRoot;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-install-codex-'));
  projectRoot = join(sandbox, 'proj');
  mkdirSync(projectRoot, { recursive: true });
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

const codex = () => getAgentProfile('codex');

// A spawnSync fake that records calls and reports success (status 0).
function makeSpawnFake(status = 0) {
  const calls = [];
  const fn = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    return { status, stdout: '', stderr: status === 0 ? '' : 'boom', error: undefined };
  };
  return { calls, fn };
}

describe('Task 196 (Codex) — the profile registers on the seam', () => {
  it('exists, hooks-mcp type, AGENTS.md instruction, codex-hooks-json mechanism', () => {
    const p = codex();
    expect(p).toBeDefined();
    expect(p.integrationType).toBe('hooks-mcp');
    expect(p.instructionFile).toBe('AGENTS.md');
    expect(p.hooks.mechanism).toBe('codex-hooks-json');
    expect(p.hooks.path).toBe('.codex/hooks.json');
    // the abstract→concrete event map, per the primary-verified event list
    expect(p.hooks.eventMap).toEqual({
      sessionStart: 'SessionStart',
      promptSubmit: 'UserPromptSubmit',
      postEdit: 'PostToolUse',
      turnEnd: 'Stop',
      preShell: 'PreToolUse',
    });
    // MCP rides the agent's own CLI, not a JSON config write
    expect(p.mcp.mechanism).toBe('agent-cli');
  });
});

describe('Task 196 (Codex) — installAgent legs', () => {
  it('writes .codex/hooks.json in the matcher-group shape (no version key), one dispatcher command', () => {
    const { calls, fn } = makeSpawnFake();
    const r = installAgent({ projectRoot, profile: codex(), spawnSyncImpl: fn });
    expect(r.action).toBe('installed');

    const hooksPath = join(projectRoot, '.codex', 'hooks.json');
    expect(existsSync(hooksPath)).toBe(true);
    const parsed = JSON.parse(readFileSync(hooksPath, 'utf8'));
    expect(parsed.version).toBeUndefined(); // Codex's file has NO version key
    for (const ev of ['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'Stop', 'PreToolUse']) {
      const groups = parsed.hooks[ev];
      expect(Array.isArray(groups), `missing event ${ev}`).toBe(true);
      const inner = groups[0].hooks;
      expect(Array.isArray(inner)).toBe(true);
      expect(inner[0].type).toBe('command');
      expect(inner[0].command).toContain('cmk codex-hook');
    }
    // scoped matchers: edits on PostToolUse, shell on PreToolUse; none on the rest
    expect(parsed.hooks.PostToolUse[0].matcher).toBe('apply_patch|Edit|Write');
    expect(parsed.hooks.PreToolUse[0].matcher).toBe('Bash');
    expect(parsed.hooks.SessionStart[0].matcher).toBeUndefined();

    // Door 3: MCP registered through the agent's own CLI
    expect(calls).toHaveLength(1);
    const argv = [calls[0].cmd, ...(calls[0].args ?? [])].join(' ');
    expect(argv).toContain('mcp');
    expect(argv).toContain('add');
    expect(argv).toContain('core-memory-kit');
    // the spawn carries a timeout (the spawn-discipline rule)
    expect(calls[0].opts?.timeout).toBeGreaterThan(0);

    // instruction leg: AGENTS.md managed block
    const agentsMd = readFileSync(join(projectRoot, 'AGENTS.md'), 'utf8');
    expect(agentsMd).toContain('<!-- core-memory-kit:start -->');
    expect(agentsMd).toContain('cmk search');
  });

  it('preserves a user’s existing hooks.json siblings (over-mutation guard)', () => {
    mkdirSync(join(projectRoot, '.codex'), { recursive: true });
    writeFileSync(
      join(projectRoot, '.codex', 'hooks.json'),
      JSON.stringify({ hooks: { PreCompact: [{ hooks: [{ type: 'command', command: 'my-own-hook' }] }] } }, null, 2),
      'utf8',
    );
    const { fn } = makeSpawnFake();
    installAgent({ projectRoot, profile: codex(), spawnSyncImpl: fn });
    const parsed = JSON.parse(readFileSync(join(projectRoot, '.codex', 'hooks.json'), 'utf8'));
    expect(parsed.hooks.PreCompact[0].hooks[0].command).toBe('my-own-hook'); // survived
    expect(parsed.hooks.SessionStart[0].hooks[0].command).toContain('cmk codex-hook'); // added
  });

  it('preserves a user group under a COLLIDING event key (skill-review #3 — deepMerge replaces arrays)', () => {
    // The user has their OWN Stop group; Codex's nesting exists precisely for
    // multiple groups per event. An install must APPEND the kit's group, never
    // replace the array.
    mkdirSync(join(projectRoot, '.codex'), { recursive: true });
    writeFileSync(
      join(projectRoot, '.codex', 'hooks.json'),
      JSON.stringify({ hooks: { Stop: [{ matcher: 'x', hooks: [{ type: 'command', command: 'user-stop-hook' }] }] } }, null, 2),
      'utf8',
    );
    const { fn } = makeSpawnFake();
    installAgent({ projectRoot, profile: codex(), spawnSyncImpl: fn });
    const parsed = JSON.parse(readFileSync(join(projectRoot, '.codex', 'hooks.json'), 'utf8'));
    const stopCommands = parsed.hooks.Stop.flatMap((g) => g.hooks.map((h) => h.command));
    expect(stopCommands).toContain('user-stop-hook'); // the user's group survived
    expect(stopCommands.some((c) => c.includes('cmk codex-hook'))).toBe(true); // ours added
    // idempotency: a re-install doesn't duplicate the kit group
    installAgent({ projectRoot, profile: codex(), spawnSyncImpl: fn });
    const again = JSON.parse(readFileSync(join(projectRoot, '.codex', 'hooks.json'), 'utf8'));
    const kitGroups = again.hooks.Stop.filter((g) => g.hooks.some((h) => h.command.includes('cmk codex-hook')));
    expect(kitGroups).toHaveLength(1);
  });

  it('MCP leg degrades to `manual` when the codex CLI is unavailable (install still succeeds)', () => {
    const fn = () => ({ status: null, stdout: '', stderr: '', error: new Error('ENOENT') });
    const r = installAgent({ projectRoot, profile: codex(), spawnSyncImpl: fn });
    expect(r.action).toBe('installed'); // hooks + instruction still land
    expect(r.legs.mcp).toBe('manual');
    // the copy-pasteable fallback rides OUTSIDE legs (a command string inside
    // the leg→action map would leak into the error-path listing)
    expect(r.mcpManualCommand).toContain('codex mcp add core-memory-kit');
    // hooks still wired despite the MCP degrade
    expect(existsSync(join(projectRoot, '.codex', 'hooks.json'))).toBe(true);
  });

  it('is idempotent — a second install reports changed:false on the hooks leg', () => {
    const { fn } = makeSpawnFake();
    installAgent({ projectRoot, profile: codex(), spawnSyncImpl: fn });
    const before = readFileSync(join(projectRoot, '.codex', 'hooks.json'), 'utf8');
    const r2 = installAgent({ projectRoot, profile: codex(), spawnSyncImpl: fn });
    expect(r2.action).toBe('installed');
    expect(readFileSync(join(projectRoot, '.codex', 'hooks.json'), 'utf8')).toBe(before);
  });
});

describe('Task 196 (Codex) — uninstallAgent', () => {
  it('removes our events, keeps the user’s, runs codex mcp remove, strips the AGENTS.md block', () => {
    const { fn } = makeSpawnFake();
    installAgent({ projectRoot, profile: codex(), spawnSyncImpl: fn });
    // add a user event + a user AGENTS.md line to assert byte-preservation
    const hooksPath = join(projectRoot, '.codex', 'hooks.json');
    const parsed = JSON.parse(readFileSync(hooksPath, 'utf8'));
    parsed.hooks.PreCompact = [{ hooks: [{ type: 'command', command: 'user-hook' }] }];
    writeFileSync(hooksPath, JSON.stringify(parsed, null, 2), 'utf8');
    const agentsPath = join(projectRoot, 'AGENTS.md');
    writeFileSync(agentsPath, `# My own notes\n\n${readFileSync(agentsPath, 'utf8')}`, 'utf8');

    const { calls: removeCalls, fn: removeFn } = makeSpawnFake();
    const r = uninstallAgent({ projectRoot, profile: codex(), spawnSyncImpl: removeFn });
    expect(r.action).toBe('uninstalled');

    const after = JSON.parse(readFileSync(hooksPath, 'utf8'));
    for (const ev of ['SessionStart', 'UserPromptSubmit', 'PostToolUse', 'Stop', 'PreToolUse']) {
      expect(after.hooks[ev], `event ${ev} survived uninstall`).toBeUndefined();
    }
    expect(after.hooks.PreCompact[0].hooks[0].command).toBe('user-hook'); // survived

    const mcpArgv = removeCalls.map((c) => [c.cmd, ...(c.args ?? [])].join(' ')).join('\n');
    expect(mcpArgv).toContain('remove');
    expect(mcpArgv).toContain('core-memory-kit');

    const agentsAfter = readFileSync(agentsPath, 'utf8');
    expect(agentsAfter).toContain('# My own notes'); // user content preserved
    expect(agentsAfter).not.toContain('core-memory-kit:start'); // block gone
  });

  it('preserves a user group under a COLLIDING kit event key on uninstall (skill-review #2)', () => {
    const { fn } = makeSpawnFake();
    installAgent({ projectRoot, profile: codex(), spawnSyncImpl: fn });
    // the user adds their OWN group under Stop — a kit event key
    const hooksPath = join(projectRoot, '.codex', 'hooks.json');
    const cfg = JSON.parse(readFileSync(hooksPath, 'utf8'));
    cfg.hooks.Stop.push({ matcher: 'y', hooks: [{ type: 'command', command: 'user-stop-hook' }] });
    writeFileSync(hooksPath, JSON.stringify(cfg, null, 2), 'utf8');

    uninstallAgent({ projectRoot, profile: codex(), spawnSyncImpl: fn });
    const after = JSON.parse(readFileSync(hooksPath, 'utf8'));
    // the kit's Stop group is gone, the user's SURVIVES under the same key
    expect(after.hooks.Stop).toHaveLength(1);
    expect(after.hooks.Stop[0].hooks[0].command).toBe('user-stop-hook');
    // fully-kit events are removed outright
    expect(after.hooks.SessionStart).toBeUndefined();
  });

  it('uninstall on a clean project is a quiet no-op — and NEVER spawns codex mcp remove (the user-level registration is shared)', () => {
    const { calls, fn } = makeSpawnFake();
    const r = uninstallAgent({ projectRoot, profile: codex(), spawnSyncImpl: fn });
    expect(r.action).toBe('uninstalled');
    expect(r.changed).toBe(false);
    // the load-bearing promise (skill-review #7): no project evidence → no
    // spawn — a stray uninstall must not deregister another project's MCP.
    expect(calls).toHaveLength(0);
  });

  it('AGENTS.md alone (the agents-md rung) is NOT codex evidence — no mcp remove (skill-review #7)', () => {
    // A project installed only via --ide agents-md carries the SAME managed
    // block in AGENTS.md; uninstalling codex there must not touch the shared
    // user-level MCP registration.
    writeFileSync(
      join(projectRoot, 'AGENTS.md'),
      '<!-- core-memory-kit:start -->\nkit block\n<!-- core-memory-kit:end -->\n',
      'utf8',
    );
    const { calls, fn } = makeSpawnFake();
    uninstallAgent({ projectRoot, profile: codex(), spawnSyncImpl: fn });
    expect(calls).toHaveLength(0);
  });
});
