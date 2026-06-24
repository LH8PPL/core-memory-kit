// @doors: 1, 2
// Door 3 N/A: writes agent-config + settings JSON; no subprocess spawn.
// Door 4 N/A: no NDJSON/audit surface at this leg.
// Door 5 N/A: no message-queue interaction.

// Tests for Task 50.L — the Kiro CLI agent-config + guarded default-agent.
//
// Kiro CLI (= Amazon Q Developer CLI) hooks live in an agent-config JSON
// (.amazonq/cli-agents/<name>.json), and auto-fire ONLY for the resolved-active
// agent — so the kit must register cmk as the DEFAULT agent (D-182). The shape
// is the authoritative Rust contract (5 triggers, camelCase, timeout_ms), NOT
// the stale agent-v1.json. Reuses the same `cmk hook <event>` dispatcher as the
// IDE surface + Claude Code. Default registration is GUARDED — never clobbers a
// user's existing default agent.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installKiroCliAgent, uninstallKiroCliAgent } from '../packages/cli/src/kiro-cli-agent.mjs';

let sandbox;
let kiroDir;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-kiro-cli-'));
  kiroDir = join(sandbox, 'kiro'); // the ~/.kiro base (sandboxed)
  mkdirSync(kiroDir, { recursive: true });
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

// D-198: the kit's kiro-cli agent lives at ~/.kiro/agents/cmk.json + the default
// is registered in ~/.kiro/settings/cli.json — NOT ~/.aws/amazonq/cli-agents/
// (the wrong location kiro-cli 2.8.1 never loads). Tests pass kiroDir as the base.
const agentPath = () => join(kiroDir, 'agents', 'cmk.json');
const settingsPath = () => join(kiroDir, 'settings', 'cli.json');

describe('Task 50.L — Kiro CLI agent-config + default-agent', () => {
  describe('fresh install (no existing default)', () => {
    it('writes ~/.kiro/agents/cmk.json with the hook shape + registers the default (D-198)', () => {
      const r = installKiroCliAgent({ kiroDir });
      expect(r.action).toBe('installed');
      expect(existsSync(agentPath())).toBe(true);

      const agent = JSON.parse(readFileSync(agentPath(), 'utf8'));
      // hooks: object keyed by trigger → array of {command, timeout_ms}
      expect(agent.hooks.agentSpawn[0].command).toMatch(/cmk hook agentSpawn/);
      expect(agent.hooks.stop[0].command).toMatch(/cmk hook stop/);
      expect(typeof agent.hooks.stop[0].timeout_ms).toBe('number'); // NOT `timeout`
      // preToolUse delete-guardrail matcher is the kiro-cli literal '*' (all tools);
      // kiro-cli matchers are literal strings (D-197), never a pipe-alternation.
      expect(agent.hooks.preToolUse[0].matcher).toBe('*');
      expect(agent.hooks.preToolUse[0].matcher).not.toContain('|');
      expect(agent.hooks.preToolUse[0].command).toMatch(/cmk-guard-memory/);
      // MCP is routed through the PROJECT `.kiro/settings/mcp.json` via
      // includeMcpJson:true — NOT an inline mcpServers entry. The project mcp.json
      // carries env.CMK_PROJECT_DIR (the cut-gate-kiro-cli silent-data-loss fix);
      // a GLOBAL agent can't bake a per-project env, so there must be ONE MCP
      // source (the env-carrying project one), not a duplicate env-less inline one.
      expect(agent.mcpServers).toBeUndefined();
      expect(agent.includeMcpJson).toBe(true);
      expect(agent.useLegacyMcpJson).toBeUndefined(); // dropped (conflicts with includeMcpJson)
      // an INLINE instruction prompt (NOT a file:// ref — those resolve relative
      // to the agent-file dir, not the project root; D-198)
      expect(typeof agent.prompt).toBe('string');
      expect(agent.prompt).not.toMatch(/^file:\/\//); // inline text, not a path ref
      expect(agent.prompt).toMatch(/mk_remember|mk_search/); // the recall/persist directive
      // NO project-relative file:// resources (can't resolve from ~/.kiro/agents/)
      const refs = JSON.stringify(agent.resources ?? []);
      expect(refs).not.toMatch(/file:\/\/(?!\/)/); // no relative file:// resource refs
      // name is `cmk` (NOT q_cli_default — that agent doesn't exist in kiro-cli)
      expect(agent.name).toBe('cmk');
      // ownership marker lives in a VALID field (description) — NOT a top-level
      // `managedBy`, which kiro-cli `agent validate` rejects as unknown (D-198).
      expect(agent.managedBy).toBeUndefined();
      expect(agent.description).toContain('[claude-memory-kit]');
      // the LOAD-BEARING default registration in ~/.kiro/settings/cli.json
      expect(existsSync(settingsPath())).toBe(true);
      const settings = JSON.parse(readFileSync(settingsPath(), 'utf8'));
      expect(settings['chat.defaultAgent']).toBe('cmk');
    });

    it('the agent config has ONLY kiro-cli-valid top-level fields (agent validate is strict)', () => {
      installKiroCliAgent({ kiroDir });
      const agent = JSON.parse(readFileSync(agentPath(), 'utf8'));
      const VALID = new Set([
        '$schema', 'name', 'description', 'prompt', 'mcpServers', 'tools', 'toolAliases',
        'allowedTools', 'resources', 'hooks', 'toolsSettings', 'includeMcpJson',
        'useLegacyMcpJson', 'model', 'keyboardShortcut', 'welcomeMessage',
      ]);
      for (const key of Object.keys(agent)) {
        expect(VALID.has(key), `field "${key}" is not a kiro-cli-valid top-level field`).toBe(true);
      }
    });

    it('the hook command is platform-correct (cmd.exe /c on Windows)', () => {
      installKiroCliAgent({ kiroDir });
      const agent = JSON.parse(readFileSync(agentPath(), 'utf8'));
      if (process.platform === 'win32') {
        expect(agent.hooks.stop[0].command).toBe('cmd.exe /c cmk hook stop');
      } else {
        expect(agent.hooks.stop[0].command).toBe('cmk hook stop');
      }
    });

    it('pre-trusts the kit hook commands via toolsSettings.shell.allowedCommands (D-194)', () => {
      installKiroCliAgent({ kiroDir });
      const agent = JSON.parse(readFileSync(agentPath(), 'utf8'));
      const allowed = agent.toolsSettings?.shell?.allowedCommands;
      expect(Array.isArray(allowed)).toBe(true);
      // the kit's hook + guard commands are pre-trusted (regex, START-ANCHORED, platform-correct)
      const hookRe = process.platform === 'win32' ? '^cmd\\.exe /c cmk hook .*' : '^cmk hook .*';
      const guardRe = process.platform === 'win32' ? '^cmd\\.exe /c cmk-guard-memory' : '^cmk-guard-memory';
      expect(allowed).toContain(hookRe);
      expect(allowed).toContain(guardRe);
      // every pattern is start-anchored (mirrors the IDE prefix-from-start semantics)
      for (const p of allowed) expect(p.startsWith('^')).toBe(true);
      // never a blanket allow
      expect(allowed).not.toContain('.*');
      expect(allowed).not.toContain('^.*');
      expect(allowed).not.toContain('*');
    });

    it('pre-approves the kit MCP tools via allowedTools @claude-memory-kit (the CLI-side MCP trust)', () => {
      // Kiro gates MCP TOOL calls separately from shell hooks. allowedTools uses
      // the @server format and MUST name the server as it appears in the project
      // `.kiro/settings/mcp.json` — `claude-memory-kit` (install MCP_SERVER_NAME),
      // NOT `cmk`. A mismatch (the old `@cmk`, orphaned once MCP moved to the
      // project mcp.json) means mk_remember is NOT approved → kiro silently drops
      // the tool call (the gate3 silent-data-loss finding).
      installKiroCliAgent({ kiroDir });
      const agent = JSON.parse(readFileSync(agentPath(), 'utf8'));
      expect(Array.isArray(agent.allowedTools)).toBe(true);
      expect(agent.allowedTools).toContain('@claude-memory-kit'); // the kit's server, by its real name
      expect(agent.allowedTools).not.toContain('@cmk'); // the orphaned old name must be gone
      expect(agent.allowedTools).not.toContain('*'); // never a blanket all-servers
    });

    it('reports that it set the default agent', () => {
      const r = installKiroCliAgent({ kiroDir });
      expect(r.defaultAgent).toBe('set');
    });

    it('a second install of byte-identical content reports changed:false (idempotent)', () => {
      const first = installKiroCliAgent({ kiroDir });
      expect(first.changed).toBe(true); // fresh write
      const second = installKiroCliAgent({ kiroDir });
      expect(second.changed).toBe(false); // no-op re-install
    });
  });

  describe('guarded default (the user already points chat.defaultAgent elsewhere)', () => {
    const settingsDir = () => join(kiroDir, 'settings');

    it('does NOT clobber a FOREIGN chat.defaultAgent — installs the cmk agent, reports skipped-existing', () => {
      mkdirSync(settingsDir(), { recursive: true });
      writeFileSync(settingsPath(), JSON.stringify({ 'chat.defaultAgent': 'their-agent' }), 'utf8');

      const r = installKiroCliAgent({ kiroDir });
      // our agent file STILL installs (the user can run `kiro-cli --agent cmk`)
      expect(r.action).toBe('installed');
      expect(existsSync(agentPath())).toBe(true);
      // but we left their default pointer alone
      expect(r.defaultAgent).toBe('skipped-existing');
      const settings = JSON.parse(readFileSync(settingsPath(), 'utf8'));
      expect(settings['chat.defaultAgent']).toBe('their-agent');
    });

    // D-187: a cli.json written by a Windows editor / PowerShell carries a UTF-8
    // BOM. A bare JSON.parse throws on the BOM → the guard would conclude "no
    // default" and CLOBBER the user's pointer. The read must be BOM-tolerant.
    it('does NOT clobber a foreign default when cli.json has a UTF-8 BOM', () => {
      mkdirSync(settingsDir(), { recursive: true });
      const BOM = '﻿';
      writeFileSync(settingsPath(), `${BOM}${JSON.stringify({ 'chat.defaultAgent': 'their-agent' })}`, 'utf8');

      const r = installKiroCliAgent({ kiroDir });
      expect(r.defaultAgent).toBe('skipped-existing'); // guard SAW the BOM'd default
      const settings = JSON.parse(readFileSync(settingsPath(), 'utf8').replace(/^﻿/, ''));
      expect(settings['chat.defaultAgent']).toBe('their-agent'); // untouched
    });

    it('PRESERVES other keys in cli.json when it sets the default (managed-merge)', () => {
      mkdirSync(settingsDir(), { recursive: true });
      writeFileSync(settingsPath(), JSON.stringify({ 'some.other.setting': 42 }), 'utf8');

      installKiroCliAgent({ kiroDir });
      const settings = JSON.parse(readFileSync(settingsPath(), 'utf8'));
      expect(settings['chat.defaultAgent']).toBe('cmk'); // we set ours
      expect(settings['some.other.setting']).toBe(42); // byte-preserved sibling
    });

    it('re-points the default to cmk if cli.json ALREADY points at cmk (idempotent)', () => {
      mkdirSync(settingsDir(), { recursive: true });
      writeFileSync(settingsPath(), JSON.stringify({ 'chat.defaultAgent': 'cmk' }), 'utf8');
      const r = installKiroCliAgent({ kiroDir });
      expect(r.defaultAgent).toBe('set'); // ours already — not foreign
    });
  });

  describe('uninstall', () => {
    it('removes our agent-config AND un-registers our default pointer', () => {
      installKiroCliAgent({ kiroDir });
      expect(existsSync(agentPath())).toBe(true);
      expect(JSON.parse(readFileSync(settingsPath(), 'utf8'))['chat.defaultAgent']).toBe('cmk');

      uninstallKiroCliAgent({ kiroDir });

      expect(existsSync(agentPath())).toBe(false); // our agent gone
      // the pointer is removed (it named us), but cli.json itself remains
      const settings = JSON.parse(readFileSync(settingsPath(), 'utf8'));
      expect(settings['chat.defaultAgent']).toBeUndefined();
    });

    // SAFETY (the I-1 review finding): uninstall `rmSync`s the agent file keyed on
    // our `[claude-memory-kit]` description marker. A user's OWN agent that happens
    // to live at agents/cmk.json but is NOT ours (no marker) must NEVER be deleted —
    // the description-substring ownership check must not false-positive into data loss.
    it('does NOT delete a foreign cmk.json that lacks our marker (no false-positive rmSync)', () => {
      mkdirSync(join(kiroDir, 'agents'), { recursive: true });
      const foreign = JSON.stringify({ name: 'cmk', description: 'my own agent', mine: true });
      writeFileSync(agentPath(), foreign, 'utf8');

      const r = uninstallKiroCliAgent({ kiroDir });

      expect(r.changed).toBe(false); // we touched nothing
      expect(existsSync(agentPath())).toBe(true); // their file survives
      expect(readFileSync(agentPath(), 'utf8')).toBe(foreign); // byte-untouched
    });

    // Over-mutation guard: a FOREIGN default + a sibling setting must both survive
    // uninstall — we only touch what we wrote (delete-one ≠ delete-all).
    it('preserves a foreign default + sibling cli.json keys on uninstall', () => {
      mkdirSync(join(kiroDir, 'settings'), { recursive: true });
      const userSettings = JSON.stringify({ 'chat.defaultAgent': 'their-agent', 'x': 1 });
      writeFileSync(settingsPath(), userSettings, 'utf8');

      installKiroCliAgent({ kiroDir }); // skipped-existing — leaves their pointer
      expect(existsSync(agentPath())).toBe(true); // our agent file did land

      uninstallKiroCliAgent({ kiroDir });

      expect(existsSync(agentPath())).toBe(false); // ours gone
      // their settings byte-untouched (we never owned the pointer)
      expect(readFileSync(settingsPath(), 'utf8')).toBe(userSettings);
    });
  });
});
