// @doors: 1, 2
// Door 3 N/A: the flag only writes a config key + logs; no subprocess under test.
// Door 4 N/A: no message queues.
// Door 5 N/A: no observability / NDJSON at this surface.

// Tests for Task 201 (D-277) — `cmk install --backend <agent>`: the split-brain
// override set at install time (sugar over `cmk config set backend.agent`). Both
// write the SAME key; the flag is the front-door. Validated against known agents.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyBackendOverride, validateBackendFlag, runInstall } from '../packages/cli/src/subcommands.mjs';
import { configGet } from '../packages/cli/src/config-core.mjs';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'cmk-backendflag-'));
}
function cap() {
  const lines = [];
  return { log: (m) => lines.push(String(m)), lines, text: () => lines.join('\n') };
}

describe('Task 201 — cmk install --backend', () => {
  it('writes backend.agent to the project tier when a valid agent is given', () => {
    const root = tmp();
    const c = cap();
    const r = applyBackendOverride('kiro', { projectRoot: root, log: c.log, logError: c.log });
    expect(r.ok).toBe(true);
    const got = configGet('backend.agent', { projectRoot: root });
    expect(got.found).toBe(true);
    expect(got.value).toBe('kiro');
  });

  it('normalizes claude-code → claude', () => {
    const root = tmp();
    applyBackendOverride('claude-code', { projectRoot: root, log: () => {}, logError: () => {} });
    expect(configGet('backend.agent', { projectRoot: root }).value).toBe('claude');
  });

  it('rejects an unknown agent (no write, exit 2, lists the supported agents)', () => {
    const root = tmp();
    const c = cap();
    const r = applyBackendOverride('not-an-agent', { projectRoot: root, log: c.log, logError: c.log });
    expect(r.ok).toBe(false);
    expect(configGet('backend.agent', { projectRoot: root }).found).toBe(false);
    expect(c.text().toLowerCase()).toMatch(/claude.*kiro.*cursor|kiro.*cursor/); // lists supported
  });

  it('a no-op when no --backend is given (undefined) — writes nothing', () => {
    const root = tmp();
    const r = applyBackendOverride(undefined, { projectRoot: root, log: () => {}, logError: () => {} });
    expect(r.skipped).toBe(true);
    expect(configGet('backend.agent', { projectRoot: root }).found).toBe(false);
  });

  it('the --backend flag and cmk config set land the IDENTICAL key', async () => {
    const { configSet } = await import('../packages/cli/src/config-core.mjs');
    const rootA = tmp();
    const rootB = tmp();
    applyBackendOverride('cursor', { projectRoot: rootA, log: () => {}, logError: () => {} });
    configSet('backend.agent', 'cursor', { projectRoot: rootB, tier: 'project' });
    expect(configGet('backend.agent', { projectRoot: rootA }).value)
      .toBe(configGet('backend.agent', { projectRoot: rootB }).value);
  });

  it('validateBackendFlag is a pure gate (no write, no exit) — skipped/ok/error', () => {
    expect(validateBackendFlag(undefined)).toEqual({ skipped: true });
    expect(validateBackendFlag('kiro')).toEqual({ ok: true, agent: 'kiro' });
    expect(validateBackendFlag('claude-code')).toEqual({ ok: true, agent: 'claude' });
    expect(validateBackendFlag('nope').ok).toBe(false);
  });

  it('FAIL-FAST: a bad --backend rejects install BEFORE scaffolding (no context/ created)', async () => {
    const root = tmp();
    const c = cap();
    const prevExit = process.exitCode;
    await runInstall({ cwd: root, backend: 'not-an-agent', log: c.log, logError: c.log, userTier: tmp() });
    // exit 2, error names the bad flag, and CRUCIALLY nothing was scaffolded
    expect(process.exitCode).toBe(2);
    expect(c.text().toLowerCase()).toMatch(/unknown --backend/);
    expect(existsSync(join(root, 'context'))).toBe(false); // fail-fast: no half-install
    process.exitCode = prevExit; // reset for the next test
  });
});
