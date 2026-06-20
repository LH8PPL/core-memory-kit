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
  });
});
