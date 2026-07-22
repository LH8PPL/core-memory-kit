// @doors: 2, 3
// Door 2: the STATE proof — which context/ tier the write lands in on disk.
//   This is the whole point: the bug was a write to the wrong tier.
// Door 3: drives the REAL bin as a subprocess (spawnSync) with a real cwd +
//   real stdin payload — the only layer that can see the cwd-resolution bug,
//   which an in-process unit test with an injected projectRoot structurally
//   cannot (that is exactly why the bug shipped). No LLM spawn → Door 3.5 N/A.
// Door 1 N/A: the bin's stdout is the hook envelope, asserted elsewhere; here
//   the observable contract is the file location, not the return value.
// Door 4 N/A: no message-queue interaction.
// Door 5 N/A: the observation log itself IS the Door-2 artifact under test.

// Task 246 — the live proof that the capture hooks resolve the REAL project
// root, not bare process.cwd(). The bug: run from a SUBDIRECTORY, the bins
// forked a stray context/ tier THERE and wrote to it, unread. This test runs
// the real cmk-observe-edit bin with cwd set to a subdirectory of a project
// and asserts the observation lands in the ROOT tier — the D-303
// unit-green/integration-broken class, closed with a real subprocess.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const BIN = join(REPO, 'packages', 'cli', 'bin', 'cmk-observe-edit.mjs');
const PRECOMPACT_BIN = join(REPO, 'packages', 'cli', 'bin', 'cmk-precompact.mjs');

// A payload observe-edit acts on: an eligible tool + a >50-line response.
function bigWritePayload(filePath) {
  return JSON.stringify({
    tool_name: 'Write',
    tool_input: { file_path: filePath },
    tool_response: { content: Array.from({ length: 60 }, (_, i) => `line ${i}`).join('\n') },
  });
}

let proj;
let subdir;
beforeEach(() => {
  proj = mkdtempSync(join(tmpdir(), 'cmk-hook-root-'));
  mkdirSync(join(proj, 'context', 'sessions'), { recursive: true }); // the REAL tier
  subdir = join(proj, 'packages', 'cli', 'src'); // the cwd that used to fork a stray tier
  mkdirSync(subdir, { recursive: true });
});
afterEach(() => {
  rmSync(proj, { recursive: true, force: true });
});

// The env the bin sees must NOT carry a project dir from the OUTER test run —
// this repo's own CLAUDE_PROJECT_DIR/CMK_PROJECT_DIR would otherwise pre-answer
// the resolution and hide the walk. Strip both so the discovery walk is exercised.
function cleanEnv(extra = {}) {
  const e = { ...process.env };
  delete e.CLAUDE_PROJECT_DIR;
  delete e.CMK_PROJECT_DIR;
  return { ...e, ...extra };
}

describe('capture-hook bin resolves the real project root (Task 246, live)', () => {
  it('THE FIX: run from a SUBDIRECTORY, the write lands in the ROOT tier — not a stray one', () => {
    const r = spawnSync(process.execPath, [BIN], {
      input: bigWritePayload(join(subdir, 'fact-store.mjs')),
      cwd: subdir, // the smoking-gun condition
      env: cleanEnv(), // no env shortcut — force the walk-up
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(r.status).toBe(0); // hooks always exit 0

    // STATE: the observation is in the ROOT tier...
    const rootNow = join(proj, 'context', 'sessions', 'now.md');
    expect(existsSync(rootNow)).toBe(true);
    expect(readFileSync(rootNow, 'utf8')).toMatch(/Write file=/);

    // ...and NO stray tier was forked at the subdirectory cwd (the bug).
    expect(existsSync(join(subdir, 'context'))).toBe(false);
  });

  it('CLAUDE_PROJECT_DIR still wins — the host\'s answer is honored over the walk', () => {
    const r = spawnSync(process.execPath, [BIN], {
      input: bigWritePayload(join(subdir, 'x.mjs')),
      cwd: subdir,
      env: cleanEnv({ CLAUDE_PROJECT_DIR: proj }),
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(r.status).toBe(0);
    expect(existsSync(join(proj, 'context', 'sessions', 'now.md'))).toBe(true);
    expect(existsSync(join(subdir, 'context'))).toBe(false);
  });
});

describe('cmk-precompact resolves the real root too (Task 246 review — the hook the grep missed)', () => {
  // PreCompact writes context/.locks/precompact.log UNCONDITIONALLY on every
  // fire (before any gate/spawn), so a subdirectory cwd forked a stray tier
  // there just like the capture bins. The done-criteria grep for
  // `projectRoot: process.cwd()` could not see it — precompact wrote the
  // vulnerable value as a `?? process.cwd()` fallback. Same live proof.
  it('run from a SUBDIRECTORY, the precompact log lands in the ROOT tier — no stray', () => {
    const r = spawnSync(process.execPath, [PRECOMPACT_BIN], {
      input: JSON.stringify({ trigger: 'auto', cwd: subdir, session_id: 's', transcript_path: 't' }),
      cwd: subdir,
      env: cleanEnv(), // force the walk
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(r.status).toBe(0); // never blocks compaction
    // The unconditional log write landed at the ROOT, and no stray tier at the subdir.
    expect(existsSync(join(proj, 'context', '.locks'))).toBe(true);
    expect(existsSync(join(subdir, 'context'))).toBe(false);
  });
});
