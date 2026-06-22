// @doors: 1, 2
// Door 3 N/A: writes .vscode/settings.json; no subprocess spawn.
// Door 4 N/A: no NDJSON/audit surface at this leg.
// Door 5 N/A: no message-queue interaction.

// Tests for D-194 — the Kiro IDE command-trust surface.
//
// Kiro gates a hook's shell command behind a "Run / Reject" approval prompt
// unless the command is pre-trusted (kiro.dev/docs/cli/chat/permissions). The
// IDE trust mechanism is `kiroAgent.trustedCommands` (an array of wildcard-PREFIX
// patterns) in settings.json — workspace scope `.vscode/settings.json`. Without
// it, the kit's inject/capture/guard hooks prompt every turn, so "automatic
// memory" isn't automatic.
//
// This leg writes the kit's OWN hook-command prefixes into
// `.vscode/settings.json` `kiroAgent.trustedCommands`, array-union (a user's
// existing trusted commands are preserved + deduped), refuse-to-clobber on a
// corrupt file, BOM-tolerant, idempotent. Uninstall removes ONLY our patterns.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  installKiroTrustedCommands,
  uninstallKiroTrustedCommands,
  kitTrustedCommandPatterns,
} from '../packages/cli/src/kiro-trusted-commands.mjs';

let sandbox;
let projectRoot;
let settingsPath;

const IS_WINDOWS = process.platform === 'win32';

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-kiro-trust-'));
  projectRoot = join(sandbox, 'proj');
  settingsPath = join(projectRoot, '.vscode', 'settings.json');
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

function readSettings() {
  return JSON.parse(readFileSync(settingsPath, 'utf8'));
}

describe('D-194 — Kiro trusted-commands (auto-approve the kit hooks)', () => {
  // ── Door 1 (response) + Door 2 (state): the write ─────────────────────────

  it('writes kiroAgent.trustedCommands into .vscode/settings.json on a fresh project', () => {
    const r = installKiroTrustedCommands({ projectRoot });
    expect(r.action).toBe('installed');
    expect(r.changed).toBe(true);
    expect(existsSync(settingsPath)).toBe(true);

    const s = readSettings();
    expect(Array.isArray(s['kiroAgent.trustedCommands'])).toBe(true);
    // every kit pattern is present
    for (const p of kitTrustedCommandPatterns()) {
      expect(s['kiroAgent.trustedCommands']).toContain(p);
    }
  });

  it('the trusted patterns cover the kit hook + guard commands by prefix (platform-correct)', () => {
    const patterns = kitTrustedCommandPatterns();
    if (IS_WINDOWS) {
      expect(patterns).toContain('cmd.exe /c cmk hook *');
      expect(patterns).toContain('cmd.exe /c cmk-guard-memory*');
    } else {
      expect(patterns).toContain('cmk hook *');
      expect(patterns).toContain('cmk-guard-memory*');
    }
    // never the over-permissive blanket wildcard (docs warn; trust matches prefix)
    expect(patterns).not.toContain('*');
    expect(patterns).not.toContain('cmd.exe /c *');
  });

  // ── over-mutation guard: preserve the user's existing trusted commands ─────

  it('array-unions into an existing trustedCommands — user entries are preserved + deduped', () => {
    mkdirSync(join(projectRoot, '.vscode'), { recursive: true });
    writeFileSync(
      settingsPath,
      JSON.stringify({ 'kiroAgent.trustedCommands': ['npm *', 'git *'], 'editor.tabSize': 2 }, null, 2),
      'utf8',
    );

    installKiroTrustedCommands({ projectRoot });
    const s = readSettings();

    // user entries survive
    expect(s['kiroAgent.trustedCommands']).toContain('npm *');
    expect(s['kiroAgent.trustedCommands']).toContain('git *');
    // a sibling setting is byte-preserved
    expect(s['editor.tabSize']).toBe(2);
    // ours added
    for (const p of kitTrustedCommandPatterns()) {
      expect(s['kiroAgent.trustedCommands']).toContain(p);
    }
    // no duplicate of a user entry
    const npmCount = s['kiroAgent.trustedCommands'].filter((c) => c === 'npm *').length;
    expect(npmCount).toBe(1);
  });

  it('is idempotent — a second install writes nothing new (changed:false)', () => {
    installKiroTrustedCommands({ projectRoot });
    const r2 = installKiroTrustedCommands({ projectRoot });
    expect(r2.changed).toBe(false);
    expect(r2.action).toBe('skipped');
    // no duplicate kit patterns from the re-run
    const s = readSettings();
    const first = kitTrustedCommandPatterns()[0];
    expect(s['kiroAgent.trustedCommands'].filter((c) => c === first).length).toBe(1);
  });

  // ── refuse-to-clobber: a corrupt settings.json is never overwritten ───────

  it('refuses to overwrite a corrupt .vscode/settings.json (returns error, writes nothing)', () => {
    mkdirSync(join(projectRoot, '.vscode'), { recursive: true });
    writeFileSync(settingsPath, '{ this is not json', 'utf8');

    const r = installKiroTrustedCommands({ projectRoot });
    expect(r.action).toBe('error');
    expect(r.changed).toBe(false);
    // the corrupt content is untouched
    expect(readFileSync(settingsPath, 'utf8')).toBe('{ this is not json');
  });

  // ── BOM tolerance (D-187 class): a Windows-editor BOM must not false-corrupt ─

  it('tolerates a UTF-8 BOM on settings.json (does not false-fail, preserves user keys)', () => {
    mkdirSync(join(projectRoot, '.vscode'), { recursive: true });
    const bom = '﻿';
    writeFileSync(settingsPath, bom + JSON.stringify({ 'editor.tabSize': 4 }, null, 2), 'utf8');

    const r = installKiroTrustedCommands({ projectRoot });
    expect(r.action).not.toBe('error');
    const s = readSettings();
    expect(s['editor.tabSize']).toBe(4);
    expect(s['kiroAgent.trustedCommands']).toContain(kitTrustedCommandPatterns()[0]);
  });

  // ── uninstall: remove ONLY our patterns, preserve the user's ──────────────

  it('uninstall removes only the kit patterns, preserves user trusted commands', () => {
    mkdirSync(join(projectRoot, '.vscode'), { recursive: true });
    writeFileSync(
      settingsPath,
      JSON.stringify({ 'kiroAgent.trustedCommands': ['npm *'] }, null, 2),
      'utf8',
    );
    installKiroTrustedCommands({ projectRoot });

    const r = uninstallKiroTrustedCommands({ projectRoot });
    expect(r.changed).toBe(true);

    const s = readSettings();
    // user entry survives
    expect(s['kiroAgent.trustedCommands']).toContain('npm *');
    // ours gone
    for (const p of kitTrustedCommandPatterns()) {
      expect(s['kiroAgent.trustedCommands']).not.toContain(p);
    }
  });

  it('uninstall prunes an emptied trustedCommands key (no orphan empty array)', () => {
    // fresh install (only our patterns), then uninstall → key should be gone
    installKiroTrustedCommands({ projectRoot });
    uninstallKiroTrustedCommands({ projectRoot });
    const s = readSettings();
    expect(s['kiroAgent.trustedCommands']).toBeUndefined();
  });

  it('uninstall on a project with no .vscode/settings.json is a no-op (changed:false)', () => {
    const r = uninstallKiroTrustedCommands({ projectRoot });
    expect(r.changed).toBe(false);
    expect(existsSync(settingsPath)).toBe(false);
  });
});
