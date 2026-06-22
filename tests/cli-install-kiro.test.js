// @doors: 1, 2
// Door 3 N/A: composes file-writing modules (mutateAgentConfig + marker block +
//   skills/ide-hooks copies); no subprocess spawn.
// Door 4 N/A: no NDJSON/audit surface at this orchestrator level.
// Door 5 N/A: no message-queue interaction.

// Tests for Task 50 — installKiro: the Kiro orchestrator (all surfaces).
//
// D-182: Kiro needs its OWN installer branch (not the generic installAgent that
// assumed the wrong model). installKiro wires the verified surfaces:
//   MCP       → .kiro/settings/mcp.json (mcpServers.cmk)
//   steering  → .kiro/steering/cmk.md (inclusion: always)
//   skills    → .kiro/skills/{memory-search,memory-write}/SKILL.md
//   IDE hooks → .kiro/hooks/cmk-{capture,inject}.kiro.hook (agentStop/promptSubmit)
//   CLI agent → ~/.aws/amazonq/cli-agents/ (agentSpawn/stop hooks + default-agent)
// `userDir` is always passed in tests so the CLI-agent leg writes to a sandbox,
// NEVER the real ~/.aws (the test-isolation rule for user-tier writes).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installKiro, uninstallKiro } from '../packages/cli/src/install-kiro.mjs';

let sandbox;
let projectRoot;
let awsDir;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-install-kiro-'));
  projectRoot = join(sandbox, 'proj');
  awsDir = join(sandbox, 'aws'); // sandbox the CLI-agent (~/.aws) leg so the CLI-agent leg never touches the real home
  mkdirSync(projectRoot, { recursive: true });
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

const p = (...parts) => join(projectRoot, '.kiro', ...parts);

describe('Task 50 — installKiro (all 4 surfaces)', () => {
  it('wires MCP + steering + skills + IDE hooks in one call', () => {
    const r = installKiro({ projectRoot, awsDir });
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

    // AGENTS.md (project root — Kiro's always-loaded instruction file; D-188)
    const agentsMd = join(projectRoot, 'AGENTS.md');
    expect(existsSync(agentsMd)).toBe(true);
    expect(readFileSync(agentsMd, 'utf8')).toMatch(/claude-memory-kit/);
  });

  it('reports the surfaces it wired', () => {
    const r = installKiro({ projectRoot, awsDir });
    expect(r.surfaces).toEqual(
      expect.arrayContaining(['mcp', 'steering', 'agents-md', 'skills', 'ide-hooks', 'cli-agent']),
    );
  });

  it('AGENTS.md: appends our managed block, byte-preserving a user-authored AGENTS.md', () => {
    const agentsMd = join(projectRoot, 'AGENTS.md');
    mkdirSync(projectRoot, { recursive: true });
    writeFileSync(agentsMd, '# My project agent rules\n\nAlways use uv.\n', 'utf8');
    installKiro({ projectRoot, awsDir });
    const body = readFileSync(agentsMd, 'utf8');
    expect(body).toMatch(/My project agent rules/); // user content preserved
    expect(body).toMatch(/Always use uv\./);
    expect(body).toMatch(/claude-memory-kit:start/); // our managed block appended
  });

  it('is idempotent — a second install reports no change', () => {
    installKiro({ projectRoot, awsDir });
    const r2 = installKiro({ projectRoot, awsDir });
    expect(r2.changed).toBe(false);
  });

  it('preserves a user-pre-existing MCP server (over-mutation guard)', () => {
    mkdirSync(p('settings'), { recursive: true });
    writeFileSync(
      p('settings', 'mcp.json'),
      JSON.stringify({ mcpServers: { theirs: { command: 'x' } } }, null, 2),
      'utf8',
    );
    installKiro({ projectRoot, awsDir });
    const mcp = JSON.parse(readFileSync(p('settings', 'mcp.json'), 'utf8'));
    expect(mcp.mcpServers.theirs).toEqual({ command: 'x' });
    expect(mcp.mcpServers).toHaveProperty('claude-memory-kit');
  });

  it('refuses to clobber a corrupt mcp.json (returns error, file untouched)', () => {
    mkdirSync(p('settings'), { recursive: true });
    writeFileSync(p('settings', 'mcp.json'), '{ broken,,, ', 'utf8');
    const r = installKiro({ projectRoot, awsDir });
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
      installKiro({ projectRoot, awsDir });
      uninstallKiro({ projectRoot, awsDir });

      const mcp = JSON.parse(readFileSync(p('settings', 'mcp.json'), 'utf8'));
      expect(mcp.mcpServers.theirs).toEqual({ command: 'x' }); // preserved
      expect(mcp.mcpServers['claude-memory-kit']).toBeUndefined(); // ours gone
      expect(existsSync(p('skills', 'memory-search'))).toBe(false);
      expect(existsSync(p('hooks', 'cmk-capture.kiro.hook'))).toBe(false);
    });

    it('strips our AGENTS.md managed block but byte-preserves the user content', () => {
      const agentsMd = join(projectRoot, 'AGENTS.md');
      mkdirSync(projectRoot, { recursive: true });
      writeFileSync(agentsMd, '# User rules\n\nAlways use uv.\n', 'utf8');
      installKiro({ projectRoot, awsDir });
      uninstallKiro({ projectRoot, awsDir });
      const body = readFileSync(agentsMd, 'utf8');
      expect(body).toMatch(/User rules/); // user content survives
      expect(body).not.toMatch(/claude-memory-kit:start/); // our block gone
    });

    it('never touches context/ (the shared brain is preserved on uninstall)', () => {
      mkdirSync(join(projectRoot, 'context'), { recursive: true });
      writeFileSync(join(projectRoot, 'context', 'MEMORY.md'), '# shared brain\n', 'utf8');
      installKiro({ projectRoot, awsDir });
      uninstallKiro({ projectRoot, awsDir });
      expect(existsSync(join(projectRoot, 'context', 'MEMORY.md'))).toBe(true);
      expect(readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8')).toMatch(/shared brain/);
    });

    // D-191: a clean install → uninstall must NOT leave empty husk files (an
    // empty AGENTS.md, a {} mcp.json, a frontmatter-only steering file). The
    // kit created those files; if uninstall empties them, remove them — but ONLY
    // when no user content remains (the preserve-user-content test above is the
    // guard that this doesn't over-delete).
    it('removes kit-CREATED files left empty by uninstall (no husks)', () => {
      installKiro({ projectRoot, awsDir }); // a fresh install — all files are ours
      uninstallKiro({ projectRoot, awsDir });
      // none of these kit-only files should remain as empty husks
      expect(existsSync(join(projectRoot, 'AGENTS.md'))).toBe(false);
      expect(existsSync(p('steering', 'cmk.md'))).toBe(false);
      expect(existsSync(p('settings', 'mcp.json'))).toBe(false);
    });

    it('a husk-emptied mcp.json with a sibling server is KEPT (not over-deleted)', () => {
      mkdirSync(p('settings'), { recursive: true });
      writeFileSync(
        p('settings', 'mcp.json'),
        JSON.stringify({ mcpServers: { theirs: { command: 'x' } } }, null, 2),
        'utf8',
      );
      installKiro({ projectRoot, awsDir });
      uninstallKiro({ projectRoot, awsDir });
      // our key gone, but the file stays because a user server remains
      expect(existsSync(p('settings', 'mcp.json'))).toBe(true);
      expect(JSON.parse(readFileSync(p('settings', 'mcp.json'), 'utf8')).mcpServers.theirs).toEqual({ command: 'x' });
    });

    // B1 regression (skill-review): the husk predicate must NOT match a file
    // that has user content bordered by `---`. A naive `---[\s\S]*?---$` regex
    // backtracks to a later `---` (a user horizontal rule) and would DELETE the
    // user's notes. These seed exactly that shape and assert the file SURVIVES.
    it('KEEPS a steering file whose user notes END in a --- horizontal rule (no data loss)', () => {
      installKiro({ projectRoot, awsDir });
      const steer = p('steering', 'cmk.md');
      // the kit steering already starts with `---\ninclusion: always\n---`; append
      // user notes that THEMSELVES end in a `---` hr — the B1 trap.
      writeFileSync(steer, readFileSync(steer, 'utf8') + '\n## My team notes\n\nUse tabs.\n\n---\n', 'utf8');
      uninstallKiro({ projectRoot, awsDir });
      expect(existsSync(steer)).toBe(true); // NOT deleted
      expect(readFileSync(steer, 'utf8')).toMatch(/My team notes/); // user content intact
      expect(readFileSync(steer, 'utf8')).not.toMatch(/claude-memory-kit:start/); // our block still gone
    });

    it('KEEPS an AGENTS.md with user frontmatter + body + a trailing --- (no data loss)', () => {
      const agentsMd = join(projectRoot, 'AGENTS.md');
      mkdirSync(projectRoot, { recursive: true });
      // user authored: frontmatter, body, AND a trailing hr — the B1 trap shape
      writeFileSync(agentsMd, '---\nowner: me\n---\n\n# My rules\n\nAlways use uv.\n\n---\n', 'utf8');
      installKiro({ projectRoot, awsDir });
      uninstallKiro({ projectRoot, awsDir });
      expect(existsSync(agentsMd)).toBe(true);
      expect(readFileSync(agentsMd, 'utf8')).toMatch(/My rules/);
    });
  });
});
