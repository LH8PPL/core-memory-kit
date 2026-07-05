// @doors: 1, 3
// Door 2 N/A: pure detection — no kit disk-state mutation (an injectable spawnFn
//   keeps it deterministic; the real CLI probe is a live-verify item).
// Door 4 N/A: no NDJSON emission at this surface (callers surface the verdict).
// Door 5 N/A: no message-queue.

// Tests for Task 200 (D-272/D-274/D-277) — agentCliOnPath: does the agent's own
// CLI actually RUN? Per D-274, presence-on-PATH is NOT enough — Cursor's IDE had
// a live bug where a binary was on PATH but the wrong (Unix) shim, so the detector
// does an EXIT-CODE probe (`--version`), Windows `.cmd`-aware. This is the shared
// detector cmk install + cmk doctor both use to warn on a missing backend CLI.

import { describe, it, expect } from 'vitest';
import { agentCliOnPath, backendBinName, KNOWN_BACKEND_AGENTS } from '../packages/cli/src/agent-cli.mjs';

// A fake spawnBinSync-shaped result: { status, error, stdout }.
function fakeProbe(result) {
  const calls = [];
  const spawnSyncFn = (bin, args, opts) => {
    calls.push({ bin, args, opts });
    return result;
  };
  return { spawnSyncFn, calls };
}

describe('Task 200 — agentCliOnPath (exit-code probe, D-274)', () => {
  it('returns present:true when the CLI probe exits 0', () => {
    const { spawnSyncFn } = fakeProbe({ status: 0, stdout: Buffer.from('2026.07.01') });
    const r = agentCliOnPath('cursor', { spawnSyncFn });
    expect(r.present).toBe(true);
    expect(r.agent).toBe('cursor');
  });

  it('returns present:false when the binary is not found (ENOENT error)', () => {
    const { spawnSyncFn } = fakeProbe({ error: Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }) });
    const r = agentCliOnPath('kiro', { spawnSyncFn });
    expect(r.present).toBe(false);
    expect(r.bin).toBeTruthy(); // reports which bin it looked for
  });

  it('returns present:false when the CLI is on PATH but the probe exits non-zero (the D-274 broken-shim class)', () => {
    // e.g. the Windows Cursor IDE bug: a bad/Unix shim resolves but errors out.
    const { spawnSyncFn } = fakeProbe({ status: 1, stdout: Buffer.from('') });
    const r = agentCliOnPath('cursor', { spawnSyncFn });
    expect(r.present).toBe(false);
  });

  it('probes the RIGHT bin per agent + platform (.cmd on win32 for claude/cursor)', () => {
    // spawnBinSync collapses bin+args into ONE command string on win32
    // (shell:true) and passes argv on posix — assert the bin appears in whichever
    // form the platform produced (mirrors the backend tests' flat() pattern).
    const binOf = (call, platform) => (platform === 'win32' ? call.bin.split(' ')[0] : call.bin);
    const { spawnSyncFn, calls } = fakeProbe({ status: 0, stdout: Buffer.from('ok') });
    agentCliOnPath('cursor', { spawnSyncFn, platform: 'win32' });
    expect(binOf(calls[0], 'win32')).toBe('agent.cmd');
    calls.length = 0;
    agentCliOnPath('cursor', { spawnSyncFn, platform: 'linux' });
    expect(binOf(calls[0], 'linux')).toBe('agent');
    calls.length = 0;
    agentCliOnPath('claude', { spawnSyncFn, platform: 'win32' });
    expect(binOf(calls[0], 'win32')).toBe('claude.cmd');
    calls.length = 0;
    // kiro-cli is the same name on every platform (no .cmd variant observed)
    agentCliOnPath('kiro', { spawnSyncFn, platform: 'win32' });
    expect(binOf(calls[0], 'win32')).toBe('kiro-cli');
  });

  it('uses a --version-style probe with a bounded timeout (never hangs)', () => {
    const { spawnSyncFn, calls } = fakeProbe({ status: 0, stdout: Buffer.from('ok') });
    // On posix the probe carries --version in argv; on win32 it's in the command
    // string. Assert against whichever the platform produced.
    agentCliOnPath('claude', { spawnSyncFn, platform: 'linux' });
    expect(calls[0].args).toContain('--version');
    expect(calls[0].opts.timeout).toBeGreaterThan(0);
    calls.length = 0;
    agentCliOnPath('claude', { spawnSyncFn, platform: 'win32' });
    expect(calls[0].bin).toContain('--version');
    // win32: spawnBinSync calls spawnImpl(cmdString, opts) — 2 args — so the opts
    // object lands in the fake's 2nd param (`args`), not the 3rd (`opts`).
    expect(calls[0].args.timeout).toBeGreaterThan(0);
  });

  it('claude-code is an accepted alias for claude', () => {
    const { spawnSyncFn, calls } = fakeProbe({ status: 0, stdout: Buffer.from('ok') });
    const r = agentCliOnPath('claude-code', { spawnSyncFn, platform: 'linux' });
    expect(r.present).toBe(true);
    expect(calls[0].bin).toBe('claude'); // posix: bin passed as-is
    expect(r.agent).toBe('claude'); // normalized
  });

  it('an unknown agent kind reports not-present with a clear reason, never throws', () => {
    const r = agentCliOnPath('nonsense-agent', { spawnSyncFn: () => ({ status: 0 }) });
    expect(r.present).toBe(false);
    expect(r.reason).toMatch(/unknown/i);
  });

  it('backendBinName maps each known agent to its platform bin', () => {
    expect(backendBinName('cursor', 'win32')).toBe('agent.cmd');
    expect(backendBinName('cursor', 'darwin')).toBe('agent');
    expect(backendBinName('kiro', 'win32')).toBe('kiro-cli');
    expect(backendBinName('claude', 'win32')).toBe('claude.cmd');
    expect(KNOWN_BACKEND_AGENTS).toContain('cursor');
    expect(KNOWN_BACKEND_AGENTS).toContain('kiro');
    expect(KNOWN_BACKEND_AGENTS).toContain('claude');
  });
});
