// @doors: 1, 2
// Door 3 N/A: installAgent writes config files via mutateAgentConfig + the
//   marker-block helper; no subprocess spawn at this surface.
// Door 4 N/A: no NDJSON/audit emission at this surface (installAgent returns a
//   structured result; the CLI owns the summary lines).
// Door 5 N/A: no message-queue interaction.

// Tests for Task 196 — installAgent(cursor): the hooks-json mechanism.
//
// Cursor's hook surface is a dedicated `.cursor/hooks.json` with a top-level
// `{version: 1, hooks: {<event>: [{command}]}}` shape (cursor.com/docs/agent/
// hooks). Every wired event calls ONE dispatcher command (`cmk cursor-hook` —
// the event rides in the payload), platform-wrapped on Windows. The instruction
// leg is a `.cursor/rules/*.mdc` with `alwaysApply: true` frontmatter (a plain
// .md would be silently ignored by Cursor). The research-note warning this file
// exists for: claude-mem's Cursor installer CLOBBERED the whole hooks.json —
// the kit's over-mutation guard asserts siblings survive.

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
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-install-cursor-'));
  projectRoot = join(sandbox, 'proj');
  mkdirSync(projectRoot, { recursive: true });
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

const cursor = () => getAgentProfile('cursor');

const CURSOR_EVENTS = [
  'sessionStart',
  'beforeSubmitPrompt',
  'afterFileEdit',
  'afterAgentResponse',
  'sessionEnd',
  'beforeShellExecution',
];

describe('Task 196 — installAgent (Cursor)', () => {
  describe('all three legs land in the Cursor-verified paths', () => {
    it('wires MCP, the versioned hooks.json, and the .mdc rule', () => {
      const r = installAgent({ projectRoot, profile: cursor() });

      // Door 1 — Response
      expect(r.action).toBe('installed');
      expect(r.agent).toBe('cursor');

      // Door 2 — MCP at .cursor/mcp.json
      const mcp = JSON.parse(readFileSync(join(projectRoot, '.cursor', 'mcp.json'), 'utf8'));
      expect(mcp.mcpServers).toHaveProperty('core-memory-kit');

      // hooks.json: Cursor's REQUIRED top-level shape — version + hooks
      const hooksCfg = JSON.parse(readFileSync(join(projectRoot, '.cursor', 'hooks.json'), 'utf8'));
      expect(hooksCfg.version).toBe(1);
      for (const ev of CURSOR_EVENTS) {
        expect(hooksCfg.hooks).toHaveProperty(ev);
        expect(Array.isArray(hooksCfg.hooks[ev])).toBe(true);
        // ONE dispatcher command for every event (hook_event_name routes)
        expect(hooksCfg.hooks[ev][0].command).toMatch(/cmk cursor-hook$/);
      }

      // the .mdc rule with alwaysApply frontmatter + the managed markers
      const mdc = readFileSync(
        join(projectRoot, '.cursor', 'rules', 'core-memory-kit.mdc'),
        'utf8',
      );
      expect(mdc).toMatch(/^---\n/);
      expect(mdc).toMatch(/alwaysApply:\s*true/);
      expect(mdc).toContain('<!-- core-memory-kit:start -->');
      expect(mdc).toContain('cmk search');
    });

    it('is idempotent — a second install reports changed:false', () => {
      installAgent({ projectRoot, profile: cursor() });
      const r2 = installAgent({ projectRoot, profile: cursor() });
      expect(r2.changed).toBe(false);
    });
  });

  describe('touch-only-our-keys (the anti-clobber guard the claude-mem Cursor installer lacked)', () => {
    it('preserves the user\'s existing hooks + version + sibling MCP servers (over-mutation)', () => {
      mkdirSync(join(projectRoot, '.cursor'), { recursive: true });
      // seed a user hooks.json: their own hook on an event we also wire, their
      // own event we don't touch, and a custom version
      writeFileSync(
        join(projectRoot, '.cursor', 'hooks.json'),
        JSON.stringify({
          version: 1,
          hooks: {
            beforeReadFile: [{ command: 'their-secret-scanner' }],
          },
        }),
        'utf8',
      );
      // seed a sibling MCP server
      writeFileSync(
        join(projectRoot, '.cursor', 'mcp.json'),
        JSON.stringify({ mcpServers: { 'their-server': { command: 'x' } } }),
        'utf8',
      );

      const r = installAgent({ projectRoot, profile: cursor() });
      expect(r.action).toBe('installed');

      const hooksCfg = JSON.parse(readFileSync(join(projectRoot, '.cursor', 'hooks.json'), 'utf8'));
      // theirs survives
      expect(hooksCfg.hooks.beforeReadFile[0].command).toBe('their-secret-scanner');
      // ours landed
      expect(hooksCfg.hooks.sessionStart[0].command).toMatch(/cmk cursor-hook$/);
      expect(hooksCfg.version).toBe(1);

      const mcp = JSON.parse(readFileSync(join(projectRoot, '.cursor', 'mcp.json'), 'utf8'));
      expect(mcp.mcpServers['their-server']).toEqual({ command: 'x' });
      expect(mcp.mcpServers).toHaveProperty('core-memory-kit');
    });

    it('a corrupt hooks.json is NEVER overwritten (refuse-to-clobber)', () => {
      mkdirSync(join(projectRoot, '.cursor'), { recursive: true });
      writeFileSync(join(projectRoot, '.cursor', 'hooks.json'), '{not json', 'utf8');
      // MCP leg must land first for the hooks leg to be attempted
      const r = installAgent({ projectRoot, profile: cursor() });
      expect(r.action).toBe('error');
      expect(readFileSync(join(projectRoot, '.cursor', 'hooks.json'), 'utf8')).toBe('{not json');
    });
  });

  describe('uninstall removes only the kit surface', () => {
    it('strips our events + MCP key + the rule block; the user\'s hooks survive (over-mutation)', () => {
      mkdirSync(join(projectRoot, '.cursor'), { recursive: true });
      writeFileSync(
        join(projectRoot, '.cursor', 'hooks.json'),
        JSON.stringify({ version: 1, hooks: { beforeReadFile: [{ command: 'theirs' }] } }),
        'utf8',
      );
      installAgent({ projectRoot, profile: cursor() });

      const r = uninstallAgent({ projectRoot, profile: cursor() });
      expect(r.changed).toBe(true);

      const hooksCfg = JSON.parse(readFileSync(join(projectRoot, '.cursor', 'hooks.json'), 'utf8'));
      for (const ev of CURSOR_EVENTS) {
        expect(hooksCfg.hooks?.[ev]).toBeUndefined();
      }
      // theirs survives, untouched
      expect(hooksCfg.hooks.beforeReadFile[0].command).toBe('theirs');

      // the .mdc managed block is gone
      const mdcPath = join(projectRoot, '.cursor', 'rules', 'core-memory-kit.mdc');
      if (existsSync(mdcPath)) {
        expect(readFileSync(mdcPath, 'utf8')).not.toContain('core-memory-kit:start');
      }
    });

    it('on a kit-only install, uninstall leaves no kit hook residue (empty hooks pruned)', () => {
      installAgent({ projectRoot, profile: cursor() });
      uninstallAgent({ projectRoot, profile: cursor() });
      const hooksCfg = JSON.parse(readFileSync(join(projectRoot, '.cursor', 'hooks.json'), 'utf8'));
      expect(hooksCfg.hooks).toBeUndefined();
      // {version: 1} residue is accepted — a 1-key inert file beats deleting a
      // file we can't prove we created.
    });

    it('a kit-only .mdc rule is DELETED on uninstall (an empty alwaysApply rule is kit-shaped residue)', () => {
      installAgent({ projectRoot, profile: cursor() });
      uninstallAgent({ projectRoot, profile: cursor() });
      // frontmatter-only leftovers would be an always-applied EMPTY rule — the
      // live-test residue find. Kit-authored file, kit block gone → file gone.
      expect(existsSync(join(projectRoot, '.cursor', 'rules', 'core-memory-kit.mdc'))).toBe(false);
    });

    it('a CRLF-normalized kit-only .mdc is STILL deleted on uninstall (Windows autocrlf; skill-review #2)', () => {
      installAgent({ projectRoot, profile: cursor() });
      const mdcPath = join(projectRoot, '.cursor', 'rules', 'core-memory-kit.mdc');
      // simulate a Windows editor / git autocrlf rewrite of the whole file
      writeFileSync(mdcPath, readFileSync(mdcPath, 'utf8').replace(/\n/g, '\r\n'), 'utf8');
      uninstallAgent({ projectRoot, profile: cursor() });
      expect(existsSync(mdcPath)).toBe(false);
    });

    it('a .mdc the user added their own content to SURVIVES uninstall (only our block is stripped)', () => {
      installAgent({ projectRoot, profile: cursor() });
      const mdcPath = join(projectRoot, '.cursor', 'rules', 'core-memory-kit.mdc');
      writeFileSync(mdcPath, `${readFileSync(mdcPath, 'utf8')}\nMy own always-on note.\n`, 'utf8');
      uninstallAgent({ projectRoot, profile: cursor() });
      expect(existsSync(mdcPath)).toBe(true);
      const left = readFileSync(mdcPath, 'utf8');
      expect(left).toContain('My own always-on note.');
      expect(left).not.toContain('core-memory-kit:start');
    });
  });
});
