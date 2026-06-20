// @doors: 1
// Door 2 N/A: the validator reads the profiles registry + asserts the parity
//   invariant; it writes nothing. Pure check.
// Door 3 N/A: no subprocess spawn (it imports the registry directly).
// Door 4 N/A: no log emission (it throws/returns; the CLI wrapper prints).
// Door 5 N/A: no message-queue interaction.

// Tests for Task 50.D — validate-agent-adapter-parity.
//
// The parity invariant: every supported agent profile wires EXACTLY the legs
// its integration-TYPE declares — both directions (under-wiring AND over-wiring
// fail). The factory (50.C) already enforces this at definition time; this
// validator is the lint-time structural guard (a profile constructed outside the
// factory, or a future leg-contract drift, is caught on every `npm test`).

import { describe, it, expect } from 'vitest';
import {
  checkAdapterParity,
  REQUIRED_LEGS_BY_TYPE,
} from '../scripts/validate-agent-adapter-parity.mjs';
import { listAgentProfiles } from '../packages/cli/src/agent-profiles.mjs';

describe('Task 50.D — adapter parity validator', () => {
  it('the live registry passes parity (claude-code + kiro)', () => {
    const r = checkAdapterParity(listAgentProfiles());
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
    expect(r.checked).toBeGreaterThanOrEqual(2);
  });

  it('flags a profile that UNDER-wires its type (native-hooks-mcp without hooks)', () => {
    const broken = [
      {
        name: 'broken-under',
        integrationType: 'native-hooks-mcp',
        instructionFile: 'X.md',
        mcp: { path: 'x', serversKey: 'mcpServers' },
        // hooks missing — under-wired
      },
    ];
    const r = checkAdapterParity(broken);
    expect(r.ok).toBe(false);
    expect(r.violations.join(' ')).toMatch(/broken-under.*hooks|hooks.*broken-under/i);
  });

  it('flags a profile that OVER-wires its type (mcp-only WITH hooks)', () => {
    const broken = [
      {
        name: 'broken-over',
        integrationType: 'mcp-only',
        instructionFile: 'AGENTS.md',
        mcp: { path: 'x', serversKey: 'servers' },
        hooks: { mechanism: 'agent-config-json', path: 'y', eventMap: {} },
      },
    ];
    const r = checkAdapterParity(broken);
    expect(r.ok).toBe(false);
    expect(r.violations.join(' ')).toMatch(/broken-over/i);
  });

  it('flags a profile missing the universal instruction leg', () => {
    const broken = [
      {
        name: 'broken-noinstr',
        integrationType: 'instruction-only',
        // instructionFile missing
      },
    ];
    const r = checkAdapterParity(broken);
    expect(r.ok).toBe(false);
    expect(r.violations.join(' ')).toMatch(/broken-noinstr.*instruction/i);
  });

  it('exposes the required-legs contract per type (for the docs table)', () => {
    expect(REQUIRED_LEGS_BY_TYPE['native-hooks-mcp']).toEqual(expect.arrayContaining(['instructionFile', 'mcp', 'hooks']));
    expect(REQUIRED_LEGS_BY_TYPE['mcp-only']).toEqual(expect.arrayContaining(['instructionFile', 'mcp']));
    expect(REQUIRED_LEGS_BY_TYPE['mcp-only']).not.toContain('hooks');
    expect(REQUIRED_LEGS_BY_TYPE['instruction-only']).toEqual(['instructionFile']);
  });
});
