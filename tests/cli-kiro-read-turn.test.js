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

// kiro-cli session — the DIFFERENT schema + location vs the IDE (D-199 gate
// finding): ~/.kiro/sessions/cli/<uuid>.json, matched by `cwd`, with the
// assistant text at session_state.conversation_metadata.user_turn_metadatas[]
//   .result.Ok.content[].data  (NO history[]; no CONTINUE_GLOBAL_DIR).
function seedCliSession(kiroHome, sessionId, { cwd, updatedAt, turns }) {
  const cliDir = join(kiroHome, '.kiro', 'sessions', 'cli');
  mkdirSync(cliDir, { recursive: true });
  const session = {
    session_id: sessionId,
    cwd,
    updated_at: updatedAt,
    session_state: {
      agent_name: 'cmk',
      conversation_metadata: {
        user_turn_metadatas: turns.map((data, i) => ({
          end_reason: 'UserTurnEnd',
          user_prompt_length: 50 + i,
          result: { Ok: { content: [{ kind: 'text', data }] } },
        })),
      },
    },
  };
  writeFileSync(join(cliDir, `${sessionId}.json`), JSON.stringify(session), 'utf8');
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

  it('returns empty when CONTINUE_GLOBAL_DIR is absent AND no CLI session exists', () => {
    // env.HOME points at an empty sandbox (no ~/.kiro/sessions/cli) → empty.
    const r = readKiroTurn({ projectRoot: PROJECT, env: { HOME: sandbox, USERPROFILE: sandbox } });
    expect(r.assistantText).toBe('');
  });
});

describe('readKiroTurn — kiro-cli fallback (D-199: CLI schema + ~/.kiro/sessions/cli)', () => {
  const CLI_PROJECT = 'C:\\Temp\\kiro-cli-cutgate';

  it('reads the latest assistant turn from a kiro-cli session matched by cwd', () => {
    // No CONTINUE_GLOBAL_DIR (the CLI never sets it) → must fall back to the CLI path.
    seedCliSession(sandbox, 's-cli', {
      cwd: CLI_PROJECT,
      updatedAt: '2026-06-24T20:35:30.000Z',
      turns: ['first reply', 'uv for packages, ruff before commit, every project'],
    });
    const r = readKiroTurn({
      projectRoot: CLI_PROJECT,
      env: { HOME: sandbox, USERPROFILE: sandbox },
    });
    expect(r.assistantText).toBe('uv for packages, ruff before commit, every project'); // the LAST turn
  });

  it('picks the most-recent CLI session for the cwd (by updated_at)', () => {
    seedCliSession(sandbox, 'old', { cwd: CLI_PROJECT, updatedAt: '2026-06-24T10:00:00.000Z', turns: ['old reply'] });
    seedCliSession(sandbox, 'new', { cwd: CLI_PROJECT, updatedAt: '2026-06-24T20:00:00.000Z', turns: ['new reply'] });
    const r = readKiroTurn({ projectRoot: CLI_PROJECT, env: { HOME: sandbox, USERPROFILE: sandbox } });
    expect(r.assistantText).toBe('new reply');
  });

  it('ignores CLI sessions whose cwd does NOT match the project (no cross-project leak)', () => {
    seedCliSession(sandbox, 'other', { cwd: 'C:\\Temp\\some-other-proj', updatedAt: '2026-06-24T20:00:00.000Z', turns: ['other project reply'] });
    const r = readKiroTurn({ projectRoot: CLI_PROJECT, env: { HOME: sandbox, USERPROFILE: sandbox } });
    expect(r.assistantText).toBe(''); // no session for THIS cwd
  });

  it('returns empty (no throw) on a malformed CLI session file', () => {
    const cliDir = join(sandbox, '.kiro', 'sessions', 'cli');
    mkdirSync(cliDir, { recursive: true });
    writeFileSync(join(cliDir, 'bad.json'), '{ not valid json', 'utf8');
    const r = readKiroTurn({ projectRoot: CLI_PROJECT, env: { HOME: sandbox, USERPROFILE: sandbox } });
    expect(r.assistantText).toBe('');
  });

  it('matches a session whose cwd differs only in drive-letter case / trailing slash', () => {
    // norm() lowercases + strips a trailing slash, so c:\Temp\proj\ ≡ C:\Temp\proj
    seedCliSession(sandbox, 's', { cwd: 'c:\\Temp\\kiro-cli-cutgate\\', updatedAt: '2026-06-24T20:00:00.000Z', turns: ['matched despite case+slash'] });
    const r = readKiroTurn({ projectRoot: 'C:\\Temp\\kiro-cli-cutgate', env: { HOME: sandbox, USERPROFILE: sandbox } });
    expect(r.assistantText).toBe('matched despite case+slash');
  });

  it('picks by parsed timestamp, robust to ISO precision drift (ms vs nanosecond)', () => {
    // lexical compare could mis-order mixed precision; Date.parse normalizes both.
    seedCliSession(sandbox, 'older-longprecision', { cwd: CLI_PROJECT, updatedAt: '2026-06-24T20:00:00.100000000Z', turns: ['older'] });
    seedCliSession(sandbox, 'newer-msprecision', { cwd: CLI_PROJECT, updatedAt: '2026-06-24T20:00:00.200Z', turns: ['newer'] });
    const r = readKiroTurn({ projectRoot: CLI_PROJECT, env: { HOME: sandbox, USERPROFILE: sandbox } });
    expect(r.assistantText).toBe('newer'); // .200 > .100 even though ".200Z" < ".100000000Z" lexically
  });

  it('returns empty when the latest turn is an Err result (no assistant text)', () => {
    // parseKiroCliSession reads the LAST turn's result.Ok.content; an Err last
    // turn (aborted/failed) yields no assistant text — documented contract.
    const cliDir = join(sandbox, '.kiro', 'sessions', 'cli');
    mkdirSync(cliDir, { recursive: true });
    const session = {
      cwd: CLI_PROJECT,
      updated_at: '2026-06-24T20:00:00.000Z',
      session_state: { conversation_metadata: { user_turn_metadatas: [
        { result: { Err: { reason: 'aborted' } } },
      ] } },
    };
    writeFileSync(join(cliDir, 'err.json'), JSON.stringify(session), 'utf8');
    const r = readKiroTurn({ projectRoot: CLI_PROJECT, env: { HOME: sandbox, USERPROFILE: sandbox } });
    expect(r.assistantText).toBe('');
  });

  it('prefers the IDE path when CONTINUE_GLOBAL_DIR IS set (IDE unaffected by the CLI fallback)', () => {
    // Seed BOTH an IDE session (for PROJECT) and a CLI session (for the same path);
    // with CONTINUE_GLOBAL_DIR set, the IDE path wins — the CLI fallback only fires
    // when the IDE path yields nothing.
    seedSession('ide', [{ message: { role: 'assistant', content: [{ type: 'text', text: 'ide answer' }] } }], '1000');
    seedCliSession(sandbox, 'cli', { cwd: PROJECT, updatedAt: '2026-06-24T20:00:00.000Z', turns: ['cli answer'] });
    const r = readKiroTurn({
      projectRoot: PROJECT,
      env: { CONTINUE_GLOBAL_DIR: globalDir, HOME: sandbox, USERPROFILE: sandbox },
    });
    expect(r.assistantText).toBe('ide answer');
  });
});
