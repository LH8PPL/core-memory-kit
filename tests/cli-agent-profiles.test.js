// @doors: 1
// Door 2 N/A: this file tests the static profile REGISTRY (pure data). No I/O.
// Door 3 N/A: no subprocess spawn.
// Door 4 N/A: no log emission.
// Door 5 N/A: no message-queue interaction.

// Tests for Task 50.C/50.E — the agent-profiles registry.
//
// The load-bearing regression test: the claude-code profile's declared hook
// events MUST match what install.mjs actually wires today (KIT_HOOKS_BLOCK in
// settings-hooks.mjs). If a future edit drifts the profile from the real
// install behavior, this fails — the "express Claude Code in the new shape
// WITHOUT changing its install behavior" criterion (50.C), enforced structurally.

import { describe, it, expect } from 'vitest';
import {
  AGENT_PROFILES,
  getAgentProfile,
  listAgentProfiles,
} from '../packages/cli/src/agent-profiles.mjs';
import { KIT_HOOKS_BLOCK } from '../packages/cli/src/settings-hooks.mjs';

describe('Task 50.C/50.E — agent-profiles registry', () => {
  it('registers claude-code + kiro', () => {
    expect(getAgentProfile('claude-code')).toBeDefined();
    expect(getAgentProfile('kiro')).toBeDefined();
    expect(listAgentProfiles().map((p) => p.name).sort()).toEqual(['claude-code', 'kiro']);
  });

  it('the registry is frozen (profiles are immutable data)', () => {
    expect(Object.isFrozen(AGENT_PROFILES)).toBe(true);
  });

  describe('claude-code profile faithfully mirrors the real install wiring (50.C regression guard)', () => {
    const cc = getAgentProfile('claude-code');

    it('declares native-hooks-mcp with the CLAUDE.md instruction surface', () => {
      expect(cc.integrationType).toBe('native-hooks-mcp');
      expect(cc.instructionFile).toBe('CLAUDE.md');
      expect(cc.mcp.path).toBe('.mcp.json');
      expect(cc.mcp.serversKey).toBe('mcpServers');
    });

    it('every Claude-Code hook event the profile maps to EXISTS in the real KIT_HOOKS_BLOCK', () => {
      // The profile's eventMap values are Claude Code's actual event names.
      // They must be a subset of what install actually wires — drift here means
      // the profile lies about install behavior.
      const realEvents = new Set(Object.keys(KIT_HOOKS_BLOCK));
      for (const mappedEvent of Object.values(cc.hooks.eventMap)) {
        expect(realEvents.has(mappedEvent)).toBe(true);
      }
    });

    it('maps the two load-bearing memory events (inject at start, capture at turn end)', () => {
      expect(cc.hooks.eventMap.sessionStart).toBe('SessionStart');
      expect(cc.hooks.eventMap.turnEnd).toBe('Stop');
    });
  });

  describe('kiro profile carries the D-180 primary-verified facts', () => {
    const k = getAgentProfile('kiro');

    it('targets the CLI agent-hook surface (.kiro/agents/<name>.json), not IDE Agent Hooks', () => {
      expect(k.hooks.mechanism).toBe('agent-config-json');
      expect(k.hooks.path).toBe('.kiro/agents/cmk.json');
      // the correction: agentSpawn=inject, stop=capture (NOT file-event hooks)
      expect(k.hooks.eventMap.sessionStart).toBe('agentSpawn');
      expect(k.hooks.eventMap.turnEnd).toBe('stop');
    });

    it('steering + MCP at the verified paths', () => {
      expect(k.instructionFile).toBe('.kiro/steering/claude-memory-kit.md');
      expect(k.mcp.path).toBe('.kiro/settings/mcp.json');
      expect(k.mcp.serversKey).toBe('mcpServers');
    });

    it('transcript params resolved (VS Code fork, per-session JSON history)', () => {
      expect(k.transcript.workspaceKey).toBe('base64url');
      expect(k.transcript.parse).toBe('json-history');
    });
  });
});
