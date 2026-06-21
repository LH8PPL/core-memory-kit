// @doors: 1, 2
// Door 3 N/A: composes file-writing modules (mutateAgentConfig + marker block +
//   skills/ide-hooks copies); no subprocess spawn.
// Door 4 N/A: no NDJSON/audit surface at this orchestrator level.
// Door 5 N/A: no message-queue interaction.

// Tests for Task 50 — installKiro: the all-4-surfaces Kiro orchestrator.
//
// D-182: Kiro needs its OWN installer branch (not the generic installAgent that
// assumed the wrong model). installKiro wires the FOUR verified surfaces:
//   MCP      → .kiro/settings/mcp.json (mcpServers.cmk)
//   steering → .kiro/steering/cmk.md (inclusion: always)
//   skills   → .kiro/skills/{memory-search,memory-write}/SKILL.md
//   IDE hooks→ .kiro/hooks/cmk-{capture,inject}.kiro.hook (agentStop/promptSubmit)
// (The CLI agent-config hook surface + default-agent is 50.L, a later PR.)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installKiro, uninstallKiro } from '../packages/cli/src/install-kiro.mjs';

let sandbox;
let projectRoot;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-install-kiro-'));
  projectRoot = join(sandbox, 'proj');
  mkdirSync(projectRoot, { recursive: true });
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

const p = (...parts) => join(projectRoot, '.kiro', ...parts);

describe('Task 50 — installKiro (all 4 surfaces)', () => {
  it('wires MCP + steering + skills + IDE hooks in one call', () => {
    const r = installKiro({ projectRoot });
    expect(r.action).toBe('installed');

    // MCP
    expect(existsSync(p('settings', 'mcp.json'))).toBe(true);
    const mcp = JSON.parse(readFileSync(p('settings', 'mcp.json'), 'utf8'));
    expect(mcp.mcpServers).toHaveProperty('claude-memory-kit');

    // steering
    expect(existsSync(p('steering', 'cmk.md'))).toBe(true);
    expect(readFileSync(p('steering', 'cmk.md'), 'utf8')).toMatch(/inclusion:\s*always/);

    // skills
    expect(existsSync(p('skills', 'memory-search', 'SKILL.md'))).toBe(true);
    expect(existsSync(p('skills', 'memory-write', 'SKILL.md'))).toBe(true);

    // IDE hooks
    expect(existsSync(p('hooks', 'cmk-capture.kiro.hook'))).toBe(true);
    expect(existsSync(p('hooks', 'cmk-inject.kiro.hook'))).toBe(true);
  });

  it('reports the surfaces it wired', () => {
    const r = installKiro({ projectRoot });
    expect(r.surfaces).toEqual(expect.arrayContaining(['mcp', 'steering', 'skills', 'ide-hooks']));
  });

  it('is idempotent — a second install reports no change', () => {
    installKiro({ projectRoot });
    const r2 = installKiro({ projectRoot });
    expect(r2.changed).toBe(false);
  });

  it('preserves a user-pre-existing MCP server (over-mutation guard)', () => {
    mkdirSync(p('settings'), { recursive: true });
    writeFileSync(
      p('settings', 'mcp.json'),
      JSON.stringify({ mcpServers: { theirs: { command: 'x' } } }, null, 2),
      'utf8',
    );
    installKiro({ projectRoot });
    const mcp = JSON.parse(readFileSync(p('settings', 'mcp.json'), 'utf8'));
    expect(mcp.mcpServers.theirs).toEqual({ command: 'x' });
    expect(mcp.mcpServers).toHaveProperty('claude-memory-kit');
  });

  it('refuses to clobber a corrupt mcp.json (returns error, file untouched)', () => {
    mkdirSync(p('settings'), { recursive: true });
    writeFileSync(p('settings', 'mcp.json'), '{ broken,,, ', 'utf8');
    const r = installKiro({ projectRoot });
    expect(r.action).toBe('error');
    expect(readFileSync(p('settings', 'mcp.json'), 'utf8')).toBe('{ broken,,, ');
  });

  describe('uninstallKiro removes our surfaces, preserves user content', () => {
    it('removes our MCP entry, steering, skills, hooks but keeps a sibling server', () => {
      mkdirSync(p('settings'), { recursive: true });
      writeFileSync(
        p('settings', 'mcp.json'),
        JSON.stringify({ mcpServers: { theirs: { command: 'x' } } }, null, 2),
        'utf8',
      );
      installKiro({ projectRoot });
      uninstallKiro({ projectRoot });

      const mcp = JSON.parse(readFileSync(p('settings', 'mcp.json'), 'utf8'));
      expect(mcp.mcpServers.theirs).toEqual({ command: 'x' }); // preserved
      expect(mcp.mcpServers['claude-memory-kit']).toBeUndefined(); // ours gone
      expect(existsSync(p('skills', 'memory-search'))).toBe(false);
      expect(existsSync(p('hooks', 'cmk-capture.kiro.hook'))).toBe(false);
    });
  });
});
