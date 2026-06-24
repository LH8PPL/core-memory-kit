// @doors: 1
// Door 2 N/A: pure resolver — returns a path, writes nothing.
// Door 3 N/A: no spawn — env + cwd injected, no subprocess.
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: no NDJSON/observability surface — a pure path resolver.

// Tests for resolveMcpProjectRoot — how `cmk mcp serve` decides which project it
// serves. The CUT-BLOCKER this fixes (2026-06-24): kiro-cli launches the MCP
// server from a cwd that is NOT the project, and only Claude Code sets
// CLAUDE_PROJECT_DIR, so mk_remember silently wrote to the wrong/no project in
// kiro-cli. The resolver adds a kit-own env (CMK_PROJECT_DIR) + a walk-up
// fallback so the server finds the project regardless of launcher cwd.
//
// Precedence (most-specific first):
//   1. CLAUDE_PROJECT_DIR  (Claude Code sets it)
//   2. CMK_PROJECT_DIR     (the kit sets it in the kiro-cli mcp.json `env`)
//   3. walk up from cwd to the nearest dir containing context/   (agent-agnostic)
//   4. cwd                 (last resort)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveMcpProjectRoot } from '../packages/cli/src/tier-paths.mjs';

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
      env: { CLAUDE_PROJECT_DIR: proj, CMK_PROJECT_DIR: join(sandbox, 'other') },
      cwd: join(sandbox, 'somewhere-else'),
    });
    expect(r).toBe(proj);
  });

  it('uses CMK_PROJECT_DIR when CLAUDE_PROJECT_DIR is unset (the kiro-cli fix)', () => {
    const proj = join(sandbox, 'kiro-proj');
    mkdirSync(join(proj, 'context'), { recursive: true });
    const r = resolveMcpProjectRoot({
      env: { CMK_PROJECT_DIR: proj },
      cwd: join(sandbox, 'kiro-cli-launch-dir'), // kiro launches the MCP from HERE, not the project
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

  it('CMK_PROJECT_DIR beats the walk-up (explicit env wins over discovery)', () => {
    const envProj = join(sandbox, 'env-proj');
    const cwdProj = join(sandbox, 'cwd-proj');
    mkdirSync(join(envProj, 'context'), { recursive: true });
    mkdirSync(join(cwdProj, 'context'), { recursive: true });
    const r = resolveMcpProjectRoot({ env: { CMK_PROJECT_DIR: envProj }, cwd: cwdProj });
    expect(r).toBe(envProj);
  });
});
