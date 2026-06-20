// @doors: 1, 2
// Door 3 N/A: installAgent writes config files via mutateAgentConfig + the
//   marker-block helper; no subprocess spawn at this surface.
// Door 4 N/A: no NDJSON/audit emission at this surface (the install summary is
//   the CLI's concern; installAgent returns a structured result).
// Door 5 N/A: no message-queue interaction.

// Tests for Task 50.E/50.F — installAgent: wire a per-agent profile's legs.
//
// Given a profile (DATA, from agent-profiles.mjs) + a project root, installAgent
// lands the profile's three legs in its declared paths, reusing the shared
// primitives: MCP + hooks via mutateAgentConfig (touch-only-our-keys), the
// instruction file via the marker-block machinery. Kiro is the first agent.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installAgent, uninstallAgent } from '../packages/cli/src/install-agent.mjs';
import { getAgentProfile } from '../packages/cli/src/agent-profiles.mjs';

let sandbox;
let projectRoot;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-install-agent-'));
  projectRoot = join(sandbox, 'proj');
  mkdirSync(projectRoot, { recursive: true });
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

const kiro = () => getAgentProfile('kiro');

describe('Task 50.E/50.F — installAgent (Kiro)', () => {
  describe('all three legs land in the profile-declared paths', () => {
    it('wires MCP, hooks, and the steering instruction file', () => {
      const r = installAgent({ projectRoot, profile: kiro() });

      // Door 1 — Response
      expect(r.action).toBe('installed');
      expect(r.agent).toBe('kiro');

      // Door 2 — State: MCP at .kiro/settings/mcp.json
      const mcpPath = join(projectRoot, '.kiro', 'settings', 'mcp.json');
      expect(existsSync(mcpPath)).toBe(true);
      const mcp = JSON.parse(readFileSync(mcpPath, 'utf8'));
      expect(mcp.mcpServers).toHaveProperty('claude-memory-kit');

      // hooks at .kiro/agents/cmk.json with agentSpawn + stop
      const hooksPath = join(projectRoot, '.kiro', 'agents', 'cmk.json');
      expect(existsSync(hooksPath)).toBe(true);
      const hooksCfg = JSON.parse(readFileSync(hooksPath, 'utf8'));
      expect(hooksCfg.hooks).toHaveProperty('agentSpawn');
      expect(hooksCfg.hooks).toHaveProperty('stop');

      // steering file with `inclusion: always` frontmatter
      const steeringPath = join(projectRoot, '.kiro', 'steering', 'claude-memory-kit.md');
      expect(existsSync(steeringPath)).toBe(true);
      const steering = readFileSync(steeringPath, 'utf8');
      expect(steering).toMatch(/inclusion:\s*always/);
    });
  });

  describe('idempotent + touch-only-our-keys (over-mutation guard)', () => {
    it('a second install is a no-op on already-wired legs', () => {
      installAgent({ projectRoot, profile: kiro() });
      const r2 = installAgent({ projectRoot, profile: kiro() });
      // nothing changed the second time
      expect(r2.changed).toBe(false);
    });

    it('preserves a user-pre-existing MCP server (seed N, add ours, assert N+1)', () => {
      const mcpPath = join(projectRoot, '.kiro', 'settings', 'mcp.json');
      mkdirSync(join(projectRoot, '.kiro', 'settings'), { recursive: true });
      writeFileSync(
        mcpPath,
        JSON.stringify({ mcpServers: { 'user-server': { command: 'theirs' } } }, null, 2),
        'utf8',
      );

      installAgent({ projectRoot, profile: kiro() });

      const mcp = JSON.parse(readFileSync(mcpPath, 'utf8'));
      // their server survived, ours added
      expect(mcp.mcpServers['user-server']).toEqual({ command: 'theirs' });
      expect(mcp.mcpServers).toHaveProperty('claude-memory-kit');
      expect(Object.keys(mcp.mcpServers)).toHaveLength(2);
    });

    it('refuses to clobber a corrupt agent config (returns error, file untouched)', () => {
      const mcpPath = join(projectRoot, '.kiro', 'settings', 'mcp.json');
      mkdirSync(join(projectRoot, '.kiro', 'settings'), { recursive: true });
      const corrupt = '{ broken,,, ';
      writeFileSync(mcpPath, corrupt, 'utf8');

      const r = installAgent({ projectRoot, profile: kiro() });
      expect(r.action).toBe('error');
      // the corrupt file was NOT overwritten
      expect(readFileSync(mcpPath, 'utf8')).toBe(corrupt);
    });
  });

  describe('AGENTS.md breadth rung (50.G — instruction-only, no hooks/MCP)', () => {
    const agentsmd = () => getAgentProfile('agents-md');

    it('emits a managed AGENTS.md block and wires NO hooks/MCP', () => {
      const r = installAgent({ projectRoot, profile: agentsmd() });
      expect(r.action).toBe('installed');

      const agentsPath = join(projectRoot, 'AGENTS.md');
      expect(existsSync(agentsPath)).toBe(true);
      const body = readFileSync(agentsPath, 'utf8');
      expect(body).toMatch(/claude-memory-kit:start/);
      expect(body).toMatch(/cmk search/);
      // instruction-only: no agent config files
      expect(r.legs.mcp).toBeUndefined();
      expect(r.legs.hooks).toBeUndefined();
    });

    it('byte-preserves the user content outside our block on uninstall', () => {
      const agentsPath = join(projectRoot, 'AGENTS.md');
      writeFileSync(agentsPath, '# My project rules\n\nUse tabs.\n', 'utf8');

      installAgent({ projectRoot, profile: agentsmd() });
      let body = readFileSync(agentsPath, 'utf8');
      expect(body).toContain('My project rules'); // user content preserved on install
      expect(body).toMatch(/claude-memory-kit:start/);

      uninstallAgent({ projectRoot, profile: agentsmd() });
      body = readFileSync(agentsPath, 'utf8');
      expect(body).toContain('My project rules'); // still there after uninstall
      expect(body).not.toMatch(/claude-memory-kit:start/); // our block gone
    });
  });

  describe('uninstall strips only our keys', () => {
    it('removes our MCP entry + hooks but preserves a sibling server', () => {
      const mcpPath = join(projectRoot, '.kiro', 'settings', 'mcp.json');
      mkdirSync(join(projectRoot, '.kiro', 'settings'), { recursive: true });
      writeFileSync(
        mcpPath,
        JSON.stringify({ mcpServers: { 'user-server': { command: 'theirs' } } }, null, 2),
        'utf8',
      );
      installAgent({ projectRoot, profile: kiro() });

      uninstallAgent({ projectRoot, profile: kiro() });

      const mcp = JSON.parse(readFileSync(mcpPath, 'utf8'));
      expect(mcp.mcpServers['user-server']).toEqual({ command: 'theirs' });
      expect(mcp.mcpServers['claude-memory-kit']).toBeUndefined();
    });

    it('prunes an emptied servers object (no kit-shaped husk left behind) — review I2', () => {
      // ours is the ONLY server; after uninstall mcpServers should not linger as {}.
      installAgent({ projectRoot, profile: kiro() });
      uninstallAgent({ projectRoot, profile: kiro() });
      const mcp = JSON.parse(readFileSync(join(projectRoot, '.kiro', 'settings', 'mcp.json'), 'utf8'));
      expect(mcp.mcpServers).toBeUndefined();
    });

    it('uninstall removes ONLY our hook events, preserving a user-added hook in the same file — review M1', () => {
      installAgent({ projectRoot, profile: kiro() });
      // user adds their own hook event to the SAME .kiro/agents/cmk.json
      const hooksPath = join(projectRoot, '.kiro', 'agents', 'cmk.json');
      const cfg = JSON.parse(readFileSync(hooksPath, 'utf8'));
      cfg.hooks.userCustom = [{ command: 'their-script' }];
      writeFileSync(hooksPath, JSON.stringify(cfg, null, 2), 'utf8');

      uninstallAgent({ projectRoot, profile: kiro() });

      const after = JSON.parse(readFileSync(hooksPath, 'utf8'));
      // their hook survived; ours (agentSpawn/stop) gone
      expect(after.hooks.userCustom).toEqual([{ command: 'their-script' }]);
      expect(after.hooks.agentSpawn).toBeUndefined();
      expect(after.hooks.stop).toBeUndefined();
    });
  });

  describe('partial install reports landed legs (review I1)', () => {
    it('when hooks config is corrupt, MCP still lands and the result names it', () => {
      // pre-seed a corrupt hooks file so the hooks leg errors AFTER MCP succeeds.
      const hooksPath = join(projectRoot, '.kiro', 'agents', 'cmk.json');
      mkdirSync(join(projectRoot, '.kiro', 'agents'), { recursive: true });
      writeFileSync(hooksPath, '{ corrupt,,, ', 'utf8');

      const r = installAgent({ projectRoot, profile: kiro() });
      expect(r.action).toBe('error');
      // MCP DID land (idempotent + safe to re-run) and the result records it
      expect(r.legs.mcp).toBe('created');
      expect(existsSync(join(projectRoot, '.kiro', 'settings', 'mcp.json'))).toBe(true);
      // the corrupt hooks file was NOT clobbered
      expect(readFileSync(hooksPath, 'utf8')).toBe('{ corrupt,,, ');
    });
  });
});
