// @doors: 1, 2
// Door 3 N/A: no subprocess spawn — capturePrompt appends to a file in-process.
// Door 4 N/A: capturePrompt has no NDJSON observability surface of its own.
// Door 5 N/A: no message-queue interaction.

// Integration test for 50.N.1 — the kiro prompt-capture path END TO END:
// runHook('userPromptSubmit') → dispatcher → real capturePrompt core → the
// prompt is appended to context/transcripts/<date>.md with <private> blocks
// STRIPPED before the write. This is the full integration the unit tests
// (which inject a fake capturePrompt) can't cover — it exercises the real
// privacy-strip on the real disk path.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runHook } from '../packages/cli/src/subcommands.mjs';

let sandbox;
beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-kiro-promptcap-'));
});
afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

function transcriptBody() {
  const dir = join(sandbox, 'context', 'transcripts');
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  if (files.length === 0) return null;
  return readFileSync(join(dir, files[0]), 'utf8');
}

describe('50.N.1 — kiro prompt-capture integration (private-strip on the real path)', () => {
  it('appends the prompt to the transcript with <private> content STRIPPED', () => {
    runHook('userPromptSubmit', {}, undefined, {
      cwd: sandbox,
      env: {},
      payload: { prompt: 'use port 8080 <private>the secret is hunter2</private> for the server' },
      log: () => {},
      logError: () => {},
    });
    const body = transcriptBody();
    expect(body).not.toBeNull();
    // the prompt body landed...
    expect(body).toContain('use port 8080');
    expect(body).toContain('for the server');
    // ...but the private content was stripped before the write (Door 2 — state)
    expect(body).not.toContain('hunter2');
    expect(body).not.toContain('the secret is');
  });

  it('captures a normal prompt (no private tags) verbatim', () => {
    runHook('userPromptSubmit', {}, undefined, {
      cwd: sandbox,
      env: {},
      payload: { prompt: 'always use uv for packages, never pip' },
      log: () => {},
      logError: () => {},
    });
    expect(transcriptBody()).toContain('always use uv for packages, never pip');
  });

  it('APPENDS a second prompt — the first is preserved (over-mutation guard, Door 2)', () => {
    const call = (prompt) => runHook('userPromptSubmit', {}, undefined, {
      cwd: sandbox, env: {}, payload: { prompt }, log: () => {}, logError: () => {},
    });
    call('first prompt about ports');
    call('second prompt about uv');
    const body = transcriptBody();
    // BOTH entries survive, in order — appendFileSync, not overwrite.
    expect(body).toContain('first prompt about ports');
    expect(body).toContain('second prompt about uv');
    expect(body.indexOf('first prompt')).toBeLessThan(body.indexOf('second prompt'));
    // two distinct `## … — user` entries
    expect((body.match(/— user/g) || []).length).toBe(2);
  });

  it('an empty prompt writes no transcript (noop, no empty file)', () => {
    runHook('userPromptSubmit', {}, undefined, {
      cwd: sandbox,
      env: {},
      payload: { prompt: '' },
      log: () => {},
      logError: () => {},
    });
    expect(transcriptBody()).toBeNull();
  });
});
