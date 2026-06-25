// @doors: 1, 2
// Door 3 N/A: writes a permissions.yaml file; no subprocess spawn.
// Door 4 N/A: no NDJSON/audit surface at this leg.
// Door 5 N/A: no message-queue interaction.

// Tests for Task 50.N.5 / D-203h/D-203i — pre-trust the kit's surfaces in Kiro
// IDE 1.0's authoritative trust store: ~/.kiro/workspace-roots/<hash>/
// permissions.yaml (capability/match/effect). <hash> = sha256(norm(projectRoot))
// .slice(0,16) — VERIFIED on a real install (c:/temp/kiro-ide-gate → a7ffdb64ec4c31c8).
// Without the `capability: skill` rule, the first memory-write skill-load prompts.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import yaml from 'js-yaml';
import {
  kiroWorkspaceHash,
  installKiroPermissions,
  uninstallKiroPermissions,
} from '../packages/cli/src/kiro-permissions.mjs';
import { installKiro } from '../packages/cli/src/install-kiro.mjs';

let sandbox;
let projectRoot;
let kiroHome; // stands in for ~ (USERPROFILE/HOME)

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-kiro-perms-'));
  projectRoot = join(sandbox, 'proj');
  kiroHome = join(sandbox, 'home');
  mkdirSync(projectRoot, { recursive: true });
  mkdirSync(kiroHome, { recursive: true });
});
afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

function permsPath() {
  return join(kiroHome, '.kiro', 'workspace-roots', kiroWorkspaceHash(projectRoot), 'permissions.yaml');
}

describe('kiroWorkspaceHash — the verified sha256-prefix algorithm (D-203h)', () => {
  it('matches Kiro IDE 1.0\'s real hash for c:/temp/kiro-ide-gate', () => {
    expect(kiroWorkspaceHash('c:/temp/kiro-ide-gate')).toBe('a7ffdb64ec4c31c8');
  });
  it('is robust to case / backslash / trailing-slash', () => {
    const want = 'a7ffdb64ec4c31c8';
    expect(kiroWorkspaceHash('C:\\Temp\\kiro-ide-gate')).toBe(want);
    expect(kiroWorkspaceHash('C:/TEMP/KIRO-IDE-GATE')).toBe(want);
    expect(kiroWorkspaceHash('c:/temp/kiro-ide-gate/')).toBe(want);
  });
  it('is the documented sha256(norm).slice(0,16)', () => {
    const norm = 'x:/y/z';
    expect(kiroWorkspaceHash('X:\\Y\\Z\\')).toBe(createHash('sha256').update(norm).digest('hex').slice(0, 16));
  });
});

describe('installKiroPermissions — writes the IDE 1.0 trust store (50.N.5)', () => {
  it('writes ~/.kiro/workspace-roots/<hash>/permissions.yaml with skill + mcp + shell rules', () => {
    const r = installKiroPermissions({ projectRoot, env: { USERPROFILE: kiroHome } });
    expect(r.action).toBe('installed');
    expect(existsSync(permsPath())).toBe(true);
    const y = readFileSync(permsPath(), 'utf8');
    // the load-bearing one: the skill rule (suppresses the Load-skill Allow prompt)
    expect(y).toMatch(/capability: skill/);
    expect(y).toMatch(/memory-write/);
    expect(y).toMatch(/memory-search/);
    // + the shell + mcp rules so the file is self-contained (not reliant on Kiro's
    // one-time .vscode migration)
    expect(y).toMatch(/capability: shell/);
    expect(y).toMatch(/cmk hook/);
    expect(y).toMatch(/capability: mcp/);
    expect(y).toMatch(/claude-memory-kit\/mk_remember/);
    expect(y).toMatch(/effect: allow/);
  });

  it('is idempotent — a second install reports no change', () => {
    installKiroPermissions({ projectRoot, env: { USERPROFILE: kiroHome } });
    const r2 = installKiroPermissions({ projectRoot, env: { USERPROFILE: kiroHome } });
    expect(r2.changed).toBe(false);
  });

  it('MERGES into an existing permissions.yaml, preserving the user\'s own rules (no clobber)', () => {
    // seed a user-authored rule
    const p = permsPath();
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, 'rules:\n  - capability: shell\n    match:\n      - my-own-tool *\n    effect: allow\n', 'utf8');
    installKiroPermissions({ projectRoot, env: { USERPROFILE: kiroHome } });
    const y = readFileSync(p, 'utf8');
    expect(y).toMatch(/my-own-tool/); // the user's rule survives
    expect(y).toMatch(/memory-write/); // ours added
  });

  it('uninstall removes ONLY the kit\'s rules; a user rule survives (over-mutation guard)', () => {
    const p = permsPath();
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, 'rules:\n  - capability: shell\n    match:\n      - my-own-tool *\n    effect: allow\n', 'utf8');
    installKiroPermissions({ projectRoot, env: { USERPROFILE: kiroHome } });
    uninstallKiroPermissions({ projectRoot, env: { USERPROFILE: kiroHome } });
    const y = existsSync(p) ? readFileSync(p, 'utf8') : '';
    expect(y).toMatch(/my-own-tool/);   // user rule preserved
    expect(y).not.toMatch(/memory-write/); // ours removed
  });

  it('the output matches Kiro IDE 1.0\'s real format (rules → shell, mcp, skill; effect: allow)', () => {
    installKiroPermissions({ projectRoot, env: { USERPROFILE: kiroHome } });
    const parsed = yaml.load(readFileSync(permsPath(), 'utf8'));
    expect(Array.isArray(parsed.rules)).toBe(true);
    const caps = parsed.rules.map((r) => r.capability);
    expect(caps).toEqual(['shell', 'mcp', 'skill']); // the exact order Kiro wrote
    expect(parsed.rules.every((r) => r.effect === 'allow')).toBe(true);
    expect(parsed.rules.find((r) => r.capability === 'mcp').match).toHaveLength(11); // all 11 tools
  });
});

describe('installKiro wires the permissions surface (50.N.5 integration)', () => {
  it('a full --ide kiro install reports the permissions surface + writes the file', () => {
    const savedHome = process.env.USERPROFILE;
    process.env.USERPROFILE = kiroHome; // installKiroPermissions resolves home from env
    try {
      const r = installKiro({ projectRoot });
      expect(r.surfaces).toContain('permissions');
      expect(existsSync(permsPath())).toBe(true);
    } finally {
      if (savedHome === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = savedHome;
    }
  });
});
