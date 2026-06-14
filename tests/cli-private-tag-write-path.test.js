// @doors: 1, 2
// Door 2: asserts the ACTUAL files on disk (MEMORY.md bullet + fact file)
//   contain the redaction placeholder and NOT the secret — the user's
//   "check the files created" directive.
// Door 3 N/A: pure in-process writes.
// Door 4 N/A: no message-queue.
// Door 5 N/A: not an audited-shape concern here (the write succeeds normally).
//
// Cut-gate v0.3.1 finding: `<private>…</private>` was stripped only by the
// UserPromptSubmit hook (capture-prompt.mjs), NOT by the shared write
// boundaries. So `cmk remember "...<private>X</private>..."` /
// `mk_remember` / auto-extract / import wrote the secret VERBATIM into
// committed memory. The design.md comment claiming write-fact already
// stripped it was stale. Fix: sanitizePrivacyTags runs FIRST in both
// memoryWrite (terse bullet) and writeFact (fact file), on ALL tiers
// (private content shouldn't reach even the local tier).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { memoryWrite } from '../packages/cli/src/memory-write.mjs';
import { writeFact } from '../packages/cli/src/write-fact.mjs';
import { REDACTED_PLACEHOLDER } from '../packages/cli/src/privacy.mjs';
import { install } from '../packages/cli/src/install.mjs';

let sandbox;
let projectRoot;
let userDir;

const SECRET = 'SUPER_SECRET_VALUE_xyz';

beforeEach(async () => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-private-tag-'));
  projectRoot = join(sandbox, 'proj');
  userDir = join(sandbox, 'user');
  await install({ projectRoot, userTier: userDir });
});

afterEach(() => rmSync(sandbox, { recursive: true, force: true }));

function memoryMd() {
  const p = join(projectRoot, 'context', 'MEMORY.md');
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}
function factFiles() {
  const dir = join(projectRoot, 'context', 'memory');
  return existsSync(dir)
    ? readdirSync(dir).filter((n) => n.endsWith('.md') && n !== 'INDEX.md')
    : [];
}

describe('Task: <private> stripped on the terse memoryWrite path (Doors 1+2)', () => {
  it('the secret never reaches the MEMORY.md bullet — placeholder instead', () => {
    const r = memoryWrite({
      action: 'add',
      tier: 'P',
      text: `deploy note: my key is <private>${SECRET}</private> ok`,
      scratchpad: 'MEMORY.md',
      section: 'Active Threads',
      source: 'user-explicit',
      projectRoot,
      userDir,
      now: '2026-06-14T10:00:00Z',
    });
    expect(r.action).toBe('appended');
    const mem = memoryMd();
    // The user's directive: CHECK THE FILE.
    expect(mem).not.toContain(SECRET);
    expect(mem).toContain(REDACTED_PLACEHOLDER);
    expect(mem).toContain('deploy note'); // the non-private prose survives
  });

  it('strips on the LOCAL tier too (private content must not reach context.local either)', () => {
    memoryWrite({
      action: 'add',
      tier: 'L',
      text: `<private>${SECRET}</private>`,
      scratchpad: 'machine-paths.md',
      section: 'Paths',
      source: 'user-explicit',
      projectRoot,
      userDir,
      now: '2026-06-14T10:00:00Z',
    });
    const p = join(projectRoot, 'context.local', 'machine-paths.md');
    const content = existsSync(p) ? readFileSync(p, 'utf8') : '';
    expect(content).not.toContain(SECRET);
  });
});

describe('Task: <private> stripped on the writeFact (fact file) path (Doors 1+2)', () => {
  it('the secret never reaches the fact file — placeholder in the body + filename safe', () => {
    const r = writeFact({
      tier: 'P',
      type: 'project',
      slug: 'deploy-config',
      title: 'deploy config',
      body: `the deploy gate runs; secret <private>${SECRET}</private>`,
      writeSource: 'user-explicit',
      trust: 'high',
      sourceFile: 'test',
      sourceLine: 1,
      sourceSha1: 'abc',
      projectRoot,
    });
    expect(r.action).toBe('created');
    // CHECK THE FILE that was created.
    const files = factFiles();
    const created = files.find((n) => readFileSync(join(projectRoot, 'context', 'memory', n), 'utf8').includes('deploy gate'));
    expect(created).toBeTruthy();
    const content = readFileSync(join(projectRoot, 'context', 'memory', created), 'utf8');
    expect(content).not.toContain(SECRET);
    expect(content).toContain(REDACTED_PLACEHOLDER);
    // And nothing leaked into MEMORY.md or INDEX.md.
    expect(memoryMd()).not.toContain(SECRET);
    const index = readFileSync(join(projectRoot, 'context', 'memory', 'INDEX.md'), 'utf8');
    expect(index).not.toContain(SECRET);
  });

  it('id is computed from the REDACTED body (dedup keys on what lands, not the secret)', () => {
    const withSecret = writeFact({
      tier: 'P', type: 'project', slug: 'a', title: 'a',
      body: `x <private>${SECRET}</private>`,
      writeSource: 'user-explicit', trust: 'high', sourceFile: 't', sourceLine: 1, sourceSha1: 'a', projectRoot,
    });
    const withPlaceholder = writeFact({
      tier: 'P', type: 'project', slug: 'b', title: 'b',
      body: `x ${REDACTED_PLACEHOLDER}`,
      writeSource: 'user-explicit', trust: 'high', sourceFile: 't', sourceLine: 1, sourceSha1: 'a', projectRoot,
    });
    // Same post-redaction body → same content-addressed id.
    expect(withSecret.id).toBe(withPlaceholder.id);
  });
});
