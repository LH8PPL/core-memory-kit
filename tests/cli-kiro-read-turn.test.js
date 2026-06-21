// @doors: 1
// Door 2 N/A: readKiroTurn is a pure read of Kiro's transcript files; no writes.
// Door 3 N/A: no subprocess spawn.
// Door 4 N/A: no log emission.
// Door 5 N/A: no message-queue interaction.

// Tests for readKiroTurn — read the latest turn from Kiro's transcript.
//
// Composes the verified pieces: the globalStorage dir comes from env
// (CONTINUE_GLOBAL_DIR, given by Kiro to the hook — probe-verified P-CJYGTQYR);
// the workspace dir is base64url(projectRoot); the session JSON is parsed by
// parseKiroSessionHistory. Returns the latest user+assistant turn text.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readKiroTurn, workspaceKeyForPath } from '../packages/cli/src/kiro-transcript.mjs';

let sandbox;
let globalDir;
const PROJECT = 'c:\\Projects\\demo';

function seedSession(sessionId, history, dateCreated) {
  const wsDir = join(globalDir, 'workspace-sessions', workspaceKeyForPath(PROJECT));
  mkdirSync(wsDir, { recursive: true });
  writeFileSync(join(wsDir, `${sessionId}.json`), JSON.stringify({ sessionId, dateCreated, history }), 'utf8');
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'cmk-kiro-read-'));
  globalDir = join(sandbox, 'kiro.kiroagent');
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

describe('readKiroTurn — read the latest turn from Kiro transcript', () => {
  it('returns the latest user + assistant text for the project', () => {
    seedSession('s1', [
      { message: { role: 'user', content: [{ type: 'text', text: 'the question' }] } },
      { message: { role: 'assistant', content: [{ type: 'text', text: 'the answer' }] } },
    ], '1000');

    const r = readKiroTurn({ projectRoot: PROJECT, env: { CONTINUE_GLOBAL_DIR: globalDir } });
    expect(r.userText).toBe('the question');
    expect(r.assistantText).toBe('the answer');
  });

  it('picks the MOST RECENT session when several exist (by dateCreated)', () => {
    seedSession('old', [{ message: { role: 'assistant', content: [{ type: 'text', text: 'old answer' }] } }], '1000');
    seedSession('new', [{ message: { role: 'assistant', content: [{ type: 'text', text: 'new answer' }] } }], '2000');

    const r = readKiroTurn({ projectRoot: PROJECT, env: { CONTINUE_GLOBAL_DIR: globalDir } });
    expect(r.assistantText).toBe('new answer');
  });

  it('returns empty (no throw) when no transcript exists for the project', () => {
    const r = readKiroTurn({ projectRoot: PROJECT, env: { CONTINUE_GLOBAL_DIR: globalDir } });
    expect(r.assistantText).toBe('');
    expect(r.userText).toBe('');
  });

  it('returns empty when CONTINUE_GLOBAL_DIR is absent (no env → no crash)', () => {
    const r = readKiroTurn({ projectRoot: PROJECT, env: {} });
    expect(r.assistantText).toBe('');
  });
});
