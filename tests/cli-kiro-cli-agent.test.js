// @doors: 1, 2
// Door 3 N/A: writes agent-config + settings JSON; no subprocess spawn.
// Door 4 N/A: no NDJSON/audit surface at this leg.
// Door 5 N/A: no message-queue interaction.

// Tests for Task 50.L — the Kiro CLI agent-config + guarded default-agent.
//
// Kiro CLI (= Amazon Q Developer CLI) hooks live in an agent-config JSON
// (.amazonq/cli-agents/<name>.json), and auto-fire ONLY for the resolved-active
// agent — so the kit must register cmk as the DEFAULT agent (D-182). The shape
// is the authoritative Rust contract (5 triggers, camelCase, timeout_ms), NOT
// the stale agent-v1.json. Reuses the same `cmk hook <event>` dispatcher as the
// IDE surface + Claude Code. Default registration is GUARDED — never clobbers a
// user's existing default agent.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installKiroCliAgent, uninstallKiroCliAgent } from '../packages/cli/src/kiro-cli-agent.mjs';

let sandbox;
let awsDir;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-kiro-cli-'));
  awsDir = join(sandbox, 'aws'); // the .aws base (sandboxed)
  mkdirSync(awsDir, { recursive: true });
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

const agentPath = () => join(awsDir, 'amazonq', 'cli-agents', 'q_cli_default.json');
const settingsPath = () => join(awsDir, 'amazonq', 'settings.json');

describe('Task 50.L — Kiro CLI agent-config + default-agent', () => {
  describe('fresh install (no existing default)', () => {
    it('writes q_cli_default.json with the Rust-contract hook shape', () => {
      const r = installKiroCliAgent({ awsDir });
      expect(r.action).toBe('installed');
      expect(existsSync(agentPath())).toBe(true);

      const agent = JSON.parse(readFileSync(agentPath(), 'utf8'));
      // hooks: object keyed by trigger → array of {command, timeout_ms} (Rust contract)
      expect(agent.hooks.agentSpawn[0].command).toMatch(/cmk hook agentSpawn/);
      expect(agent.hooks.stop[0].command).toMatch(/cmk hook stop/);
      expect(typeof agent.hooks.stop[0].timeout_ms).toBe('number'); // NOT `timeout`
      // carries MCP + the instruction prompt
      expect(agent.mcpServers).toBeDefined();
      expect(agent.prompt).toMatch(/AGENTS\.md/);
      // structural ownership marker (M-2) — the uninstall key, not a description substring
      expect(agent.managedBy).toBe('claude-memory-kit');
    });

    it('the hook command is platform-correct (cmd.exe /c on Windows)', () => {
      installKiroCliAgent({ awsDir });
      const agent = JSON.parse(readFileSync(agentPath(), 'utf8'));
      if (process.platform === 'win32') {
        expect(agent.hooks.stop[0].command).toBe('cmd.exe /c cmk hook stop');
      } else {
        expect(agent.hooks.stop[0].command).toBe('cmk hook stop');
      }
    });

    it('reports that it set the default agent', () => {
      const r = installKiroCliAgent({ awsDir });
      expect(r.defaultAgent).toBe('set');
    });

    it('a second install of byte-identical content reports changed:false (idempotent)', () => {
      const first = installKiroCliAgent({ awsDir });
      expect(first.changed).toBe(true); // fresh write
      const second = installKiroCliAgent({ awsDir });
      expect(second.changed).toBe(false); // no-op re-install
    });
  });

  describe('guarded default (the user already has one)', () => {
    it('does NOT clobber an existing chat.defaultAgent — installs cmk agent but reports a notice', () => {
      mkdirSync(join(awsDir, 'amazonq'), { recursive: true });
      writeFileSync(settingsPath(), JSON.stringify({ 'chat.defaultAgent': 'their-agent' }), 'utf8');

      const r = installKiroCliAgent({ awsDir });
      // the cmk agent file still installs (named cmk, not q_cli_default, to avoid override)
      expect(r.action).toBe('installed');
      expect(r.defaultAgent).toBe('skipped-existing');
      // their default is untouched
      const settings = JSON.parse(readFileSync(settingsPath(), 'utf8'));
      expect(settings['chat.defaultAgent']).toBe('their-agent');
    });

    // D-187 (cut-gate-kiro live find): a settings.json written by a Windows
    // editor / PowerShell `Set-Content -Encoding utf8` carries a UTF-8 BOM. The
    // guard read it with a bare JSON.parse → threw → concluded "no default" →
    // CLOBBERED the user's default with q_cli_default.json. The guard must be
    // BOM-tolerant (this test seeds the BOM the bare-JSON.parse choked on).
    it('does NOT clobber an existing chat.defaultAgent when settings.json has a UTF-8 BOM', () => {
      mkdirSync(join(awsDir, 'amazonq'), { recursive: true });
      const BOM = '﻿';
      writeFileSync(settingsPath(), `${BOM}${JSON.stringify({ 'chat.defaultAgent': 'their-agent' })}`, 'utf8');

      const r = installKiroCliAgent({ awsDir });
      expect(r.defaultAgent).toBe('skipped-existing'); // guard SAW the BOM'd default
      // the kit wrote the NAMED cmk.json, NOT q_cli_default.json (no clobber)
      expect(existsSync(join(awsDir, 'amazonq', 'cli-agents', 'cmk.json'))).toBe(true);
      expect(existsSync(agentPath())).toBe(false); // no q_cli_default.json from us
    });

    it('does NOT clobber an existing q_cli_default.json the user authored', () => {
      mkdirSync(join(awsDir, 'amazonq', 'cli-agents'), { recursive: true });
      writeFileSync(agentPath(), JSON.stringify({ name: 'q_cli_default', mine: true }), 'utf8');

      const r = installKiroCliAgent({ awsDir });
      expect(r.defaultAgent).toBe('skipped-existing');
      // their file is preserved (we wrote a named cmk.json instead)
      expect(JSON.parse(readFileSync(agentPath(), 'utf8')).mine).toBe(true);
    });
  });

  describe('uninstall', () => {
    it('removes our agent-config but preserves user settings', () => {
      installKiroCliAgent({ awsDir });
      expect(existsSync(agentPath())).toBe(true);
      uninstallKiroCliAgent({ awsDir });
      expect(existsSync(agentPath())).toBe(false);
    });

    // Over-mutation guard (the I-3 fix): when the user already had a default,
    // we installed a NAMED cmk.json and left their q_cli_default.json alone —
    // uninstall must remove ONLY our cmk.json and leave the user's file AND
    // their settings.json byte-untouched (delete-one ≠ delete-all).
    it('in the skipped-existing case, uninstall preserves the user default + settings', () => {
      mkdirSync(join(awsDir, 'amazonq', 'cli-agents'), { recursive: true });
      const userDefault = JSON.stringify({ name: 'q_cli_default', mine: true });
      writeFileSync(agentPath(), userDefault, 'utf8');
      const userSettings = JSON.stringify({ 'chat.defaultAgent': 'their-agent' });
      writeFileSync(settingsPath(), userSettings, 'utf8');

      const r = installKiroCliAgent({ awsDir });
      expect(r.defaultAgent).toBe('skipped-existing');
      const namedPath = join(awsDir, 'amazonq', 'cli-agents', 'cmk.json');
      expect(existsSync(namedPath)).toBe(true); // our named agent landed

      uninstallKiroCliAgent({ awsDir });

      expect(existsSync(namedPath)).toBe(false); // ours gone
      expect(readFileSync(agentPath(), 'utf8')).toBe(userDefault); // their default byte-untouched
      expect(readFileSync(settingsPath(), 'utf8')).toBe(userSettings); // their settings byte-untouched
    });
  });
});
