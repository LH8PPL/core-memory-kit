// @doors: 1, 2, 3, 5
// Door 4 N/A: no message queue.

// Tests for Task 231 (D-337, security) — screen-then-mask ordering.
//
// The composition bug: both write paths ran maskPii (which STRIPS invisible/
// zero-width/bidi codepoints) BEFORE checkPoisonGuard, so the Task-70.4
// `injection_invisible_unicode` screen never saw the char whenever the privacy
// screen was on (the default since ADR-0019). The guard function was correct in
// isolation (cli-poison-guard.test.js) — the ORDER was the bug, which is why
// these tests drive the COMPOSED paths: the real `cmk remember` binary (Door 3,
// the exact PR5 cut-gate probe that caught it) and the memoryWrite/writeFact
// public boundaries in-process.
//
// The contract pinned here (sanitize → screen → mask):
//   1. sanitizePrivacyTags runs FIRST — user-marked <private> content is
//      removed by request; the guard must not reject content that never lands
//      (the C5 cut-gate contract).
//   2. checkPoisonGuard runs on the privacy-stripped, PRE-mask text — masking
//      destroys the guard's evidence (D-337).
//   3. maskPii runs LAST, only on writes that passed the screen — ordinary
//      PII (emails/usernames/home-paths) still masks and writes as before.
//
// Plus the exit-code half: runRememberRich never set process.exitCode on a
// writeFact error, so a rich-path poison rejection (or D-338's invalid
// --shape) exited 0 — undetectable by scripts. Rich errors now exit 2 like
// the bare path.
//
// NOTE on invisible chars in this file: built via \u escapes, never literal
// glyphs (the pii-patterns.mjs convention — literals are unreviewable and
// editor-mangleable).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { install } from '../packages/cli/src/install.mjs';
import { memoryWrite } from '../packages/cli/src/memory-write.mjs';
import { writeFact } from '../packages/cli/src/write-fact.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), '..');
const CMK_BIN = join(REPO_ROOT, 'packages', 'cli', 'bin', 'cmk.mjs');

const ZWSP = String.fromCharCode(0x200b); // zero-width space — the Task-70.4 hidden-instruction vector

let sandbox;
let projectRoot;
let userDir;

beforeEach(async () => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-stm-test-'));
  projectRoot = join(sandbox, 'proj');
  userDir = join(sandbox, 'user');
  await install({ projectRoot, userTier: userDir });
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

function cmk(args, input) {
  return spawnSync(process.execPath, [CMK_BIN, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    input,
    env: { ...process.env, MEMORY_KIT_USER_DIR: userDir },
  });
}

function memoryMd() {
  return readFileSync(join(projectRoot, 'context', 'MEMORY.md'), 'utf8');
}

function factFiles() {
  const dir = join(projectRoot, 'context', 'memory');
  return readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'INDEX.md' && f !== 'MAP.md');
}

function poisonLog() {
  const p = join(projectRoot, 'context', '.locks', 'poison-guard.log');
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}

describe('cmk remember rejects invisible unicode on the REAL composed path (Door 3 — the PR5 probe)', () => {
  it('bare remember with a genuine U+200B → exit 2, nothing written, redacted Door-5 log', () => {
    const text = `a normal looking note${ZWSP}with a hidden zero-width space`;
    // Real-input sanity: the codepoint must actually be in the argv string.
    expect([...text].some((c) => c.charCodeAt(0) === 0x200b)).toBe(true);

    const before = memoryMd();
    const r = cmk(['remember', text]);

    expect(r.status).toBe(2);
    expect(r.stderr).toContain('injection_invisible_unicode');
    // Door 2: nothing written anywhere.
    expect(memoryMd()).toBe(before);
    expect(factFiles()).toEqual([]);
    // Door 5: the NDJSON rejection line lands, span-redacted, never the raw text.
    const log = poisonLog();
    expect(log).toContain('injection_invisible_unicode');
    expect(log).toContain('***');
    expect(log).not.toContain(ZWSP);
  });

  it('RICH remember with U+200B → exit 2, no fact file (the rich path screened AND script-detectable)', () => {
    const text = `hidden${ZWSP}instruction vector in a rich fact`;
    const r = cmk([
      'remember', text,
      '--type', 'feedback',
      '--title', 'zwsp probe',
      '--why', 'screen-then-mask ordering',
    ]);

    expect(r.status).toBe(2);
    expect(r.stderr).toContain('Poison_Guard rejected write');
    expect(factFiles()).toEqual([]);
  });

  it('--json stdin channel with U+200B → exit 2, nothing written (the off-shell channel is screened too)', () => {
    const payload = JSON.stringify({
      text: `json channel${ZWSP}smuggle`,
      type: 'feedback',
      title: 'zwsp json probe',
      why: 'x',
    });
    const r = cmk(['remember', '--json'], payload);

    expect(r.status).toBe(2);
    expect(factFiles()).toEqual([]);
  });

  it('CONTROL: an ordinary-space variant of the same text writes fine (the guard discriminates)', () => {
    const r = cmk(['remember', 'a normal looking note with a hidden zero-width space']);
    expect(r.status).toBe(0);
    expect(memoryMd()).toContain('a normal looking note with a hidden zero-width space');
  });

  it('U+2063 (invisible separator) is ALSO rejected — the guard and mask catalogs share one list (skill-review finding 1)', () => {
    // Pre-fix: the mask's catalog had U+2062/63/64 (invisible math operators)
    // but the guard's did not — the exact silent-strip-and-write bypass
    // survived for those three codepoints. One shared list closes the drift.
    const invisibleSeparator = String.fromCharCode(0x2063);
    const r = cmk(['remember', `note${invisibleSeparator}hidden via invisible separator`]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('injection_invisible_unicode');
    expect(factFiles()).toEqual([]);
  });
});

describe('the mask layer still works on writes that PASS the screen (screen-then-mask, not screen-instead-of-mask)', () => {
  it('an email still masks and the write succeeds (L1 PII layer unharmed)', () => {
    const r = cmk(['remember', 'reach the maintainer at someone.real@gmail.com about the deploy']);
    expect(r.status).toBe(0);
    const md = memoryMd();
    expect(md).not.toContain('someone.real@gmail.com');
    expect(md).toContain('reach the maintainer at');
  });

  it('the C5 contract holds: a <private>-wrapped secret is stripped and the write PROCEEDS (guard runs after the privacy strip)', () => {
    const r = cmk([
      'remember',
      'deploy host is prod-7 <private>key sk-ant-api03-AAAArealishlookinglongtokenvalue0000</private> use the bastion',
    ]);
    expect(r.status).toBe(0);
    const md = memoryMd();
    expect(md).not.toContain('sk-ant-api03');
    expect(md).toContain('[private content redacted]');
  });

  it('a NON-keyword home path still masks and writes (the common C4 case is unaffected)', () => {
    // No credential keyword precedes the path, so the generic-credential
    // pattern cannot match; the path masks to `~` and the write proceeds.
    const r = cmk(['remember', 'the venv lives at /home/deploy/proj/.venv on the staging box']);
    expect(r.status).toBe(0);
    const md = memoryMd();
    expect(md).not.toContain('/home/deploy');
    expect(md).toContain('proj/.venv');
  });

  it('a keyword-adjacent POSIX path REJECTS — the sharpened-guard behavior, pinned deliberately (skill-review finding 2)', () => {
    // Screen-then-mask means the guard sees the RAW path where it used to see
    // the `~`-sanitized form. `password: /home/…20+chars` matches
    // secret_generic_credential — ACCEPTED as correct-conservative for a
    // security screen (the old pass-through only worked because sanitization
    // destroyed the evidence first). Docs qualify this; rephrasing the capture
    // ("the password file is under ~/vault") writes fine.
    const r = cmk(['remember', 'the deploy password: /home/deploy/vault-of-github-keys is on the bastion']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('Poison_Guard rejected write');
    expect(factFiles()).toEqual([]);
  });
});

describe('rich-path errors are script-detectable (the exit-code half; closes D-338)', () => {
  it('invalid --shape on the rich path → exit 2 (was exit 0 — D-338)', () => {
    const r = cmk([
      'remember', 'this should not write',
      '--shape', 'Banana',
      '--why', 'x',
      '--title', 'bad shape probe',
      '--type', 'project',
    ]);
    expect(r.status).toBe(2);
    expect(factFiles()).toEqual([]);
  });

  it('a rich-path title/content collision → exit 2 (error class, pinned)', () => {
    const first = cmk(['remember', 'original body', '--title', 'collision probe', '--type', 'project', '--why', 'x']);
    expect(first.status).toBe(0);
    const second = cmk(['remember', 'DIFFERENT body', '--title', 'collision probe', '--type', 'project', '--why', 'x']);
    expect(second.status).toBe(2);
  });
});

describe('composed-path ordering at the module boundaries (in-process)', () => {
  it('memoryWrite add: U+200B text → poison_guard error, scratchpad untouched, siblings preserved (over-mutation guard)', () => {
    // Seed one clean bullet first — the rejection must not disturb it.
    const seeded = memoryWrite({
      action: 'add',
      text: 'a clean pre-existing fact that must survive',
      tier: 'P',
      scratchpad: 'MEMORY.md',
      section: 'Active Threads',
      trust: 'high',
      source: 'user-explicit',
      projectRoot,
      userDir,
    });
    expect(seeded.action).toBe('appended');
    const before = memoryMd();

    const r = memoryWrite({
      action: 'add',
      text: `smuggled${ZWSP}payload`,
      tier: 'P',
      scratchpad: 'MEMORY.md',
      section: 'Active Threads',
      trust: 'high',
      source: 'user-explicit',
      projectRoot,
      userDir,
    });

    expect(r.action).toBe('error');
    expect(r.errorCategory).toBe('poison_guard');
    expect(r.pattern_id).toBe('injection_invisible_unicode');
    expect(memoryMd()).toBe(before); // the seeded fact + everything else untouched
  });

  // Shared provenance boilerplate — writeFact requires the source fields.
  const factProvenance = () => ({
    tier: 'P',
    projectRoot,
    userDir,
    writeSource: 'user-explicit',
    trust: 'high',
    sourceFile: 'user-explicit',
    sourceLine: 1,
    sourceSha1: 'a'.repeat(40),
  });

  it('writeFact: U+200B in the BODY → poison_guard error, no file', () => {
    const r = writeFact({
      ...factProvenance(),
      type: 'feedback',
      slug: 'zwsp-body-probe',
      title: 'zwsp body probe',
      body: `body carrying${ZWSP}an invisible`,
    });
    expect(r.action).toBe('error');
    expect(r.errorCategory).toBe('poison_guard');
    expect(factFiles()).toEqual([]);
  });

  it('writeFact: U+200B in the TITLE only → poison_guard error (the D-312 title side door stays closed pre-mask)', () => {
    const r = writeFact({
      ...factProvenance(),
      type: 'feedback',
      slug: 'zwsp-title-probe',
      title: `sneaky${ZWSP}title`,
      body: 'a perfectly ordinary body',
    });
    expect(r.action).toBe('error');
    expect(r.errorCategory).toBe('poison_guard');
    expect(factFiles()).toEqual([]);
  });
});
