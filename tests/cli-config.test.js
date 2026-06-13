// @doors: 1, 2
// Door 2: set writes context[.local]/settings.json; tests assert the file state.
// Door 3 N/A: pure file IO, no subprocess.
// Door 4 N/A: no message-queue.
// Door 5 N/A: config is not an audited mutation (it's a settings file, not a
//   memory observation — the audit log tracks memory writes, design §6.8).
//
// Task 129 (D-121) — `cmk config get/set/--show-origin`. The v0.1.0 stub
// became real the day `--with-semantic` shipped: context/settings.json now
// carries a user-facing setting (search.default_mode) and hand-editing JSON
// was the only path. Built on Task 46's mergeProjectSettings (the safe
// read-merge-write core). Tier precedence local > project > user (the kit's
// settings model, design §7.1 deep-merge).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configGet, configSet, configShowOrigin } from '../packages/cli/src/config-core.mjs';
import { runConfigGet, runConfigSet, runConfigShowOrigin, runConfigCli } from '../packages/cli/src/subcommands.mjs';

let sandbox;
let projectRoot;
let userDir;

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-config-'));
  projectRoot = join(sandbox, 'proj');
  userDir = join(sandbox, 'user');
  mkdirSync(join(projectRoot, 'context'), { recursive: true });
  mkdirSync(join(projectRoot, 'context.local'), { recursive: true });
  mkdirSync(userDir, { recursive: true });
});

afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

const seed = (tierDir, obj) =>
  writeFileSync(join(tierDir, 'settings.json'), JSON.stringify(obj, null, 2), 'utf8');

describe('Task 129 — configGet (Door 1)', () => {
  it('resolves a dotted key from the project tier', () => {
    seed(join(projectRoot, 'context'), { search: { default_mode: 'hybrid' } });
    const r = configGet('search.default_mode', { projectRoot, userDir });
    expect(r.found).toBe(true);
    expect(r.value).toBe('hybrid');
    expect(r.tier).toBe('project');
  });

  it('local tier shadows project shadows user (precedence local > project > user)', () => {
    seed(userDir, { search: { default_mode: 'keyword' } });
    seed(join(projectRoot, 'context'), { search: { default_mode: 'hybrid' } });
    seed(join(projectRoot, 'context.local'), { search: { default_mode: 'semantic' } });
    const r = configGet('search.default_mode', { projectRoot, userDir });
    expect(r.value).toBe('semantic');
    expect(r.tier).toBe('local');
  });

  it('falls through to a lower tier when higher tiers lack the key', () => {
    seed(userDir, { search: { default_mode: 'keyword' } });
    seed(join(projectRoot, 'context'), { other: { thing: 1 } }); // no search.default_mode
    const r = configGet('search.default_mode', { projectRoot, userDir });
    expect(r.value).toBe('keyword');
    expect(r.tier).toBe('user');
  });

  it('not-found is honest (not an empty-string lie)', () => {
    const r = configGet('search.nonexistent', { projectRoot, userDir });
    expect(r.found).toBe(false);
    expect(r.value).toBeUndefined();
  });

  it('missing settings files degrade to not-found, never throw', () => {
    const r = configGet('anything.here', { projectRoot, userDir });
    expect(r.found).toBe(false);
  });

  it('a MALFORMED settings file is treated as absent, never throws (the catch branch)', () => {
    writeFileSync(join(projectRoot, 'context', 'settings.json'), '{ not valid json', 'utf8');
    seed(userDir, { search: { default_mode: 'keyword' } });
    // Project tier is unparseable → skipped → falls through to user.
    const r = configGet('search.default_mode', { projectRoot, userDir });
    expect(r.found).toBe(true);
    expect(r.value).toBe('keyword');
    expect(r.tier).toBe('user');
  });
});

describe('Task 129 — configSet (Doors 1+2)', () => {
  it('writes a dotted key into the project tier by default, preserving siblings', () => {
    seed(join(projectRoot, 'context'), { search: { custom: 1 }, other: 'keep' });
    const r = configSet('search.default_mode', 'hybrid', { projectRoot, userDir });
    expect(r.ok).toBe(true);
    expect(r.tier).toBe('project');
    const written = JSON.parse(readFileSync(join(projectRoot, 'context', 'settings.json'), 'utf8'));
    expect(written.search.default_mode).toBe('hybrid');
    expect(written.search.custom).toBe(1); // sibling preserved (over-mutation guard)
    expect(written.other).toBe('keep');
  });

  it('writes to the local tier when tier:"local"', () => {
    const r = configSet('search.default_mode', 'semantic', { projectRoot, userDir, tier: 'local' });
    expect(r.ok).toBe(true);
    expect(r.tier).toBe('local');
    expect(existsSync(join(projectRoot, 'context.local', 'settings.json'))).toBe(true);
    expect(existsSync(join(projectRoot, 'context', 'settings.json'))).toBe(false); // project untouched
  });

  it('coerces obvious scalar types (true/false/number) but keeps strings as strings', () => {
    configSet('a.bool', 'true', { projectRoot, userDir });
    configSet('a.num', '42', { projectRoot, userDir });
    configSet('a.str', 'hybrid', { projectRoot, userDir });
    const s = JSON.parse(readFileSync(join(projectRoot, 'context', 'settings.json'), 'utf8'));
    expect(s.a.bool).toBe(true);
    expect(s.a.num).toBe(42);
    expect(s.a.str).toBe('hybrid');
  });

  it('set then get round-trips through the real files', () => {
    configSet('search.default_mode', 'hybrid', { projectRoot, userDir });
    expect(configGet('search.default_mode', { projectRoot, userDir }).value).toBe('hybrid');
  });

  it('rejects an empty/whitespace key', () => {
    const r = configSet('   ', 'x', { projectRoot, userDir });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/key/i);
  });

  it('rejects an unknown tier (the invalid-tier branch)', () => {
    const r = configSet('a.b', 'c', { projectRoot, userDir, tier: 'galaxy' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/tier must be one of/);
  });

  it('refuses prototype-pollution keys (__proto__/constructor/prototype) — skill-review blocking fix', () => {
    for (const bad of ['__proto__.polluted', 'a.__proto__.x', 'constructor.prototype.y', 'prototype.z']) {
      const r = configSet(bad, 'yes', { projectRoot, userDir });
      expect(r.ok, `key ${bad}`).toBe(false);
      expect(r.error).toMatch(/forbidden|prototype/i);
    }
    // The smoking gun: Object.prototype is NOT polluted.
    expect({}.polluted).toBeUndefined();
    // get + show-origin also refuse them (no read-side resolution either).
    expect(configGet('__proto__.polluted', { projectRoot, userDir }).found).toBe(false);
    expect(configShowOrigin('__proto__.x', { projectRoot, userDir }).found).toBe(false);
  });
});

describe('Task 129 — configShowOrigin (Door 1, the direnv lesson)', () => {
  it('lists every tier that defines the key, marking the winner + the shadowed', () => {
    seed(userDir, { search: { default_mode: 'keyword' } });
    seed(join(projectRoot, 'context'), { search: { default_mode: 'hybrid' } });
    const r = configShowOrigin('search.default_mode', { projectRoot, userDir });
    expect(r.found).toBe(true);
    expect(r.entries.length).toBe(2);
    // Highest-precedence first; the winner is project (local absent).
    expect(r.entries[0].tier).toBe('project');
    expect(r.entries[0].winner).toBe(true);
    expect(r.entries[0].value).toBe('hybrid');
    const userEntry = r.entries.find((e) => e.tier === 'user');
    expect(userEntry.winner).toBe(false);
    expect(userEntry.shadowedBy).toBe('project');
  });

  it('a key set in no tier reports found:false', () => {
    const r = configShowOrigin('search.default_mode', { projectRoot, userDir });
    expect(r.found).toBe(false);
    expect(r.entries).toEqual([]);
  });
});

describe('Task 129 — CLI wrappers (the dep-injected surface)', () => {
  afterEach(() => { process.exitCode = 0; });

  it('runConfigGet prints the value; missing key → exit 2 + stderr', () => {
    seed(join(projectRoot, 'context'), { search: { default_mode: 'hybrid' } });
    const out = [];
    const errs = [];
    runConfigGet('search.default_mode', { cwd: projectRoot, userDir, log: (m) => out.push(String(m)), logError: (m) => errs.push(String(m)) });
    expect(out.join('\n')).toBe('hybrid');

    runConfigGet('nope.here', { cwd: projectRoot, userDir, log: (m) => out.push(String(m)), logError: (m) => errs.push(String(m)) });
    expect(errs.join('\n')).toMatch(/not set in any tier/);
    expect(process.exitCode).toBe(2);
  });

  it('runConfigSet writes + confirms; --local routes to the local tier', () => {
    const out = [];
    runConfigSet('search.default_mode', 'hybrid', { cwd: projectRoot, userDir, log: (m) => out.push(String(m)), logError: () => {} });
    expect(out.join('\n')).toMatch(/project tier/);
    expect(configGet('search.default_mode', { projectRoot, userDir }).tier).toBe('project');

    runConfigSet('search.default_mode', 'semantic', { cwd: projectRoot, userDir, tier: 'local', log: (m) => out.push(String(m)), logError: () => {} });
    expect(configGet('search.default_mode', { projectRoot, userDir }).tier).toBe('local'); // local now shadows
  });

  it('runConfigShowOrigin prints the winner + shadowed lines', () => {
    seed(userDir, { search: { default_mode: 'keyword' } });
    seed(join(projectRoot, 'context'), { search: { default_mode: 'hybrid' } });
    const out = [];
    runConfigShowOrigin('search.default_mode', { cwd: projectRoot, userDir, log: (m) => out.push(String(m)), logError: () => {} });
    const text = out.join('\n');
    expect(text).toMatch(/project.*"hybrid"/);
    expect(text).toMatch(/user.*"keyword".*shadowed by project/);
  });

  it('runConfigShowOrigin on an unset key → exit 2 + stderr (the not-found branch)', () => {
    const errs = [];
    runConfigShowOrigin('nope.here', { cwd: projectRoot, userDir, log: () => {}, logError: (m) => errs.push(String(m)) });
    expect(errs.join('\n')).toMatch(/not set in any tier/);
    expect(process.exitCode).toBe(2);
  });

  it('runConfigSet surfaces a core error (empty key) → exit 2', () => {
    const errs = [];
    runConfigSet('   ', 'c', { cwd: projectRoot, userDir, log: () => {}, logError: (m) => errs.push(String(m)) });
    expect(errs.join('\n')).toMatch(/key is required/);
    expect(process.exitCode).toBe(2);
  });

  it('an unknown --tier flag maps safely to the project tier (handler coercion)', () => {
    // The handler maps any unrecognized tier flag → project (never an error
    // from the handler; configSet's own tier guard is the core-level check).
    const out = [];
    runConfigSet('a.b', 'c', { cwd: projectRoot, userDir, tier: 'galaxy', log: (m) => out.push(String(m)), logError: () => {} });
    expect(out.join('\n')).toMatch(/project tier/);
  });

  it('runConfigCli routes --show-origin to the resolver', () => {
    seed(join(projectRoot, 'context'), { search: { default_mode: 'hybrid' } });
    const out = [];
    runConfigCli({ showOrigin: 'search.default_mode', cwd: projectRoot, userDir, log: (m) => out.push(String(m)), logError: () => {} });
    expect(out.join('\n')).toMatch(/project.*"hybrid"/);
  });

  it('runConfigCli with no subcommand → exit 2 + guidance (the bare-parent branch)', () => {
    const errs = [];
    runConfigCli({ cwd: projectRoot, userDir, log: () => {}, logError: (m) => errs.push(String(m)) });
    expect(errs.join('\n')).toMatch(/specify a subcommand/);
    expect(process.exitCode).toBe(2);
  });
});
