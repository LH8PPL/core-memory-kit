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
import { rememberRich } from '../packages/cli/src/remember-core.mjs';
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
    ? readdirSync(dir).filter((n) => n.endsWith('.md') && n !== 'INDEX.md' && n !== 'MAP.md')
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

  // Cut-gate v0.3.1 (clean-build re-run) finding: the title is derived from the
  // raw text and sliced to 80 chars BEFORE the privacy strip. When the slice
  // lands INSIDE a <private>…</private> span it severs the closing tag, so
  // sanitizePrivacyTags' `<private>[\s\S]*?</private>` regex no longer matches
  // and the secret survives in the title (frontmatter + INDEX.md). The fix
  // strips in rememberRich BEFORE deriving/slicing the title.
  it('rememberRich: a <private> tag whose CLOSING tag is severed by the 80-char title slice still does not leak', () => {
    // The cut-gate's exact shape. `pw0` is a short secret positioned so it
    // survives the 80-char title cut INTACT while the closing </private> is
    // severed (→ "</priv") — so the strip regex can't match the broken span.
    // The secret must still not reach the title (frontmatter + INDEX.md).
    const pw = 'hunterSEKRET';
    const text = `note ${'x'.repeat(24)} <private>${pw} and more words here</private> tail`;
    // Guard the fixture itself: the secret must survive the 80-char cut INTACT
    // while the closing </private> is SEVERED (so the strip regex can't match
    // the broken span) — otherwise the test wouldn't exercise the bug.
    const titleSlice = text.slice(0, 80);
    expect(titleSlice).toContain(pw);
    expect(titleSlice).toContain('<private>');
    expect(titleSlice).not.toContain('</private>');
    const r = rememberRich(text, { type: 'project' }, { projectRoot });
    expect(r.action).toBe('created');
    const files = factFiles();
    expect(files.length).toBeGreaterThan(0);
    for (const n of files) {
      const content = readFileSync(join(projectRoot, 'context', 'memory', n), 'utf8');
      expect(content).not.toContain(pw); // body AND the frontmatter title
    }
    const index = readFileSync(join(projectRoot, 'context', 'memory', 'INDEX.md'), 'utf8');
    expect(index).not.toContain(pw);
  });

  // F-V0.3.3-2 (cut-gate C4): the username leaked into the fact FILENAME +
  // INDEX when no --title was given. The body was home-path-sanitized
  // (C:\Users\you → ~) but the slug was derived from the raw title BEFORE
  // sanitizeHomePaths ran — same ordering bug the v0.3.1 fix above closed for
  // <private>, missed for home paths. A committed filename carrying the real
  // username is a public-repo leak. Fix: sanitizeHomePaths before slugifyFact.
  it('rememberRich: a home-dir path in the text never leaks the username into the filename or INDEX', () => {
    const user = 'alice-mcphersonsh'; // a realistic username token (NOT the maintainer's)
    const text = `venv at C:\\Users\\${user}\\proj\\.venv`;
    // Fixture self-guard: the input MUST actually contain the raw username (a
    // single real backslash + the interpolated name), else the test would pass
    // vacuously — the trap that nearly shipped this fix unverified.
    expect(text).toContain(`\\Users\\${user}\\`);
    expect(text).toContain(user);
    const r = rememberRich(text, { type: 'project' }, { projectRoot });
    expect(r.action).toBe('created');

    const files = factFiles();
    expect(files.length).toBeGreaterThan(0);
    // The username must appear in NO committed filename …
    for (const n of files) {
      expect(n).not.toContain(user);
      // … nor anywhere inside the fact body / frontmatter title.
      const content = readFileSync(join(projectRoot, 'context', 'memory', n), 'utf8');
      expect(content).not.toContain(user);
      // The path IS still captured — abstracted to ~ (recovery + portability).
      expect(content).toContain('~');
    }
    // … nor in the INDEX (which embeds the filename in its link target).
    const index = readFileSync(join(projectRoot, 'context', 'memory', 'INDEX.md'), 'utf8');
    expect(index).not.toContain(user);
    // … nor in the scratchpad.
    expect(memoryMd()).not.toContain(user);
  });

  it('rememberRich: home-path sanitize also applies when an explicit --title carries the username', () => {
    const user = 'bob-qzxnadeveloper';
    const r = rememberRich('some deploy note', {
      type: 'project',
      title: `paths under C:\\Users\\${user}\\app`,
    }, { projectRoot });
    expect(r.action).toBe('created');
    for (const n of factFiles()) {
      expect(n).not.toContain(user);
      expect(readFileSync(join(projectRoot, 'context', 'memory', n), 'utf8')).not.toContain(user);
    }
    expect(readFileSync(join(projectRoot, 'context', 'memory', 'INDEX.md'), 'utf8')).not.toContain(user);
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
