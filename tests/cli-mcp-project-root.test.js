// @doors: 1
// Door 2 N/A: pure resolver — returns a path, writes nothing.
// Door 3 N/A: no spawn — env + cwd injected, no subprocess.
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: no NDJSON/observability surface — a pure path resolver.

// Tests for resolveMcpProjectRoot — how `cmk mcp serve` decides which project it
// serves (the Claude Code + Kiro IDE MCP path; kiro-cli does not use MCP). The MCP
// server is a long-lived child launched by the agent, so it can't just trust cwd.
//
// Precedence: CLAUDE_PROJECT_DIR (Claude Code sets it) → walk up to the nearest
// dir containing context/ → cwd (last resort). Plus normalizeProjectPath, used by
// the `cmk remember`/`cmk search` --project flag (the kiro-cli explicit path).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { resolveMcpProjectRoot, normalizeProjectPath } from '../packages/cli/src/tier-paths.mjs';

const homedirForTest = homedir();

let sandbox;
beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-mcp-root-'));
});
afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe('resolveMcpProjectRoot — which project does `cmk mcp serve` serve', () => {
  it('prefers CLAUDE_PROJECT_DIR (Claude Code) above everything', () => {
    const proj = join(sandbox, 'claude-proj');
    mkdirSync(join(proj, 'context'), { recursive: true });
    const r = resolveMcpProjectRoot({
      env: { CLAUDE_PROJECT_DIR: proj },
      cwd: join(sandbox, 'somewhere-else'),
    });
    expect(r).toBe(proj);
  });

  it('walks UP from cwd to the nearest dir containing context/ when no env is set', () => {
    const proj = join(sandbox, 'walkup-proj');
    const deep = join(proj, 'src', 'nested', 'pkg');
    mkdirSync(join(proj, 'context'), { recursive: true });
    mkdirSync(deep, { recursive: true });
    const r = resolveMcpProjectRoot({ env: {}, cwd: deep });
    expect(r).toBe(proj); // found context/ by walking up
  });

  it('returns cwd itself when cwd IS the project (has context/)', () => {
    const proj = join(sandbox, 'cwd-is-proj');
    mkdirSync(join(proj, 'context'), { recursive: true });
    const r = resolveMcpProjectRoot({ env: {}, cwd: proj });
    expect(r).toBe(proj);
  });

  it('falls back to cwd as a last resort when no context/ is found anywhere up the tree', () => {
    const orphan = join(sandbox, 'no-context-here');
    mkdirSync(orphan, { recursive: true });
    const r = resolveMcpProjectRoot({ env: {}, cwd: orphan });
    expect(r).toBe(orphan); // nothing better than cwd
  });

  it('Task 168: does NOT escape into a stray ~/context/ (the home dir is the discovery boundary)', () => {
    // Regression for the real bug: the walk-up climbed above the intended project
    // into the user's HOME (the sandbox tmpdir IS under ~/AppData/Local/Temp), found
    // a stray `~/context/` (test debris / a cmk run that scaffolded in home), and
    // served the WRONG project from an unrelated subdir. The home dir is now the
    // discovery boundary, so a deep orphan with no project of its own returns its
    // own cwd — NEVER a stray ancestor `context/` at or above home.
    const orphan = join(sandbox, 'deep', 'sub', 'dir');
    mkdirSync(orphan, { recursive: true });
    const r = resolveMcpProjectRoot({ env: {}, cwd: orphan });
    expect(r).toBe(orphan);
    // It must not have walked up into home (the path is shorter than the orphan).
    expect(r.length).toBeGreaterThan(homedirForTest.length);
  });

  it('normalizeProjectPath converts a git-bash /c/Temp path to C:/Temp (the kiro-cli model emits these)', () => {
    expect(normalizeProjectPath('/c/Temp/kiro-gate')).toBe('C:/Temp/kiro-gate');
    expect(normalizeProjectPath('/d/work/proj')).toBe('D:/work/proj');
    // a normal Windows / POSIX path passes through unchanged
    expect(normalizeProjectPath('C:\\Temp\\proj')).toBe('C:\\Temp\\proj');
    expect(normalizeProjectPath('/home/me/proj')).toBe('/home/me/proj'); // not /<single-letter>/
    expect(normalizeProjectPath(undefined)).toBe(undefined);
  });
});
