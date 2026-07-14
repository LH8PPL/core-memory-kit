// @doors: 1
// Door 2 N/A: defineAgentProfile is a PURE function — it validates + normalizes
//   a profile declaration and returns the frozen descriptor. No disk write, no
//   state mutation at this surface (the install routing that USES the descriptor
//   writes via mutateAgentConfig, tested in cli-mutate-agent-config.test.js).
// Door 3 N/A: no subprocess spawn.
// Door 4 N/A: no log/NDJSON emission at this surface.
// Door 5 N/A: no message-queue interaction.

// Tests for Task 50.C — `defineAgentProfile`, the per-agent profile factory.
//
// The D-180 finding: per-agent adapters are DATA, not classes. This factory
// validates + normalizes a profile declaration so the install routing (50.F)
// can drive ANY agent through ONE code path (mutateAgentConfig for config legs).
// Each profile declares only what differs per agent; the factory fills kit
// defaults (markdown-canonical) + enforces the integration-type contract.

import { describe, it, expect } from 'vitest';
import {
  defineAgentProfile,
  INTEGRATION_TYPES,
} from '../packages/cli/src/agent-profile.mjs';

// A minimal full-integration profile (Kiro-shaped) used across tests.
const kiroish = {
  name: 'kiro',
  displayName: 'Kiro',
  integrationType: 'native-hooks-mcp',
  detect: { homeDir: '.kiro' },
  instructionFile: '.kiro/steering/core-memory-kit.md',
  mcp: { path: '.kiro/settings/mcp.json', serversKey: 'mcpServers' },
  hooks: { mechanism: 'agent-config-json', path: '.kiro/agents/cmk.json', eventMap: { sessionStart: 'agentSpawn', turnEnd: 'stop' } },
  transcript: { dir: '.kiro/transcripts', workspaceKey: 'base64url', parse: 'json-history' },
};

describe('Task 50.C — defineAgentProfile', () => {
  describe('valid declaration → frozen normalized descriptor', () => {
    it('returns the profile with name/displayName/integrationType preserved', () => {
      const p = defineAgentProfile(kiroish);
      expect(p.name).toBe('kiro');
      expect(p.displayName).toBe('Kiro');
      expect(p.integrationType).toBe('native-hooks-mcp');
    });

    it('freezes the returned descriptor (a profile is immutable data)', () => {
      const p = defineAgentProfile(kiroish);
      expect(Object.isFrozen(p)).toBe(true);
    });

    it('defaults displayName to name when omitted', () => {
      const p = defineAgentProfile({ ...kiroish, displayName: undefined });
      expect(p.displayName).toBe('kiro');
    });
  });

  describe('integration-type contract — the type dictates which legs are required', () => {
    it('native-hooks-mcp requires instructionFile + mcp + hooks', () => {
      expect(() => defineAgentProfile({ ...kiroish, hooks: undefined })).toThrow(/hooks/i);
      expect(() => defineAgentProfile({ ...kiroish, mcp: undefined })).toThrow(/mcp/i);
    });

    it('mcp-only requires mcp but NOT hooks', () => {
      const p = defineAgentProfile({
        name: 'copilot',
        integrationType: 'mcp-only',
        detect: { command: 'copilot' },
        instructionFile: 'AGENTS.md',
        mcp: { path: '.copilot/mcp.json', serversKey: 'servers' },
        // no hooks — legal for mcp-only
      });
      expect(p.integrationType).toBe('mcp-only');
      expect(p.hooks).toBeUndefined();
    });

    it('mcp-only with hooks declared is a contract violation (over-wiring its type)', () => {
      expect(() =>
        defineAgentProfile({
          name: 'copilot',
          integrationType: 'mcp-only',
          detect: { command: 'copilot' },
          instructionFile: 'AGENTS.md',
          mcp: { path: '.copilot/mcp.json', serversKey: 'servers' },
          hooks: { mechanism: 'agent-config-json', path: 'x', eventMap: {} },
        }),
      ).toThrow(/mcp-only.*hooks|hooks.*mcp-only/i);
    });

    it('instruction-only requires only instructionFile (no mcp, no hooks)', () => {
      const p = defineAgentProfile({
        name: 'generic',
        integrationType: 'instruction-only',
        detect: { always: true },
        instructionFile: 'AGENTS.md',
      });
      expect(p.integrationType).toBe('instruction-only');
      expect(p.mcp).toBeUndefined();
      expect(p.hooks).toBeUndefined();
    });
  });

  describe('input validation (schema)', () => {
    it('rejects an unknown integrationType', () => {
      expect(() => defineAgentProfile({ ...kiroish, integrationType: 'made-up' })).toThrow(/integrationType/i);
    });

    it('rejects a missing name', () => {
      expect(() => defineAgentProfile({ ...kiroish, name: undefined })).toThrow(/name/i);
    });

    it('rejects a missing instructionFile (every type needs the instruction leg)', () => {
      expect(() => defineAgentProfile({ ...kiroish, instructionFile: undefined })).toThrow(/instructionFile/i);
    });

    it('requires a detect descriptor', () => {
      expect(() => defineAgentProfile({ ...kiroish, detect: undefined })).toThrow(/detect/i);
    });
  });

  describe('INTEGRATION_TYPES enum is exported + frozen', () => {
    it('exposes the four kit types', () => {
      expect(INTEGRATION_TYPES).toContain('native-hooks-mcp');
      expect(INTEGRATION_TYPES).toContain('mcp-only');
      expect(INTEGRATION_TYPES).toContain('instruction-only');
      expect(Object.isFrozen(INTEGRATION_TYPES)).toBe(true);
    });
  });
});
